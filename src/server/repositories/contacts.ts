import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import type { TenantContext } from "@/server/rbac/guards";
import type { ContactInput, ContactListQuery } from "@/features/contacts/schemas";

type Db = Prisma.TransactionClient;

export const PAGE_SIZE = 25;

const listInclude = {
  owner: { select: { id: true, name: true, email: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.ContactInclude;

const detailInclude = {
  ...listInclude,
  notes: {
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true, email: true } } },
  },
  customValues: {
    include: { customField: true },
  },
  _count: {
    select: {
      opportunities: true,
      messages: true,
      appointments: true,
      tasks: true,
      forms: true,
    },
  },
} satisfies Prisma.ContactInclude;

export type ContactListItem = Prisma.ContactGetPayload<{ include: typeof listInclude }>;
export type ContactDetail = Prisma.ContactGetPayload<{ include: typeof detailInclude }>;

function listWhere(context: TenantContext, query: ContactListQuery): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {
    subAccountId: context.subAccountId,
    deletedAt: null,
    status: query.status === "all" ? undefined : query.status,
  };

  if (query.search) {
    const search = query.search;
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
      { company: { contains: search, mode: "insensitive" } },
    ];
  }
  if (query.source) {
    where.source = query.source;
  }
  if (query.ownerUserId) {
    where.ownerUserId = query.ownerUserId;
  }
  if (query.tagId) {
    where.tags = { some: { tagId: query.tagId } };
  }

  return where;
}

