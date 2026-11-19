import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { MessageChannel, MessageDirection, MessageStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";
import type { TenantContext } from "@/server/rbac/guards";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import type { ConversationListQuery } from "@/features/messaging/schemas";

type Db = Prisma.TransactionClient;

const lastMessageSelect = {
  body: true,
  channel: true,
  direction: true,
  status: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

const conversationListSelect = {
  id: true,
  status: true,
  unreadCount: true,
  lastMessageAt: true,
  createdAt: true,
  contact: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  },
  messages: {
    take: 1,
    orderBy: { createdAt: "desc" },
    select: lastMessageSelect,
  },
} satisfies Prisma.ConversationSelect;

export type ConversationListItem = Prisma.ConversationGetPayload<{
  select: typeof conversationListSelect;
}>;

export async function listConversations(
  context: TenantContext,
  query: ConversationListQuery,
  client: Db = prisma,
): Promise<ConversationListItem[]> {
  const where: Prisma.ConversationWhereInput = {
    subAccountId: context.subAccountId,
    ...(query.status === "all" ? {} : { status: query.status }),
  };
  if (query.search) {
    where.contact = {
      OR: [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
      ],
    };
  }
  return client.conversation.findMany({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: conversationListSelect,
  });
}

const conversationDetailSelect = {
  id: true,
  status: true,
  unreadCount: true,
  lastMessageAt: true,
  contactId: true,
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      emailOptOutAt: true,
      smsOptOutAt: true,
    },
  },
  messages: {
    take: 200,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      channel: true,
      direction: true,
      status: true,
      subject: true,
      body: true,
      provider: true,
      error: true,
      senderUserId: true,
      sentAt: true,
      deliveredAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ConversationSelect;

export type ConversationDetail = Prisma.ConversationGetPayload<{
  select: typeof conversationDetailSelect;
}>;

export async function findConversationDetail(
  context: TenantContext,
  conversationId: string,
  client: Db = prisma,
): Promise<ConversationDetail | null> {
  return client.conversation.findFirst({
    where: { id: conversationId, subAccountId: context.subAccountId },
    select: conversationDetailSelect,
  });
}

export async function findConversationIdByContact(
  context: TenantContext,
  contactId: string,
  client: Db = prisma,
) {
  return client.conversation.findFirst({
    where: { contactId, subAccountId: context.subAccountId },
    select: { id: true },
  });
}

/** Idempotently returns the single conversation row for a contact. */
export async function ensureConversation(
  context: TenantContext,
  contactId: string,
  client: Db = prisma,
) {
  return client.conversation.upsert({
    where: { contactId },
    create: { subAccountId: context.subAccountId, contactId },
    update: {},
    select: { id: true },
  });
}

export async function insertMessage(
  context: TenantContext,
  data: {
    conversationId: string;
    contactId: string;
    channel: MessageChannel;
    direction: MessageDirection;
    status: MessageStatus;
    subject?: string | null;
    body: string;
    senderUserId?: string | null;
    provider?: string | null;
    providerMessageId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  client: Db = prisma,
) {
  return client.message.create({
    data: { subAccountId: context.subAccountId, ...data },
    select: { id: true },
  });
}

export async function updateMessageRow(
  context: TenantContext,
  messageId: string,
  data: Prisma.MessageUpdateInput,
  client: Db = prisma,
) {
  return client.message.updateMany({
    where: { id: messageId, subAccountId: context.subAccountId },
    data,
  });
}

export async function touchConversation(
  conversationId: string,
  lastMessageAt: Date,
  incrementUnread: boolean,
  client: Db = prisma,
) {
  return client.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt,
      ...(incrementUnread ? { unreadCount: { increment: 1 } } : {}),
    },
  });
}

export async function markConversationRead(
  context: TenantContext,
  conversationId: string,
  client: Db = prisma,
) {
  return client.conversation.updateMany({
    where: { id: conversationId, subAccountId: context.subAccountId },
    data: { unreadCount: 0 },
  });
}

// ── webhook plumbing (system-level; scoped by provider/ids, not TenantContext) ──

export async function recordWebhookEvent(data: {
  provider: string;
  eventType: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
  subAccountId?: string | null;
  contactId?: string | null;
}): Promise<{ created: boolean; id?: string }> {
  try {
    const row = await prisma.webhookEvent.create({
      data,
      select: { id: true },
    });
    return { created: true, id: row.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { created: false };
    }
    throw error;
  }
}

export async function finishWebhookEvent(
  id: string,
  status: "PROCESSED" | "FAILED",
  error?: string | null,
) {
  await prisma.webhookEvent.update({
    where: { id },
    data: { status, error: error ?? null, processedAt: new Date() },
  });
}

/** Finds the outbound message a provider callback refers to. */
export async function findMessageByProviderId(providerMessageId: string) {
  return prisma.message.findFirst({
    where: { providerMessageId },
    select: { id: true, subAccountId: true, contactId: true, conversationId: true },
  });
}

export async function updateMessageDeliveryByProviderId(
  providerMessageId: string,
  data: Prisma.MessageUpdateManyMutationInput,
) {
  return prisma.message.updateMany({ where: { providerMessageId }, data });
}

export async function findMessagingContactByPhone(subAccountId: string, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return null;
  }
  return prisma.contact.findFirst({
    where: { subAccountId, phoneNormalized: normalized },
    select: { id: true, emailOptOutAt: true, smsOptOutAt: true },
  });
}

export async function findMessagingContactByEmail(subAccountId: string, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  return prisma.contact.findFirst({
    where: { subAccountId, emailNormalized: normalized },
    select: { id: true },
  });
}

export async function createInboundContact(
  subAccountId: string,
  input: { firstName: string; phone?: string | null; email?: string | null; source: string },
) {
  return prisma.contact.create({
    data: {
      subAccountId,
      firstName: input.firstName || "Unknown",
      phone: input.phone ?? null,
      phoneNormalized: normalizePhone(input.phone),
      email: input.email ?? null,
      emailNormalized: normalizeEmail(input.email),
      source: input.source,
    },
    select: { id: true, emailOptOutAt: true, smsOptOutAt: true },
  });
}

export async function setContactSmsOptOut(
  subAccountId: string,
  contactId: string,
  at: Date | null,
) {
  return prisma.contact.updateMany({
    where: { id: contactId, subAccountId },
    data: { smsOptOutAt: at },
  });
}

export async function findSubAccountOrgId(subAccountId: string) {
  return prisma.subAccount.findUnique({
    where: { id: subAccountId },
    select: { orgId: true },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
