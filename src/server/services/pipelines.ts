import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantContext } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { writeAuditLog } from "@/server/audit/write";
import { publishWorkflowEvent } from "@/server/events/bus";
import { normalizeName } from "@/lib/normalize";
import type { BoardQuery, OpportunityInput, OpportunityUpdateInput, PipelineInput, StageInput } from "@/features/pipelines/schemas";
import {
  deletePipelineRow,
  deleteStage,
  findOpportunity,
  findPipeline,
  insertOpportunity,
  insertPipeline,
  insertStage,
  listBoard,
  listPipelines,
  moveOpportunityToStage,
  renamePipeline,
  updateOpportunity,
  updateStage,
} from "@/server/repositories/pipelines";

export class PipelineValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "PipelineValidationError";
  }
}

const defaultStageNames = ["New lead", "In progress", "Negotiation", "Closed won", "Closed lost"];

export async function createPipeline(context: TenantContext, input: PipelineInput) {
  const stages = defaultStageNames.map((name, index) => ({
    name,
    position: index,
    isWon: name === "Closed won",
    isLost: name === "Closed lost",
  }));

  return prisma.$transaction(async (tx) => {
    const pipeline = await insertPipeline(context, normalizeName(input.name), stages, tx);
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "pipeline.create",
      entityType: "Pipeline",
      entityId: pipeline.id,
      metadata: { stageCount: stages.length },
    });
    return pipeline;
  });
}

export async function updatePipelineName(context: TenantContext, pipelineId: string, input: PipelineInput) {
  return prisma.$transaction(async (tx) => {
    const count = await renamePipeline(context, pipelineId, normalizeName(input.name), tx);
    if (count === 0) {
      throw new PipelineValidationError("Pipeline not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "pipeline.update",
      entityType: "Pipeline",
      entityId: pipelineId,
    });
    return true;
  });
}

export async function deletePipeline(context: TenantContext, pipelineId: string) {
  return prisma.$transaction(async (tx) => {
    const count = await deletePipelineRow(context, pipelineId, tx);
    if (count === 0) {
      throw new PipelineValidationError("Pipeline not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "pipeline.delete",
      entityType: "Pipeline",
      entityId: pipelineId,
    });
    return true;
  });
}

export async function addStage(context: TenantContext, pipelineId: string, input: StageInput) {
  if (input.isWon && input.isLost) {
    throw new PipelineValidationError("A stage cannot be both won and lost.");
  }
  return prisma.$transaction(async (tx) => {
    const pipeline = await findPipeline(context, pipelineId, tx);
    if (!pipeline) {
      throw new PipelineValidationError("Pipeline not found.");
    }
    const stage = await insertStage(
      context,
      pipelineId,
      {
        name: normalizeName(input.name),
        position: pipeline.stages.length,
        probability: input.probability,
        isWon: input.isWon,
        isLost: input.isLost,
      },
      tx,
    );
    if (!stage) {
      throw new PipelineValidationError("Pipeline not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "pipeline.stage.create",
      entityType: "PipelineStage",
      entityId: stage.id,
      metadata: { pipelineId },
    });
    return stage;
  });
}

export async function editStage(context: TenantContext, stageId: string, input: StageInput) {
  if (input.isWon && input.isLost) {
    throw new PipelineValidationError("A stage cannot be both won and lost.");
  }
  return prisma.$transaction(async (tx) => {
    const stage = await updateStage(
      context,
      stageId,
      {
        name: normalizeName(input.name),
        probability: input.probability,
        isWon: input.isWon,
        isLost: input.isLost,
      },
      tx,
    );
    if (!stage) {
      throw new PipelineValidationError("Stage not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "pipeline.stage.update",
      entityType: "PipelineStage",
      entityId: stageId,
    });
    return stage;
  });
}

export async function removeStage(context: TenantContext, stageId: string) {
  return prisma.$transaction(async (tx) => {
    const result = await deleteStage(context, stageId, tx);
    if (!result.ok) {
      throw new PipelineValidationError(
        result.reason === "in-use"
          ? "Move the opportunities off this stage before deleting it."
          : "Stage not found.",
      );
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "pipeline.stage.delete",
      entityType: "PipelineStage",
      entityId: stageId,
    });
    return true;
  });
}

