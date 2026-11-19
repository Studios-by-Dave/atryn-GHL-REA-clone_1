import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { MessageChannel, MessageStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";
import type { TenantContext } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { writeAuditLog } from "@/server/audit/write";
import type { ConversationListQuery, SendMessageInput } from "@/features/messaging/schemas";
import { parseOptKeyword } from "@/features/messaging/schemas";
import * as repo from "@/server/repositories/messages";
import { sendEmail, sendSms } from "@/server/messaging/providers";

export class MessagingError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "MessagingError";
  }
}

export class OptOutError extends MessagingError {
  constructor(channel: MessageChannel) {
    super(
      channel === "SMS"
        ? "This contact has opted out of SMS."
        : "This contact has opted out of email.",
    );
    this.name = "OptOutError";
  }
}

export class MissingAddressError extends MessagingError {
  constructor(channel: MessageChannel) {
    super(
      channel === "SMS"
        ? "This contact has no phone number."
        : "This contact has no email address.",
    );
    this.name = "MissingAddressError";
  }
}

export type SendableContact = {
  email: string | null;
  phone: string | null;
  emailOptOutAt: Date | null;
  smsOptOutAt: Date | null;
};

/**
 * Single enforcement point for consent — every outbound send path (inbox,
 * workflow action, notification) must call this first.
 */
export function assertCanSend(contact: SendableContact, channel: MessageChannel): void {
  if (channel === "EMAIL") {
    if (contact.emailOptOutAt) throw new OptOutError("EMAIL");
    if (!contact.email) throw new MissingAddressError("EMAIL");
  } else {
    if (contact.smsOptOutAt) throw new OptOutError("SMS");
    if (!contact.phone) throw new MissingAddressError("SMS");
  }
}

export async function listConversations(context: TenantContext, query: ConversationListQuery) {
  if (!hasPermission(context.role, "messaging.read")) return [];
  return repo.listConversations(context, query);
}

export async function getConversation(context: TenantContext, conversationId: string) {
  if (!hasPermission(context.role, "messaging.read")) return null;
  return repo.findConversationDetail(context, conversationId);
}

export async function markRead(context: TenantContext, conversationId: string) {
  if (!hasPermission(context.role, "messaging.read")) return;
  await repo.markConversationRead(context, conversationId);
}

export async function sendMessage(
  context: TenantContext,
  contactId: string,
  input: SendMessageInput,
) {
  if (!hasPermission(context.role, "messaging.send")) {
    throw new MessagingError("Your role cannot send messages.");
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, subAccountId: context.subAccountId },
    select: { id: true, email: true, phone: true, emailOptOutAt: true, smsOptOutAt: true },
  });
  if (!contact) {
    throw new MessagingError("Contact not found.");
  }

  assertCanSend(contact, input.channel);

  const conversation = await repo.ensureConversation(context, contact.id);
  const message = await repo.insertMessage(context, {
    conversationId: conversation.id,
    contactId: contact.id,
    channel: input.channel,
    direction: "OUTBOUND",
    status: "QUEUED",
    subject: input.channel === "EMAIL" ? input.subject : null,
    body: input.body,
    senderUserId: context.userId,
  });

  try {
    const result =
      input.channel === "EMAIL"
        ? await sendEmail(contact.email!, input.subject, input.body)
        : await sendSms(contact.phone!, input.body);

    await repo.updateMessageRow(context, message.id, {
      status: "SENT",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      sentAt: new Date(),
    });
    await repo.touchConversation(conversation.id, new Date(), false);
    await prisma.$transaction((tx) =>
      writeAuditLog(tx, {
        orgId: context.orgId,
        subAccountId: context.subAccountId,
        userId: context.userId,
        action: "message.send",
        entityType: "Message",
        entityId: message.id,
        metadata: { channel: input.channel, provider: result.provider },
      }),
    );

    return { id: message.id, provider: result.provider, conversationId: conversation.id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await repo.updateMessageRow(context, message.id, {
      status: "FAILED",
      error: detail,
      failedAt: new Date(),
    });
    throw new MessagingError("Message could not be sent. Try again.");
  }
}

// ── inbound / status webhooks (system callers, no user context) ──