export async function listContacts(
  context: TenantContext,
  query: ContactListQuery,
  client: Db = prisma,
) {
  const where = listWhere(context, query);
  const orderBy: Prisma.ContactOrderByWithRelationInput[] =
    query.sort === "name"
      ? [{ lastName: "asc" }, { firstName: "asc" }]
      : [{ createdAt: "desc" }];

  const page = query.page;
  const [items, total] = await Promise.all([
    client.contact.findMany({
      where,
      include: listInclude,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    client.contact.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function findContactById(
  context: TenantContext,
  contactId: string,
  client: Db = prisma,
): Promise<ContactDetail | null> {
  return client.contact.findFirst({
    where: {
      id: contactId,
      subAccountId: context.subAccountId,
      deletedAt: null,
    },
    include: detailInclude,
  });
}

export async function findDuplicateContact(
  context: TenantContext,
  identity: { emailNormalized: string | null; phoneNormalized: string | null },
  client: Db = prisma,
): Promise<ContactDetail | null> {
  const matches: Prisma.ContactWhereInput[] = [];
  if (identity.emailNormalized) {
    matches.push({ emailNormalized: identity.emailNormalized });
  }
  if (identity.phoneNormalized) {
    matches.push({ phoneNormalized: identity.phoneNormalized });
  }
  if (matches.length === 0) {
    return null;
  }

  return client.contact.findFirst({
    where: {
      subAccountId: context.subAccountId,
      deletedAt: null,
      OR: matches,
    },
    include: detailInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function insertContact(
  context: TenantContext,
  input: ContactInput,
  identity: { emailNormalized: string | null; phoneNormalized: string | null },
  client: Db = prisma,
) {
  return client.contact.create({
    data: {
      subAccountId: context.subAccountId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      emailNormalized: identity.emailNormalized,
      phoneNormalized: identity.phoneNormalized,
      company: input.company,
      source: input.source ?? "manual",
      ownerUserId: input.ownerUserId,
    },
    include: detailInclude,
  });
}

export async function updateContact(
  context: TenantContext,
  contactId: string,
  data: Prisma.ContactUpdateInput,
  client: Db = prisma,
): Promise<number> {
  const existing = await client.contact.findFirst({
    where: {
      id: contactId,
      subAccountId: context.subAccountId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!existing) {
    return 0;
  }
  await client.contact.update({ where: { id: contactId }, data });
  return 1;
}

export async function setContactArchived(
  context: TenantContext,
  contactId: string,
  archived: boolean,
  client: Db = prisma,
): Promise<number> {
  const result = await client.contact.updateMany({
    where: {
      id: contactId,
      subAccountId: context.subAccountId,
      deletedAt: null,
    },
    data: archived
      ? { status: "ARCHIVED", archivedAt: new Date() }
      : { status: "ACTIVE", archivedAt: null },
  });
  return result.count;
}

export async function listTags(context: TenantContext, client: Db = prisma) {
  return client.tag.findMany({
    where: { subAccountId: context.subAccountId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
}

export async function findTag(context: TenantContext, tagId: string, client: Db = prisma) {
  return client.tag.findFirst({
    where: { id: tagId, subAccountId: context.subAccountId },
    select: { id: true, name: true, color: true },
  });
}

export async function upsertTag(
  context: TenantContext,
  name: string,
  client: Db = prisma,
) {
  return client.tag.upsert({
    where: {
      subAccountId_name: { subAccountId: context.subAccountId, name },
    },
    update: {},
    create: { subAccountId: context.subAccountId, name },
    select: { id: true, name: true, color: true },
  });
}

async function ownedContactIds(
  context: TenantContext,
  contactIds: string[],
  client: Db,
): Promise<string[]> {
  const contacts = await client.contact.findMany({
    where: {
      id: { in: contactIds },
      subAccountId: context.subAccountId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return contacts.map((contact) => contact.id);
}

export async function addTagToContacts(
  context: TenantContext,
  tagId: string,
  contactIds: string[],
  client: Db = prisma,
): Promise<number> {
  const ids = await ownedContactIds(context, contactIds, client);
  if (ids.length === 0) {
    return 0;
  }
  const result = await client.contactTag.createMany({
    data: ids.map((contactId) => ({ contactId, tagId })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function removeTagFromContacts(
  context: TenantContext,
  tagId: string,
  contactIds: string[],
  client: Db = prisma,
): Promise<number> {
  const ids = await ownedContactIds(context, contactIds, client);
  if (ids.length === 0) {
    return 0;
  }
  const result = await client.contactTag.deleteMany({
    where: { tagId, contactId: { in: ids } },
  });
  return result.count;
}

export async function addContactNote(
  context: TenantContext,
  contactId: string,
  body: string,
  client: Db = prisma,
) {
  return client.contactNote.create({
    data: {
      subAccountId: context.subAccountId,
      contactId,
      authorUserId: context.userId,
      body,
    },
  });
}

export async function listCustomFields(context: TenantContext, client: Db = prisma) {
  return client.customField.findMany({
    where: { subAccountId: context.subAccountId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      key: true,
      type: true,
      options: true,
      required: true,
    },
  });
}

export async function upsertContactCustomValue(
  context: TenantContext,
  contactId: string,
  customFieldId: string,
  value: Prisma.InputJsonValue,
  client: Db = prisma,
) {
  return client.customFieldValue.upsert({
    where: {
      customFieldId_contactId: { customFieldId, contactId },
    },
    update: { value },
    create: {
      subAccountId: context.subAccountId,
      customFieldId,
      contactId,
      value,
    },
  });
}

export async function listAssignableOwners(context: TenantContext, client: Db = prisma) {
  const memberships = await client.subAccountMembership.findMany({
    where: {
      subAccountId: context.subAccountId,
      status: "ACTIVE",
    },
    select: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map((membership) => membership.user);
}

export async function listSources(context: TenantContext, client: Db = prisma) {
  const rows = await client.contact.groupBy({
    by: ["source"],
    where: {
      subAccountId: context.subAccountId,
      deletedAt: null,
      source: { not: null },
    },
    _count: { _all: true },
  });
  return rows
    .map((row) => row.source)
    .filter((source): source is string => Boolean(source))
    .sort((a, b) => a.localeCompare(b));
}
