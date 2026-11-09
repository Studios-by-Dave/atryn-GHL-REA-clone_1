"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ForbiddenError } from "@/server/auth/errors";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import type { FormActionState } from "@/features/forms/action-state";
import {
  fieldInputSchema,
  fieldUpdateSchema,
  formInputSchema,
  formSettingsSchema,
} from "@/features/forms/schemas";
import {
  FormValidationError,
  addField,
  createForm,
  deleteForm,
  editField,
  moveField,
  removeField,
  reorderFields,
  setFormStatus,
  updateFormSettings,
} from "@/server/services/forms";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function tenantFromForm(formData: FormData) {
  const parsed = z.uuid().safeParse(readString(formData, "subAccountId"));
  if (!parsed.success) {
    throw new ForbiddenError();
  }
  return {
    subAccountId: parsed.data,
    context: await requireTenantContext(parsed.data),
  };
}

function uuidFromForm(formData: FormData, name: string): string {
  const parsed = z.uuid().safeParse(readString(formData, name));
  if (!parsed.success) {
    throw new ForbiddenError();
  }
  return parsed.data;
}

function formsPath(subAccountId: string, formId = ""): string {
  return `/s/${subAccountId}/forms${formId ? `/${formId}` : ""}`;
}

function buildErrorState(error: unknown): Promise<FormActionState> | FormActionState {
  if (error instanceof FormValidationError) {
    return { error: error.message };
  }
  throw error;
}

function fieldPayload(formData: FormData) {
  return {
    label: readString(formData, "label"),
    name: readString(formData, "name"),
    type: readString(formData, "type") || "TEXT",
    required: formData.get("required"),
    placeholder: readString(formData, "placeholder"),
    helpText: readString(formData, "helpText"),
    options: readString(formData, "options"),
  };
}

function collectNotifyUserIds(formData: FormData): string[] {
  const ids = formData
    .getAll("notifyUserIds")
    .filter((value): value is string => typeof value === "string")
    .filter((id) => z.uuid().safeParse(id).success);
  return Array.from(new Set(ids)).slice(0, 50);
}

export async function createFormAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "forms.write");

  const parsed = formInputSchema.safeParse({ name: readString(formData, "name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form name." };
  }

  try {
    const form = await createForm(context, parsed.data);
    revalidatePath(formsPath(subAccountId));
    redirect(formsPath(subAccountId, form.id));
  } catch (error) {
    return buildErrorState(error);
  }
}

export async function updateFormSettingsAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "forms.write");
  const formId = uuidFromForm(formData, "formId");

  const parsed = formSettingsSchema.safeParse({
    name: readString(formData, "name"),
    submitLabel: readString(formData, "submitLabel"),
    successMessage: readString(formData, "successMessage"),
    redirectUrl: readString(formData, "redirectUrl"),
    consentText: readString(formData, "consentText"),
    autoTags: readString(formData, "autoTags"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form settings." };
  }

  try {
    await updateFormSettings(
      context,
      formId,
      parsed.data,
      collectNotifyUserIds(formData),
    );
    revalidatePath(formsPath(subAccountId, formId));
    return { error: null };
  } catch (error) {
    return buildErrorState(error);
  }
}

export async function setFormStatusAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "forms.write");
  const formId = uuidFromForm(formData, "formId");

  const target = readString(formData, "status");
  if (target !== "ACTIVE" && target !== "PAUSED") {
    return { error: "Unknown form state." };
  }

  try {
    await setFormStatus(context, formId, target);
    revalidatePath(formsPath(subAccountId, formId));
    revalidatePath(formsPath(subAccountId));
    return { error: null };
  } catch (error) {
    return buildErrorState(error);
  }
}

export async function deleteFormAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "forms.delete");
  const formId = uuidFromForm(formData, "formId");

  await deleteForm(context, formId);
  revalidatePath(formsPath(subAccountId));
  redirect(formsPath(subAccountId));
}

export async function addFieldAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "forms.write");
  const formId = uuidFromForm(formData, "formId");

  const parsed = fieldInputSchema.safeParse(fieldPayload(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the field details." };
  }

  try {
    await addField(context, formId, parsed.data);
    revalidatePath(formsPath(subAccountId, formId));
    return { error: null };
  } catch (error) {
    return buildErrorState(error);
  }
}

export async function updateFieldAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "forms.write");
  const formId = uuidFromForm(formData, "formId");
  const fieldId = uuidFromForm(formData, "fieldId");

  const parsed = fieldUpdateSchema.safeParse(fieldPayload(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the field details." };
  }

  try {
    await editField(context, fieldId, parsed.data);
    revalidatePath(formsPath(subAccountId, formId));
    return { error: null };
  } catch (error) {
    return buildErrorState(error);
  }
}

export async function deleteFieldAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "forms.write");
  const formId = uuidFromForm(formData, "formId");

  await removeField(context, uuidFromForm(formData, "fieldId"));
  revalidatePath(formsPath(subAccountId, formId));
}

/**
 * Plain form action (no error surface needed): "already at edge" is a no-op.
 */
export async function moveFieldAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "forms.write");
  const formId = uuidFromForm(formData, "formId");

  const fieldId = uuidFromForm(formData, "fieldId");
  const direction =
    readString(formData, "direction") === "down" ? ("down" as const) : ("up" as const);
  try {
    await moveField(context, fieldId, direction);
    revalidatePath(formsPath(subAccountId, formId));
  } catch {
    // leave the page as-is on invalid move; validation errors shouldn't 500
  }
}

/**
 * Called directly (not via <form>) by the builder's reorder UI.
 */
export async function reorderFieldsAction(
  subAccountId: string,
  formId: string,
  fieldIds: string[],
): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(subAccountId).success || !z.uuid().safeParse(formId).success) {
    return { error: "Invalid workspace." };
  }
  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    return { error: "Nothing to reorder." };
  }
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "forms.write");

  try {
    await reorderFields(context, formId, fieldIds);
    revalidatePath(formsPath(subAccountId, formId));
    return { error: null };
  } catch (error) {
    if (error instanceof FormValidationError) {
      return { error: error.message };
    }
    throw error;
  }
}
