import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { FormStatus } from "@/generated/prisma/enums";
import type { TenantContext } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { writeAuditLog } from "@/server/audit/write";
import { normalizeName } from "@/lib/normalize";
import type { FieldInput, FormInput, FormSettingsInput } from "@/features/forms/schemas";
import {
  deleteFormField,
  deleteFormRow,
  findForm,
  findPublishedFormByPublicId,
  insertForm,
  insertFormField,
  listForms,
  listFormNotifyCandidates,
  listFormSubmissions,
  reorderFormFields,
  updateFormField,
  updateFormRow,
} from "@/server/repositories/forms";

export class FormValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "FormValidationError";
  }
}

/**
 * URL-safe public slug for /f/{publicId}. ~43 bits of entropy; the unique
 * index plus the retry loop in createForm handles the (astronomically rare)
 * collision.
 */
function newPublicId(): string {
  return randomBytes(6).toString("base64url");
}

async function generateUniquePublicId(): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = newPublicId();
    const existing = await prisma.form.findUnique({
      where: { publicId: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new FormValidationError("Could not generate a form link. Try again.");
}

export async function createForm(context: TenantContext, input: FormInput) {
  return prisma.$transaction(async (tx) => {
    // Pre-generate outside the row insert so a slug retry doesn't abort the tx.
    const publicId = await generateUniquePublicId();
    const form = await insertForm(
      context,
      randomUUID(),
      publicId,
      normalizeName(input.name),
      tx,
    );
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "form.create",
      entityType: "Form",
      entityId: form.id,
    });
    return form;
  });
}

async function loadForm(context: TenantContext, formId: string, tx: Prisma.TransactionClient) {
  const form = await findForm(context, formId, tx);
  if (!form) {
    throw new FormValidationError("Form not found.");
  }
  return form;
}

/**
 * Editions are blocked on published forms to keep the public renderer's
 * payload stable while it collects submissions.
 */
function assertEditable(form: { status: FormStatus }) {
  if (form.status !== "DRAFT") {
    throw new FormValidationError(
      "Pause the form before editing its fields.",
    );
  }
}

export async function updateFormSettings(
  context: TenantContext,
  formId: string,
  input: FormSettingsInput,
  notifyUserIds: string[],
) {
  return prisma.$transaction(async (tx) => {
    await loadForm(context, formId, tx);

    if (notifyUserIds.length > 0) {
      const memberships = await tx.subAccountMembership.count({
        where: {
          subAccountId: context.subAccountId,
          status: "ACTIVE",
          userId: { in: notifyUserIds },
        },
      });
      if (memberships !== notifyUserIds.length) {
        throw new FormValidationError("Notify recipients must be members of this workspace.");
      }
    }

    const updated = await updateFormRow(
      context,
      formId,
      {
        name: normalizeName(input.name),
        submitLabel: input.submitLabel,
        successMessage: input.successMessage,
        redirectUrl: input.redirectUrl,
        consentText: input.consentText,
        autoTags: input.autoTags,
        notifyUserIds,
      },
      tx,
    );
    if (!updated) {
      throw new FormValidationError("Form not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "form.update",
      entityType: "Form",
      entityId: formId,
    });
    return updated;
  });
}

export async function setFormStatus(
  context: TenantContext,
  formId: string,
  status: Exclude<FormStatus, "ARCHIVED">,
) {
  return prisma.$transaction(async (tx) => {
    const form = await loadForm(context, formId, tx);
    if (status === "ACTIVE" && form.fields.length === 0) {
      throw new FormValidationError("Add at least one field before publishing.");
    }
    const updated = await updateFormRow(context, formId, { status }, tx);
    if (!updated) {
      throw new FormValidationError("Form not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: status === "ACTIVE" ? "form.publish" : "form.pause",
      entityType: "Form",
      entityId: formId,
      metadata: { publicId: form.publicId },
    });
    return updated;
  });
}

export async function deleteForm(context: TenantContext, formId: string) {
  return prisma.$transaction(async (tx) => {
    const count = await deleteFormRow(context, formId, tx);
    if (count === 0) {
      throw new FormValidationError("Form not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "form.delete",
      entityType: "Form",
      entityId: formId,
    });
    return true;
  });
}

export async function addField(context: TenantContext, formId: string, input: FieldInput) {
  return prisma.$transaction(async (tx) => {
    const form = await loadForm(context, formId, tx);
    assertEditable(form);
    if (form.fields.some((field) => field.name === input.name)) {
      throw new FormValidationError(`The field key "${input.name}" is already in use.`);
    }
    const field = await insertFormField(
      formId,
      {
        label: input.label,
        name: input.name,
        type: input.type,
        required: input.required,
        placeholder: input.placeholder,
        helpText: input.helpText,
        options: input.type === "DROPDOWN" ? input.options : [],
        position: form.fields.length,
      },
      tx,
    );
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "form.field.create",
      entityType: "FormField",
      entityId: field.id,
      metadata: { formId },
    });
    return field;
  });
}

