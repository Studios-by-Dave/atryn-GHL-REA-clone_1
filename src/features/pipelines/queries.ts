import "server-only";

import { requireTenantContext } from "@/server/tenant/context";
import type { BoardQuery } from "@/features/pipelines/schemas";
import {
  getBoard,
  getOpportunityDetail,
  getPipelines,
} from "@/server/services/pipelines";

export async function getPipelinesList(subAccountId: string) {
  const context = await requireTenantContext(subAccountId);
  return getPipelines(context);
}

export async function getPipelineBoard(subAccountId: string, pipelineId: string, query: BoardQuery) {
  const context = await requireTenantContext(subAccountId);
  return getBoard(context, pipelineId, query);
}

export async function getOpportunity(subAccountId: string, opportunityId: string) {
  const context = await requireTenantContext(subAccountId);
  return getOpportunityDetail(context, opportunityId);
}
