"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ForbiddenError } from "@/server/auth/errors";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import type { ContactActionState } from "@/features/contacts/action-state";
import {
  opportunityInputSchema,
  opportunityUpdateSchema,
  pipelineInputSchema,
  stageInputSchema,
} from "@/features/pipelines/schemas";
import {
  PipelineValidationError,
  addStage,
  createOpportunity,
  createPipeline,
  deletePipeline,
  editStage,
  moveOpportunity,
  removeStage,
  updateOpportunityDetails,
  updatePipelineName,
} from "@/server/services/pipelines";

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

function pipelinePath(subAccountId: string, suffix = ""): string {
  return `/s/${subAccountId}/pipelines${suffix}`;
}

function toValidationErrorState(error: unknown): ContactActionState {
  if (error instanceof PipelineValidationError) {
    return { error: error.message };
  }
  throw error;
}

export async function createPipelineAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "opportunities.write");

  const parsed = pipelineInputSchema.safeParse({ name: readString(formData, "name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the pipeline name." };
  }

  try {
    const pipeline = await createPipeline(context, parsed.data);
    revalidatePath(pipelinePath(subAccountId));
    redirect(pipelinePath(subAccountId, `/${pipeline.id}`));
  } catch (error) {
    return toValidationErrorState(error);
  }
}

export async function renamePipelineAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "opportunities.write");
  const pipelineId = uuidFromForm(formData, "pipelineId");

  const parsed = pipelineInputSchema.safeParse({ name: readString(formData, "name") });
  if (!parsed.success) {
    return;
  }
  await updatePipelineName(context, pipelineId, parsed.data);
  revalidatePath(pipelinePath(subAccountId));
  revalidatePath(pipelinePath(subAccountId, `/${pipelineId}`));
}

export async function deletePipelineAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "opportunities.write");
  const pipelineId = uuidFromForm(formData, "pipelineId");

  await deletePipeline(context, pipelineId);
  revalidatePath(pipelinePath(subAccountId));
  redirect(pipelinePath(subAccountId));
}

export async function createStageAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "opportunities.write");
  const pipelineId = uuidFromForm(formData, "pipelineId");

  const parsed = stageInputSchema.safeParse({
    name: readString(formData, "name"),
    probability: readString(formData, "probability"),
    isWon: formData.get("isWon"),
    isLost: formData.get("isLost"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the stage details." };
  }

  try {
    await addStage(context, pipelineId, parsed.data);
    revalidatePath(pipelinePath(subAccountId, `/${pipelineId}`));
    return { error: null };
  } catch (error) {
    return toValidationErrorState(error);
  }
}

export async function updateStageAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "opportunities.write");
  const stageId = uuidFromForm(formData, "stageId");
  const pipelineId = uuidFromForm(formData, "pipelineId");

  const parsed = stageInputSchema.safeParse({
    name: readString(formData, "name"),
    probability: readString(formData, "probability"),
    isWon: formData.get("isWon"),
    isLost: formData.get("isLost"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the stage details." };
  }

  try {
    await editStage(context, stageId, parsed.data);
    revalidatePath(pipelinePath(subAccountId, `/${pipelineId}`));
    return { error: null };
  } catch (error) {
    return toValidationErrorState(error);
  }
}

export async function deleteStageAction(formData: FormData): Promise<void> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "opportunities.write");
  const stageId = uuidFromForm(formData, "stageId");
  const pipelineId = uuidFromForm(formData, "pipelineId");

  await removeStage(context, stageId);
  revalidatePath(pipelinePath(subAccountId, `/${pipelineId}`));
}

export async function createOpportunityAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "opportunities.write");
  const pipelineId = uuidFromForm(formData, "pipelineId");

  const parsed = opportunityInputSchema.safeParse({
    pipelineId,
    stageId: readString(formData, "stageId"),
    contactId: readString(formData, "contactId"),
    name: readString(formData, "name"),
    value: readString(formData, "value"),
    currency: readString(formData, "currency"),
    assignedUserId: readString(formData, "assignedUserId"),
    source: readString(formData, "source"),
    notes: readString(formData, "notes"),
    expectedCloseDate: readString(formData, "expectedCloseDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the opportunity details." };
  }

  try {
    await createOpportunity(context, parsed.data);
    revalidatePath(pipelinePath(subAccountId, `/${pipelineId}`));
    return { error: null };
  } catch (error) {
    return toValidationErrorState(error);
  }
}

export async function updateOpportunityAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const { subAccountId, context } = await tenantFromForm(formData);
  requirePermission(context, "opportunities.write");
  const opportunityId = uuidFromForm(formData, "opportunityId");

  const parsed = opportunityUpdateSchema.safeParse({
    stageId: readString(formData, "stageId"),
    name: readString(formData, "name"),
    value: readString(formData, "value"),
    currency: readString(formData, "currency"),
    assignedUserId: readString(formData, "assignedUserId"),
    source: readString(formData, "source"),
    notes: readString(formData, "notes"),
    expectedCloseDate: readString(formData, "expectedCloseDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the opportunity details." };
  }

  try {
    await updateOpportunityDetails(context, opportunityId, parsed.data);
    revalidatePath(pipelinePath(subAccountId));
    return { error: null };
  } catch (error) {
    return toValidationErrorState(error);
  }
}

/**
 * Called directly (not via <form>) by the board's drag-and-drop handler.
 * Read-only roles get an early 403 before any write happens.
 */
export async function moveOpportunityAction(
  subAccountId: string,
  opportunityId: string,
  toStageId: string,
): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(subAccountId).success) {
    return { error: "Invalid workspace." };
  }
  if (!z.uuid().safeParse(opportunityId).success || !z.uuid().safeParse(toStageId).success) {
    return { error: "Invalid move." };
  }
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "opportunities.write");

  try {
    await moveOpportunity(context, opportunityId, toStageId);
    revalidatePath(pipelinePath(subAccountId));
    return { error: null };
  } catch (error) {
    if (error instanceof PipelineValidationError) {
      return { error: error.message };
    }
    throw error;
  }
}
