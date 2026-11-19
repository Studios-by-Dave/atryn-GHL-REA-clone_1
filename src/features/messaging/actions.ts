"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/server/auth/errors";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { MessagingError, markRead, sendMessage } from "@/server/services/messaging";
import { sendMessageSchema } from "@/features/messaging/schemas";
import type { MessagingActionState } from "@/features/messaging/action-state";

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

export async function sendMessageAction(
  _previous: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "messaging.send");
  const contactId = uuidFromForm(formData, "contactId");
  const conversationId = readString(formData, "conversationId");

  const parsed = sendMessageSchema.safeParse({
    channel: readString(formData, "channel"),
    subject: readString(formData, "subject"),
    body: readString(formData, "body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the message.", sentAt: null };
  }

  try {
    const result = await sendMessage(context, contactId, parsed.data);
    revalidatePath(`/s/${subAccountId}/conversations`);
    revalidatePath(`/s/${subAccountId}/conversations/${result.conversationId}`);
    if (conversationId && conversationId !== result.conversationId) {
      revalidatePath(`/s/${subAccountId}/conversations/${conversationId}`);
    }
    return { error: null, sentAt: Date.now() };
  } catch (error) {
    if (error instanceof MessagingError) {
      return { error: error.message, sentAt: null };
    }
    throw error;
  }
}

export async function markConversationReadAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "messaging.read");
  const conversationId = uuidFromForm(formData, "conversationId");
  await markRead(context, conversationId);
  revalidatePath(`/s/${subAccountId}/conversations`);
  revalidatePath(`/s/${subAccountId}/conversations/${conversationId}`);
}
