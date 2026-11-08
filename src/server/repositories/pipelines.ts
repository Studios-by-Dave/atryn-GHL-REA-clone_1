import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import type { TenantContext } from "@/server/rbac/guards";
import type { BoardQuery } from "@/features/pipelines/schemas";

type Db = Prisma.TransactionClient;

const stageSelect = {
  id: true,
  name: true,
  position: true,
  probability: true,
  isWon: true,
  isLost: true,
} satisfies Prisma.PipelineStageSelect;

const boardInclude = {
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  stage: { select: { id: true, name: true, isWon: true, isLost: true } },
} satisfies Prisma.OpportunityInclude;

export type BoardStage = Prisma.PipelineStageGetPayload<{ select: typeof stageSelect }>;

export type BoardOpportunity = Prisma.OpportunityGetPayload<{ include: typeof boardInclude }>;

export async function listPipelines(context: TenantContext, client: Db = prisma) {
  return client.pipeline.findMany({
    where: { subAccountId: context.subAccountId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      stages: { orderBy: { position: "asc" }, select: stageSelect },
      _count: { select: { opportunities: true } },
    },
  });
}

export type PipelineWithStages = Prisma.PipelineGetPayload<{
  include: { stages: { orderBy: { position: "asc" }; select: typeof stageSelect } };
}>;

export async function findPipeline(
  context: TenantContext,
  pipelineId: string,
  client: Db = prisma,
): Promise<PipelineWithStages | null> {
  return client.pipeline.findFirst({
    where: { id: pipelineId, subAccountId: context.subAccountId },
    include: {
      stages: { orderBy: { position: "asc" }, select: stageSelect },
    },
  });
}

export async function insertPipeline(
  context: TenantContext,
  name: string,
  stages: { name: string; position: number; isWon: boolean; isLost: boolean }[],
  client: Db = prisma,
) {
  return client.pipeline.create({
    data: {
      subAccountId: context.subAccountId,
      name,
      position: 0,
      stages: {
        create: stages.map((stage) => ({
          name: stage.name,
          position: stage.position,
          isWon: stage.isWon,
          isLost: stage.isLost,
        })),
      },
    },
    include: { stages: { orderBy: { position: "asc" }, select: stageSelect } },
  });
}

export async function renamePipeline(
  context: TenantContext,
  pipelineId: string,
  name: string,
  client: Db = prisma,
) {
  const result = await client.pipeline.updateMany({
    where: { id: pipelineId, subAccountId: context.subAccountId },
    data: { name },
  });
  return result.count;
}

export async function deletePipelineRow(
  context: TenantContext,
  pipelineId: string,
  client: Db = prisma,
) {
  const result = await client.pipeline.deleteMany({
    where: { id: pipelineId, subAccountId: context.subAccountId },
  });
  return result.count;
}

export async function insertStage(
  context: TenantContext,
  pipelineId: string,
  data: { name: string; position: number; probability: number; isWon: boolean; isLost: boolean },
  client: Db = prisma,
) {
  const pipeline = await client.pipeline.findFirst({
    where: { id: pipelineId, subAccountId: context.subAccountId },
    select: { id: true },
  });
  if (!pipeline) {
    return null;
  }
  return client.pipelineStage.create({
    data: { pipelineId, ...data },
    select: stageSelect,
  });
}

export async function updateStage(
  context: TenantContext,
  stageId: string,
  data: { name: string; probability: number; isWon: boolean; isLost: boolean },
  client: Db = prisma,
) {
  const stage = await client.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { subAccountId: context.subAccountId } },
    select: { id: true },
  });
  if (!stage) {
    return null;
  }
  return client.pipelineStage.update({
    where: { id: stageId },
    data,
    select: stageSelect,
  });
}

export async function deleteStage(
  context: TenantContext,
  stageId: string,
  client: Db = prisma,
): Promise<{ ok: boolean; reason?: "in-use" }> {
  const stage = await client.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { subAccountId: context.subAccountId } },
    select: { id: true, _count: { select: { opportunities: true } } },
  });
  if (!stage) {
    return { ok: false };
  }
  if (stage._count.opportunities > 0) {
    return { ok: false, reason: "in-use" };
  }
  await client.pipelineStage.delete({ where: { id: stageId } });
  return { ok: true };
}

function boardWhere(
  context: TenantContext,
  pipelineId: string,
  query: BoardQuery,
): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = {
    subAccountId: context.subAccountId,
    pipelineId,
  };
  if (query.assignee) {
    where.assignedUserId = query.assignee;
  }
  if (query.status !== "all") {
    where.status = query.status;
  }
  if (query.valueMin > 0) {
    where.value = { gte: query.valueMin };
  }
  if (query.closeBefore) {
    where.expectedCloseDate = { lte: new Date(query.closeBefore) };
  }
  // CLIENT_USER only sees opportunities assigned to them (enforced by service).
  return where;
}

