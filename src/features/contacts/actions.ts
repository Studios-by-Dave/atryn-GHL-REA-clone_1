"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ForbiddenError } from "@/server/auth/errors";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { csvToContactRows } from "@/lib/csv";
import {
  bulkTagSchema,
  contactInputSchema,
  contactUpdateSchema,
  csvRowSchema,
  importContactsSchema,
  noteInputSchema,
  tagInputSchema,
} from "@/features/contacts/schemas";
import type { ContactActionState } from "@/features/contacts/action-state";
import {
  archiveContact,
  ContactValidationError,
  createNote,
  createOrMergeContact,
  createTag,
  resolveCustomFieldValues,
  restoreContact,
  tagContacts,
  updateContactDetails,
} from "@/server/services/contacts";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readCustomFieldValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("custom.") || typeof value !== "string") {
      continue;
    }
    const fieldKey = key.slice("custom.".length);
    const existing = values[fieldKey];
    if (existing === undefined) {
      values[fieldKey] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      values[fieldKey] = formData.getAll(key).map(String);
    }
  }
  return values;
}

function parseContactForm(formData: FormData) {
  return contactInputSchema.safeParse({
    firstName: readString(formData, "firstName"),
    lastName: readString(formData, "lastName"),
    email: readString(formData, "email"),
    phone: readString(formData, "phone"),
    company: readString(formData, "company"),
    source: readString(formData, "source"),
    ownerUserId: readString(formData, "ownerUserId"),
  });
}

function subAccountPath(subAccountId: string, suffix = ""): string {
  return `/s/${subAccountId}/contacts${suffix}`;
}

async function tenantFromForm(formData: FormData): Promise<{
  subAccountId: string;
  context: Awaited<ReturnType<typeof requireTenantContext>>;
}> {
  const parsed = z.uuid().safeParse(readString(formData, "subAccountId"));
  if (!parsed.success) {
    throw new ForbiddenError();
  }
  return {
    subAccountId: parsed.data,
    context: await requireTenantContext(parsed.data),
  };
}

function contactIdFromForm(formData: FormData): string {
  const parsed = z.uuid().safeParse(readString(formData, "contactId"));
  if (!parsed.success) {
    throw new ForbiddenError();
  }
  return parsed.data;
}

export async function createContactAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "contacts.write");

  const parsed = parseContactForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the contact details." };
  }

  try {
    const customValues = await resolveCustomFieldValues(
      context,
      readCustomFieldValues(formData),
    );
    const { contact } = await createOrMergeContact(context, parsed.data, customValues);
    revalidatePath(subAccountPath(subAccountId));
    redirect(subAccountPath(subAccountId, `/${contact.id}?saved=1`));
  } catch (error) {
    if (error instanceof ContactValidationError) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function updateContactAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "contacts.write");

  const parsed = contactUpdateSchema.safeParse({
    contactId: readString(formData, "contactId"),
    firstName: readString(formData, "firstName"),
    lastName: readString(formData, "lastName"),
    email: readString(formData, "email"),
    phone: readString(formData, "phone"),
    company: readString(formData, "company"),
    source: readString(formData, "source"),
    ownerUserId: readString(formData, "ownerUserId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the contact details." };
  }

  const { contactId, ...input } = parsed.data;

  try {
    const customValues = await resolveCustomFieldValues(
      context,
      readCustomFieldValues(formData),
    );
    await updateContactDetails(context, contactId, input, customValues);
    revalidatePath(subAccountPath(subAccountId, `/${contactId}`));
    revalidatePath(subAccountPath(subAccountId));
    redirect(subAccountPath(subAccountId, `/${contactId}?saved=1`));
  } catch (error) {
    if (error instanceof ContactValidationError) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function archiveContactAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  const contactId = contactIdFromForm(formData);
  requirePermission(context, "contacts.write");
  await archiveContact(context, contactId);
  revalidatePath(subAccountPath(subAccountId));
  revalidatePath(subAccountPath(subAccountId, `/${contactId}`));
  redirect(subAccountPath(subAccountId, "?archived=1"));
}

export async function restoreContactAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  const contactId = contactIdFromForm(formData);
  requirePermission(context, "contacts.write");
  await restoreContact(context, contactId);
  revalidatePath(subAccountPath(subAccountId));
  revalidatePath(subAccountPath(subAccountId, `/${contactId}`));
  redirect(subAccountPath(subAccountId, `/${contactId}`));
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  // CLIENT_USER may add notes but cannot edit contacts (see access matrix).
  requirePermission(context, "contacts.read");

  const parsed = noteInputSchema.safeParse({
    contactId: readString(formData, "contactId"),
    body: readString(formData, "body"),
  });
  if (!parsed.success) {
    return;
  }

  await createNote(context, parsed.data.contactId, parsed.data.body);
  revalidatePath(subAccountPath(subAccountId, `/${parsed.data.contactId}`));
}

export async function bulkTagAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "contacts.write");

  const parsed = bulkTagSchema.safeParse({
    tagId: readString(formData, "tagId"),
    contactIds: formData.getAll("contactIds").map(String),
  });
  if (!parsed.success) {
    return;
  }

  await tagContacts(context, parsed.data.tagId, parsed.data.contactIds);
  revalidatePath(subAccountPath(subAccountId));
}

export async function applyTagAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  const contactId = contactIdFromForm(formData);
  requirePermission(context, "contacts.write");

  const parsed = tagInputSchema.safeParse({ name: readString(formData, "name") });
  if (!parsed.success) {
    return;
  }

  const tag = await createTag(context, parsed.data.name);
  await tagContacts(context, tag.id, [contactId]);
  revalidatePath(subAccountPath(subAccountId, `/${contactId}`));
}

export async function importContactsAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "contacts.write");

  const parsed = importContactsSchema.safeParse({ csv: readString(formData, "csv") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Paste a CSV first." };
  }

  const rows = csvToContactRows(parsed.data.csv);
  if (rows.length === 0) {
    return { error: "No contact rows were found. Include a first name column." };
  }
  if (rows.length > 500) {
    return { error: "Import at most 500 rows at a time." };
  }

  let created = 0;
  let merged = 0;
  let skipped = 0;
  for (const row of rows) {
    const result = csvRowSchema.safeParse(row);
    if (!result.success) {
      skipped += 1;
      continue;
    }
    const contact = await createOrMergeContact(context, {
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      email: result.data.email,
      phone: result.data.phone || null,
      company: result.data.company || null,
      source: result.data.source || "import",
      ownerUserId: null,
    });
    if (contact.created) {
      created += 1;
    } else {
      merged += 1;
    }
  }

  revalidatePath(subAccountPath(subAccountId));
  redirect(subAccountPath(subAccountId, `?imported=${created}&merged=${merged}&skipped=${skipped}`));
}