export async function editField(context: TenantContext, fieldId: string, input: FieldInput) {
  return prisma.$transaction(async (tx) => {
    // Field updates go through the parent form so visibility states stay consistent.
    const existing = await tx.formField.findFirst({
      where: { id: fieldId, form: { subAccountId: context.subAccountId } },
      select: { id: true, name: true, formId: true },
    });
    if (!existing) {
      throw new FormValidationError("Field not found.");
    }
    const form = await loadForm(context, existing.formId, tx);
    assertEditable(form);
    if (
      form.fields.some(
        (field) => field.name === input.name && field.id !== existing.id,
      )
    ) {
      throw new FormValidationError(`The field key "${input.name}" is already in use.`);
    }
    const field = await updateFormField(
      context,
      fieldId,
      {
        label: input.label,
        name: input.name,
        type: input.type,
        required: input.required,
        placeholder: input.placeholder,
        helpText: input.helpText,
        options: input.type === "DROPDOWN" ? input.options : [],
      },
      tx,
    );
    if (!field) {
      throw new FormValidationError("Field not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "form.field.update",
      entityType: "FormField",
      entityId: fieldId,
      metadata: { formId: existing.formId },
    });
    return field;
  });
}

export async function removeField(context: TenantContext, fieldId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.formField.findFirst({
      where: { id: fieldId, form: { subAccountId: context.subAccountId } },
      select: { id: true, formId: true, position: true },
    });
    if (!existing) {
      throw new FormValidationError("Field not found.");
    }
    const form = await loadForm(context, existing.formId, tx);
    assertEditable(form);
    const deleted = await deleteFormField(context, fieldId, tx);
    if (!deleted) {
      throw new FormValidationError("Field not found.");
    }
    const remaining = form.fields
      .filter((field) => field.id !== fieldId)
      .map((field) => field.id);
    await reorderFormFields(existing.formId, remaining, tx);
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "form.field.delete",
      entityType: "FormField",
      entityId: fieldId,
      metadata: { formId: existing.formId },
    });
    return true;
  });
}

export async function reorderFields(context: TenantContext, formId: string, fieldIds: string[]) {
  return prisma.$transaction(async (tx) => {
    const form = await loadForm(context, formId, tx);
    assertEditable(form);
    const present = new Set(form.fields.map((field) => field.id));
    if (fieldIds.some((fieldId) => !present.has(fieldId))) {
      throw new FormValidationError("Those fields do not belong to this form.");
    }
    if (fieldIds.length !== form.fields.length) {
      throw new FormValidationError("Reorder every field at once.");
    }
    await reorderFormFields(formId, fieldIds, tx);
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "form.field.reorder",
      entityType: "Form",
      entityId: formId,
    });
    return true;
  });
}

export async function getForms(context: TenantContext) {
  if (!hasPermission(context.role, "forms.read")) {
    return [];
  }
  return listForms(context);
}

/**
 * Swaps a field one slot up/down by re-writing positions in list order.
 */
export async function moveField(
  context: TenantContext,
  fieldId: string,
  direction: "up" | "down",
) {
  return prisma.$transaction(async (tx) => {
    const field = await tx.formField.findFirst({
      where: { id: fieldId, form: { subAccountId: context.subAccountId } },
      select: { id: true, formId: true },
    });
    if (!field) {
      throw new FormValidationError("Field not found.");
    }
    const form = await loadForm(context, field.formId, tx);
    assertEditable(form);
    const ordered = [...form.fields].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((entry) => entry.id === fieldId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= ordered.length) {
      return null; // already at edge — nothing to do (not an error)
    }
    const reordered = [...ordered];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapWith, 0, moved);
    await reorderFormFields(
      field.formId,
      reordered.map((entry) => entry.id),
      tx,
    );
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "form.field.reorder",
      entityType: "Form",
      entityId: field.formId,
      metadata: { fieldId },
    });
    return true;
  });
}

export async function getFormDetail(context: TenantContext, formId: string) {
  const form = await findForm(context, formId);
  if (!form || !hasPermission(context.role, "forms.read")) {
    return null;
  }
  return form;
}

export async function getFormSubmissions(context: TenantContext, formId: string) {
  const form = await findForm(context, formId);
  if (!form || !hasPermission(context.role, "forms.read")) {
    return null;
  }
  return listFormSubmissions(context, formId);
}

export async function getNotifyCandidates(context: TenantContext) {
  return listFormNotifyCandidates(context);
}

/**
 * Read path for the public renderer: returns an ACTIVE form + its fields for
 * an anonymous visitor, or null when the slug is unknown/unpublished.
 */
export async function getPublishedForm(publicId: string) {
  return findPublishedFormByPublicId(publicId);
}
