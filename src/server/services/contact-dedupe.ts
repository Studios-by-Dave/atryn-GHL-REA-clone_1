import type { Prisma } from "@/generated/prisma/client";
import { blankToNull, normalizeEmail, normalizeName, normalizePhone } from "@/lib/normalize";
import type { ContactInput } from "@/features/contacts/schemas";

export type ContactIdentity = {
  emailNormalized: string | null;
  phoneNormalized: string | null;
};

export type MergeSource = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  ownerUserId: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
};

export function buildIdentity(input: {
  email?: string | null;
  phone?: string | null;
}): ContactIdentity {
  return {
    emailNormalized: normalizeEmail(input.email),
    phoneNormalized: normalizePhone(input.phone),
  };
}

/**
 * Merge an incoming draft into an existing contact without clearing known
 * fields. The original source is preserved so attribution survives duplicates.
 */
export function mergeContactDraft(
  existing: MergeSource,
  incoming: ContactInput,
  identity: ContactIdentity,
): Prisma.ContactUpdateInput {
  return {
    firstName: normalizeName(incoming.firstName) || existing.firstName,
    lastName: normalizeName(incoming.lastName) || existing.lastName,
    email: blankToNull(incoming.email) ?? existing.email,
    phone: blankToNull(incoming.phone) ?? existing.phone,
    emailNormalized: identity.emailNormalized ?? existing.emailNormalized,
    phoneNormalized: identity.phoneNormalized ?? existing.phoneNormalized,
    company: blankToNull(incoming.company) ?? existing.company,
    owner: incoming.ownerUserId
      ? { connect: { id: incoming.ownerUserId } }
      : existing.ownerUserId
        ? { connect: { id: existing.ownerUserId } }
        : { disconnect: true },
    source: existing.source ?? blankToNull(incoming.source) ?? "manual",
  };
}