export async function listBoard(
  context: TenantContext,
  pipelineId: string,
  query: BoardQuery,
  restrictToAssigned: boolean,
  client: Db = prisma,
): Promise<BoardOpportunity[]> {
  const where = boardWhere(context, pipelineId, query);
  if (restrictToAssigned) {
    where.assignedUserId = context.userId;
  }
  return client.opportunity.findMany({
    where,
    include: boardInclude,
    orderBy: [{ stage: { position: "asc" } }, { createdAt: "desc" }],
  });
}

export async function findOpportunity(
  context: TenantContext,
  opportunityId: string,
  client: Db = prisma,
) {
  return client.opportunity.findFirst({
    where: { id: opportunityId, subAccountId: context.subAccountId },
    include: {
      ...boardInclude,
      pipeline: { select: { id: true, name: true } },
      history: {
        orderBy: { createdAt: "desc" },
        include: {
          fromStage: { select: stageSelect },
          toStage: { select: stageSelect },
        },
      },
    },
  });
}

export async function insertOpportunity(
  context: TenantContext,
  data: {
    pipelineId: string;
    stageId: string;
    contactId: string;
    name: string;
    value: number;
    currency: string;
    assignedUserId: string | null;
    source: string | null;
    notes: string | null;
    expectedCloseDate: Date | null;
  },
  client: Db = prisma,
) {
  return client.opportunity.create({
    data: {
      subAccountId: context.subAccountId,
      ...data,
      history: {
        create: { toStageId: data.stageId, changedByUserId: context.userId, note: "created" },
      },
    },
    include: boardInclude,
  });
}

export async function updateOpportunity(
  context: TenantContext,
  opportunityId: string,
  data: {
    name: string;
    value: number;
    currency: string;
    assignedUserId: string | null;
    source: string | null;
    notes: string | null;
    expectedCloseDate: Date | null;
  },
  client: Db = prisma,
) {
  const existing = await client.opportunity.findFirst({
    where: {
      id: opportunityId,
      subAccountId: context.subAccountId,
    },
    select: { id: true },
  });
  if (!existing) {
    return null;
  }
  return client.opportunity.update({ where: { id: opportunityId }, data, include: boardInclude });
}

/**
 * Moves an opportunity to a stage: verifies both belong to the caller's
 * sub-account and to the *same* pipeline, appends a history row, and applies
 * terminal-stage semantics (won/lost timestamps + status). Returns the stage
 * the row actually landed on, or null when the move is invalid.
 */
export async function moveOpportunityToStage(
  context: TenantContext,
  opportunityId: string,
  toStageId: string,
  client: Db = prisma,
): Promise<{ moved: boolean; isWon: boolean; isLost: boolean } | null> {
  const opportunity = await client.opportunity.findFirst({
    where: { id: opportunityId, subAccountId: context.subAccountId },
    select: { id: true, stageId: true, pipelineId: true, status: true, wonAt: true, lostAt: true },
  });
  if (!opportunity) {
    return null;
  }
  if (opportunity.stageId === toStageId) {
    const stage = await client.pipelineStage.findUnique({ where: { id: toStageId }, select: stageSelect });
    return { moved: false, isWon: stage?.isWon ?? false, isLost: stage?.isLost ?? false };
  }
  const toStage = await client.pipelineStage.findUnique({
    where: { id: toStageId },
    select: { pipelineId: true, ...stageSelect },
  });
  if (!toStage) {
    return null;
  }
  if (toStage.pipelineId !== opportunity.pipelineId) {
    return { moved: false, isWon: false, isLost: false };
  }
  if (toStage.isWon && toStage.isLost) {
    return { moved: false, isWon: false, isLost: false };
  }

  const now = new Date();
  const landedOnWon = toStage.isWon;
  const landedOnLost = toStage.isLost;
  // Terminal stages are sticky: once won/lost, the status stays.
  const alreadyWon = opportunity.status === "WON";
  const alreadyLost = opportunity.status === "LOST";

  await client.opportunity.update({
    where: { id: opportunityId },
    data: {
      stageId: toStageId,
      status: alreadyWon ? "WON" : alreadyLost ? "LOST" : landedOnWon ? "WON" : landedOnLost ? "LOST" : "OPEN",
      wonAt: alreadyWon || landedOnWon ? (opportunity.wonAt ?? now) : opportunity.wonAt,
      lostAt: alreadyLost || landedOnLost ? (opportunity.lostAt ?? now) : opportunity.lostAt,
      history: {
        create: { fromStageId: opportunity.stageId, toStageId, changedByUserId: context.userId },
      },
    },
  });
  return { moved: true, isWon: landedOnWon, isLost: landedOnLost };
}

export async function listAssignableUsers(context: TenantContext, client: Db = prisma) {
  const memberships = await client.subAccountMembership.findMany({
    where: { subAccountId: context.subAccountId, status: "ACTIVE" },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map((membership) => membership.user);
}

export async function listContactOptions(context: TenantContext, client: Db = prisma) {
  return client.contact.findMany({
    where: { subAccountId: context.subAccountId, deletedAt: null, status: "ACTIVE" },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, email: true },
    take: 200,
  });
}