const TWILIO_STATUS_MAP: Record<string, MessageStatus> = {
  queued: "QUEUED",
  accepted: "QUEUED",
  sending: "QUEUED",
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
  undelivered: "FAILED",
  canceled: "FAILED",
};

export async function ingestInboundSms(input: {
  subAccountId: string;
  from: string;
  body: string;
  messageSid: string;
}): Promise<{ ok: boolean; duplicate?: boolean; contactId?: string; intent?: string | null }> {
  const sub = await repo.findSubAccountOrgId(input.subAccountId);
  if (!sub) {
    return { ok: false };
  }

  const record = await repo.recordWebhookEvent({
    provider: "twilio",
    eventType: "inbound_sms",
    idempotencyKey: `twilio:inbound:${input.messageSid}`,
    payload: { from: input.from, body: input.body, messageSid: input.messageSid },
    subAccountId: input.subAccountId,
  });
  if (!record.created) {
    return { ok: true, duplicate: true };
  }

  try {
    let contact = await repo.findMessagingContactByPhone(input.subAccountId, input.from);
    if (!contact) {
      contact = await repo.createInboundContact(input.subAccountId, {
        firstName: "SMS contact",
        phone: input.from,
        source: "sms",
      });
    }

    const intent = parseOptKeyword(input.body);
    if (intent === "opt_out") {
      await repo.setContactSmsOptOut(input.subAccountId, contact.id, new Date());
    } else if (intent === "opt_in") {
      await repo.setContactSmsOptOut(input.subAccountId, contact.id, null);
    }

    const context: TenantContext = {
      orgId: sub.orgId,
      subAccountId: input.subAccountId,
      userId: "",
      role: "AGENT",
    };
    const conversation = await repo.ensureConversation(context, contact.id);
    await repo.insertMessage(context, {
      conversationId: conversation.id,
      contactId: contact.id,
      channel: "SMS",
      direction: "INBOUND",
      status: "DELIVERED",
      body: input.body,
      senderUserId: null,
      provider: "twilio",
      providerMessageId: input.messageSid,
      metadata: { optIntent: intent },
    });
    await repo.touchConversation(conversation.id, new Date(), true);

    if (record.id) await repo.finishWebhookEvent(record.id, "PROCESSED");
    return { ok: true, contactId: contact.id, intent };
  } catch (error) {
    if (record.id) {
      await repo.finishWebhookEvent(
        record.id,
        "FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
    throw error;
  }
}

export async function ingestTwilioStatus(input: { messageSid: string; status: string }) {
  const mapped = TWILIO_STATUS_MAP[input.status.toLowerCase()];
  if (!mapped) {
    return { ok: true, ignored: true };
  }

  const message = await repo.findMessageByProviderId(input.messageSid);
  if (!message) {
    return { ok: true, unknown: true };
  }

  const patch: Prisma.MessageUpdateManyMutationInput = { status: mapped };
  const at = new Date();
  if (mapped === "DELIVERED") patch.deliveredAt = at;
  if (mapped === "FAILED") patch.failedAt = at;
  if (mapped === "READ") patch.readAt = at;

  await repo.updateMessageDeliveryByProviderId(input.messageSid, patch);
  return { ok: true };
}

const RESEND_STATUS_MAP: Record<string, MessageStatus> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.bounced": "FAILED",
  "email.complained": "FAILED",
};

export async function ingestResendEvent(input: {
  id: string;
  type: string;
  emailId: string;
}) {
  const record = await repo.recordWebhookEvent({
    provider: "resend",
    eventType: input.type,
    idempotencyKey: `resend:${input.id}`,
    payload: { type: input.type, emailId: input.emailId },
  });
  if (!record.created) {
    return { ok: true, duplicate: true };
  }

  const mapped = RESEND_STATUS_MAP[input.type];
  if (mapped) {
    const patch: Prisma.MessageUpdateManyMutationInput = { status: mapped };
    const at = new Date();
    if (mapped === "DELIVERED") patch.deliveredAt = at;
    if (mapped === "FAILED") patch.failedAt = at;
    await repo.updateMessageDeliveryByProviderId(input.emailId, patch);
  }

  if (record.id) await repo.finishWebhookEvent(record.id, "PROCESSED");
  return { ok: true };
}