function toDecimal(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function createOpportunity(context: TenantContext, input: OpportunityInput) {
  return prisma.$transaction(async (tx) => {
    const pipeline = await findPipeline(context, input.pipelineId, tx);
    if (!pipeline || !pipeline.stages.some((stage) => stage.id === input.stageId)) {
      throw new PipelineValidationError("Pick a stage inside this pipeline.");
    }
    const contact = await tx.contact.findFirst({
      where: { id: input.contactId, subAccountId: context.subAccountId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) {
      throw new PipelineValidationError("That contact does not exist in this workspace.");
    }
    if (input.assignedUserId) {
      const assignee = await tx.subAccountMembership.findFirst({
        where: {
          subAccountId: context.subAccountId,
          status: "ACTIVE",
          userId: input.assignedUserId,
        },
        select: { id: true },
      });
      if (!assignee) {
        throw new PipelineValidationError("Assignees must be members of this workspace.");
      }
    }

    const opportunity = await insertOpportunity(
      context,
      {
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        contactId: input.contactId,
        name: input.name,
        value: toDecimal(input.value),
        currency: input.currency,
        assignedUserId: input.assignedUserId,
        source: input.source,
        notes: input.notes,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
      },
      tx,
    );
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "opportunity.create",
      entityType: "Opportunity",
      entityId: opportunity.id,
      metadata: { pipelineId: input.pipelineId, stageId: input.stageId },
    });
    return opportunity;
  });
}

export async function updateOpportunityDetails(
  context: TenantContext,
  opportunityId: string,
  input: OpportunityUpdateInput,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.opportunity.findFirst({
      where: { id: opportunityId, subAccountId: context.subAccountId },
      select: { id: true, stageId: true, pipelineId: true, contactId: true },
    });
    if (!existing) {
      throw new PipelineValidationError("Opportunity not found.");
    }
    if (input.assignedUserId) {
      const assignee = await tx.subAccountMembership.findFirst({
        where: {
          subAccountId: context.subAccountId,
          status: "ACTIVE",
          userId: input.assignedUserId,
        },
        select: { id: true },
      });
      if (!assignee) {
        throw new PipelineValidationError("Assignees must be members of this workspace.");
      }
    }

    // Stage ownership sanity: the opportunity's stage belongs to its pipeline.
    if (input.stageId !== existing.stageId) {
      const stage = await tx.pipelineStage.findUnique({
        where: { id: input.stageId },
        select: { pipelineId: true },
      });
      if (!stage || stage.pipelineId !== existing.pipelineId) {
        throw new PipelineValidationError("Pick a stage inside this pipeline.");
      }
    }

    const opportunity = await updateOpportunity(
      context,
      opportunityId,
      {
        name: input.name,
        value: toDecimal(input.value),
        currency: input.currency,
        assignedUserId: input.assignedUserId,
        source: input.source,
        notes: input.notes,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
      },
      tx,
    );
    if (!opportunity) {
      throw new PipelineValidationError("Opportunity not found.");
    }
    await writeAuditLog(tx, {
      orgId: context.orgId,
      subAccountId: context.subAccountId,
      userId: context.userId,
      action: "opportunity.update",
      entityType: "Opportunity",
      entityId: opportunity.id,
    });
    return opportunity;
  });
}

export async function moveOpportunity(context: TenantContext, opportunityId: string, toStageId: string) {
  return prisma.$transaction(async (tx) => {
    const result = await moveOpportunityToStage(context, opportunityId, toStageId, tx);
    if (!result) {
      throw new PipelineValidationError("Opportunity not found.");
    }
    if (result.moved) {
      const opportunity = await findOpportunity(context, opportunityId, tx);
      await writeAuditLog(tx, {
        orgId: context.orgId,
        subAccountId: context.subAccountId,
        userId: context.userId,
        action: "opportunity.stage.move",
        entityType: "Opportunity",
        entityId: opportunityId,
        metadata: { toStageId },
      });
      if (opportunity) {
        await publishWorkflowEvent({
          type: "OPPORTUNITY_STAGE_CHANGED",
          orgId: context.orgId,
          subAccountId: context.subAccountId,
          entityId: opportunityId,
          metadata: {
            toStageId,
            stageName: opportunity.stage?.name,
            isWon: result.isWon,
            isLost: result.isLost,
          },
        });
      }
    }
    return result;
  });
}

/**
 * Board read: CLIENT_USER is locked to opportunities assigned to them.
 */
export async function getBoard(
  context: TenantContext,
  pipelineId: string,
  query: BoardQuery,
): Promise<{
  pipeline: NonNullable<Awaited<ReturnType<typeof findPipeline>>>;
  opportunities: Awaited<ReturnType<typeof listBoard>>;
} | null> {
  const pipeline = await findPipeline(context, pipelineId);
  if (!pipeline) {
    return null;
  }
  const restrictToAssigned = !hasPermission(context.role, "opportunities.assign");
  const opportunities = await listBoard(context, pipelineId, query, restrictToAssigned);
  return { pipeline, opportunities };
}

export async function getPipelines(context: TenantContext) {
  return listPipelines(context);
}

export async function getOpportunityDetail(context: TenantContext, opportunityId: string) {
  return findOpportunity(context, opportunityId);
}
