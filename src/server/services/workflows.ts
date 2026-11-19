import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { hasPermission } from "@/server/rbac/permissions";
import type { TenantContext } from "@/server/rbac/guards";
import * as repo from "@/server/repositories/workflows";
import { prisma } from "@/server/db/client";
import { runWorkflow } from "@/server/services/workflow-runner";

export async function listWorkflows(context: TenantContext) {
  if (!hasPermission(context.role, "workflows.read")) return null;
  return repo.listWorkflows(context);
}

export async function findWorkflow(context: TenantContext, id: string) {
  if (!hasPermission(context.role, "workflows.read")) return null;
  return repo.findWorkflow(context, id);
}

export async function createWorkflow(context: TenantContext, name: string, description?: string | null) {
  if (!hasPermission(context.role, "workflows.manage")) throw new Error("forbidden");
  return repo.createWorkflow(context, name, description);
}

export async function deleteWorkflow(context: TenantContext, id: string) {
  if (!hasPermission(context.role, "workflows.manage")) throw new Error("forbidden");
  return repo.deleteWorkflow(context, id);
}

export async function createVersion(context: TenantContext, workflowId: string) {
  if (!hasPermission(context.role, "workflows.manage")) throw new Error("forbidden");
  return repo.createVersion(context, workflowId);
}

export async function publishVersion(context: TenantContext, workflowId: string, versionId: string) {
  if (!hasPermission(context.role, "workflows.manage")) throw new Error("forbidden");
  return repo.publishVersion(context, workflowId, versionId);
}

export async function addTrigger(context: TenantContext, versionId: string, type: string) {
  if (!hasPermission(context.role, "workflows.manage")) throw new Error("forbidden");
  return repo.addTrigger(context, versionId, type);
}

export async function addAction(context: TenantContext, versionId: string, type: string) {
  if (!hasPermission(context.role, "workflows.manage")) throw new Error("forbidden");
  return repo.addAction(context, versionId, type);
}

export async function listWorkflowRuns(context: TenantContext, workflowId: string) {
  if (!hasPermission(context.role, "workflows.read")) return null;
  return repo.listWorkflowRuns(context, workflowId);
}

export async function testRunWorkflow(context: TenantContext, workflowId: string, contactId: string | null) {
  if (!hasPermission(context.role, "workflows.manage")) throw new Error("forbidden");
  const w = await prisma.workflow.findFirst({ where: { id: workflowId, subAccountId: context.subAccountId } });
  if (!w || !w.currentVersionId) throw new Error("no published version");
  const run = await prisma.workflowRun.create({
    data: {
      subAccountId: context.subAccountId,
      workflowId: w.id,
      workflowVersionId: w.currentVersionId,
      contactId: contactId ?? undefined,
      triggerEvent: { type: "MANUAL_TEST", contactId } as Prisma.InputJsonValue,
      status: "PENDING",
      isTestRun: true,
      startedByUserId: context.userId,
    },
  });
  void runWorkflow(run.id);
  return run;
}
