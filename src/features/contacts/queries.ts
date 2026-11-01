import "server-only";

import { requireTenantContext } from "@/server/tenant/context";
import {
  listContacts,
  findContactById,
} from "@/server/repositories/contacts";
import type { ContactListQuery } from "@/features/contacts/schemas";

export async function getContactsList(subAccountId: string, query: ContactListQuery) {
  const context = await requireTenantContext(subAccountId);
  return listContacts(context, query);
}

export async function getContactDetail(subAccountId: string, contactId: string) {
  const context = await requireTenantContext(subAccountId);
  return findContactById(context, contactId);
}