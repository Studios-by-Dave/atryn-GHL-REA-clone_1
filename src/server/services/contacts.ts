import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import type { TenantContext } from "@/server/rbac/guards";
import { writeAuditLog } from "@/server/audit/write";
import { blankToNull, normalizeName } from "@/lib/normalize";
import { parseCustomFieldValue, type ContactInput } from "@/features/contacts/schemas";
import { buildIdentity, mergeContactDraft } from "./contact-dedupe";
import type { ContactDetail } from "@/server/repositories/contacts";
import {
  addContactNote,
  addTagToContacts,
  findContactById,
  findDuplicateContact,
  insertContact,
  listCustomFields,
  removeTagFromContacts,
  setContactArchived,
  updateContact,
  upsertContactCustomValue,
  upsertTag,
} from "@/server/repositories/contacts";

export class ContactValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ContactValidationError";
  }
}

type CustomValueInput = {
  customFieldId: string;
  value: Prisma.InputJsonValue;
};

async function replaceCustomValues(
  context: TenantContext,
  contactId: string,
  values: CustomValueInput[],
  client: Prisma.TransactionClient,
) {
  for (const customValue of values) {
    await upsertContactCustomValue(
      context,
      contactId,
      customValue.customFieldId,
      customValue.value,
      client,
    );
  }
}

export async function createOrMergeContact(
  context: TenantContext,
  input: ContactInput,
  customValues: CustomValueInput[] = [],
): Promise<{ contact: ContactDetail; created: boolean }> {
  const identity = buildIdentity(input);

  return prisma.$transaction(async (tx) => {
    const duplicate = await findDuplicateContact(context, identity, tx);

    if (duplicate) {
      const changes = mergeContactDraft(
        {
          firstName: duplicate.firstName,
          lastName: duplicate.lastName,
          email: duplicate.email,
          phone: duplicate.phone,
          company: duplicate.company,
          source: duplicate.source,
          ownerUserId: duplicate.ownerUserId,
          emailNormalized: duplicate.emailNormalized,
          phoneNormalized: duplicate.phoneNormalized,
        },
        input,
        identity,
      );
      await updateContact(context, duplicate.id, changes, tx);
      await replaceCustomValues(context, duplicate.id, customValues, tx);
      await writeAuditLog(tx, {
        orgId: context.orgId,
        subAccountId: context.subAccountId,
        userId: context.userId,
        action: "contact.merged",
        entityType: "Contact",
        entityId: duplicate.id,
        metadata: { matchedEmail: Boolean(identity.emailNormalized), matchedPhone: Boolean(identity.phoneNormalized) },
      });
      const contact = await findContactById(context, duplicate.id, tx);
      if (!contact) {
        throw new ContactValidationError("The merged contact could not be reloaded.");
      }
      return { contact, created: false };
    }

    const contact = await insertContact(
      context,
      { ...input, firstName: normalizeName(input.firstName), lastName: normalizeName(input.lastName) },
      identity,
      tx,
    );
    await replaceCustomValues(context, contact.id, customValues, tx);
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "contact.create",
      entityType: "Contact",
      entityId: contact.id,
      metadata: { source: contact.source },
    });
    return { contact, created: true };
  });
}

export async function updateContactDetails(
  context: TenantContext,
  contactId: string,
  input: ContactInput,
  customValues: CustomValueInput[] = [],
): Promise<ContactDetail> {
  const identity = buildIdentity(input);

  return prisma.$transaction(async (tx) => {
    const existing = await findContactById(context, contactId, tx);
    if (!existing) {
      throw new ContactValidationError("Contact not found.");
    }

    const duplicate = await findDuplicateContact(context, identity, tx);
    if (duplicate && duplicate.id !== contactId) {
      throw new ContactValidationError(
        "Another contact already uses that email address or phone number.",
      );
    }

    await updateContact(
      context,
      contactId,
      {
        firstName: normalizeName(input.firstName),
        lastName: normalizeName(input.lastName),
        email: blankToNull(input.email),
        phone: blankToNull(input.phone),
        emailNormalized: identity.emailNormalized,
        phoneNormalized: identity.phoneNormalized,
        company: blankToNull(input.company),
        source: blankToNull(input.source),
        owner: input.ownerUserId
          ? { connect: { id: input.ownerUserId } }
          : { disconnect: true },
      },
      tx,
    );
    await replaceCustomValues(context, contactId, customValues, tx);
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "contact.update",
      entityType: "Contact",
      entityId: contactId,
    });

    const contact = await findContactById(context, contactId, tx);
    if (!contact) {
      throw new ContactValidationError("Contact not found.");
    }
    return contact;
  });
}

export async function archiveContact(context: TenantContext, contactId: string) {
  return setArchived(context, contactId, true, "contact.archive");
}

export async function restoreContact(context: TenantContext, contactId: string) {
  return setArchived(context, contactId, false, "contact.restore");
}

async function setArchived(
  context: TenantContext,
  contactId: string,
  archived: boolean,
  action: string,
) {
  return prisma.$transaction(async (tx) => {
    const contact = await findContactById(context, contactId, tx);
    if (!contact) {
      throw new ContactValidationError("Contact not found.");
    }
    await setContactArchived(context, contactId, archived, tx);
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action,
      entityType: "Contact",
      entityId: contactId,
    });
    return { archived };
  });
}

export async function createNote(context: TenantContext, contactId: string, body: string) {
  return prisma.$transaction(async (tx) => {
    const contact = await findContactById(context, contactId, tx);
    if (!contact) {
      throw new ContactValidationError("Contact not found.");
    }
    const note = await addContactNote(context, contactId, body, tx);
    await tx.contact.updateMany({
      where: { id: contactId, subAccountId: context.subAccountId },
      data: { lastActivityAt: new Date() },
    });
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "contact.note.create",
      entityType: "ContactNote",
      entityId: note.id,
      metadata: { contactId },
    });
    return note;
  });
}

export async function tagContacts(
  context: TenantContext,
  tagId: string,
  contactIds: string[],
  mode: "add" | "remove" = "add",
) {
  return prisma.$transaction(async (tx) => {
    const count =
      mode === "add"
        ? await addTagToContacts(context, tagId, contactIds, tx)
        : await removeTagFromContacts(context, tagId, contactIds, tx);
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: mode === "add" ? "contact.tag.add" : "contact.tag.remove",
      entityType: "Tag",
      entityId: tagId,
      metadata: { contactCount: contactIds.length, applied: count },
    });
    return count;
  });
}

export async function createTag(context: TenantContext, name: string) {
  const tag = await upsertTag(context, normalizeName(name).slice(0, 40));
  return tag;
}

export async function resolveCustomFieldValues(
  context: TenantContext,
  rawValues: Record<string, string | string[]>,
): Promise<CustomValueInput[]> {
  const fields = await listCustomFields(context);
  const values: CustomValueInput[] = [];

  for (const field of fields) {
    if (!(field.key in rawValues)) {
      continue;
    }
    const raw = rawValues[field.key];
    const parsed = parseCustomFieldValue(field.type, raw, field.options);
    if (!parsed.ok) {
      throw new ContactValidationError(`${field.name}: ${parsed.error}`);
    }
    if (parsed.value === null || (Array.isArray(parsed.value) && parsed.value.length === 0)) {
      continue;
    }
    values.push({ customFieldId: field.id, value: parsed.value });
  }

  return values;
}
