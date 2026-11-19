import "server-only";

import { requireTenantContext } from "@/server/tenant/context";
import { getConversation, listConversations } from "@/server/services/messaging";
import type { ConversationListQuery } from "@/features/messaging/schemas";

export async function getConversations(subAccountId: string, query: ConversationListQuery) {
  const context = await requireTenantContext(subAccountId);
  return listConversations(context, query);
}

export async function getConversationDetail(subAccountId: string, conversationId: string) {
  const context = await requireTenantContext(subAccountId);
  return getConversation(context, conversationId);
}
