"use server";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/context";
import { createWorkflow, deleteWorkflow, createVersion, publishVersion, addTrigger, addAction } from "@/server/services/workflows";
import { workflowInputSchema } from "./schemas";
import type { WorkflowActionState } from "./action-state";

export async function createWorkflowAction(
  _prev: WorkflowActionState,
  formData: FormData,
): Promise<WorkflowActionState> {
  const subAccountId = String(formData.get("subAccountId") ?? "");
  const ctx = await requireTenantContext(subAccountId);
  const parsed = workflowInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  await createWorkflow(ctx, parsed.data.name, parsed.data.description);
  revalidatePath(`/s/${subAccountId}/workflows`);
  return { success: true };
}

export async function deleteWorkflowAction(formData: FormData) {
  const subAccountId = String(formData.get("subAccountId") ?? "");
  const id = String(formData.get("id") ?? "");
  const ctx = await requireTenantContext(subAccountId);
  await deleteWorkflow(ctx, id);
  revalidatePath(`/s/${subAccountId}/workflows`);
}

export async function createVersionAction(formData: FormData) {
  const subAccountId = String(formData.get("subAccountId") ?? "");
  const workflowId = String(formData.get("workflowId") ?? "");
  const ctx = await requireTenantContext(subAccountId);
  await createVersion(ctx, workflowId);
  revalidatePath(`/s/${subAccountId}/workflows/${workflowId}`);
}

export async function publishVersionAction(formData: FormData) {
  const subAccountId = String(formData.get("subAccountId") ?? "");
  const workflowId = String(formData.get("workflowId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const ctx = await requireTenantContext(subAccountId);
  await publishVersion(ctx, workflowId, versionId);
  revalidatePath(`/s/${subAccountId}/workflows/${workflowId}`);
  revalidatePath(`/s/${subAccountId}/workflows`);
}

export async function addTriggerAction(formData: FormData) {
  const subAccountId = String(formData.get("subAccountId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const type = String(formData.get("type") ?? "");
  const ctx = await requireTenantContext(subAccountId);
  await addTrigger(ctx, versionId, type);
  revalidatePath(`/s/${subAccountId}/workflows`);
}

export async function addActionAction(formData: FormData) {
  const subAccountId = String(formData.get("subAccountId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const type = String(formData.get("type") ?? "");
  const ctx = await requireTenantContext(subAccountId);
  await addAction(ctx, versionId, type);
  revalidatePath(`/s/${subAccountId}/workflows`);
}
