import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantContext } from "@/server/rbac/guards";

export async function listWorkflows(context: TenantContext) {
  return prisma.workflow.findMany({
    where: { subAccountId: context.subAccountId },
    orderBy: { updatedAt: "desc" },
    include: { currentVersion: { select: { id: true, version: true } } },
  });
}

export async function findWorkflow(context: TenantContext, id: string) {
  return prisma.workflow.findFirst({
    where: { id, subAccountId: context.subAccountId },
    include: { versions: { orderBy: { version: "desc" } } },
  });
}

export async function createWorkflow(context: TenantContext, name: string, description?: string | null) {
  return prisma.workflow.create({
    data: { subAccountId: context.subAccountId, name, description: description ?? null },
  });
}

export async function deleteWorkflow(context: TenantContext, id: string) {
  const w = await prisma.workflow.findFirst({ where: { id, subAccountId: context.subAccountId } });
  if (!w) return null;
  await prisma.workflow.delete({ where: { id } });
  return w;
}

export async function createVersion(context: TenantContext, workflowId: string) {
  const w = await prisma.workflow.findFirst({ where: { id: workflowId, subAccountId: context.subAccountId } });
  if (!w) return null;
  const last = await prisma.workflowVersion.findFirst({ where: { workflowId }, orderBy: { version: "desc" } });
  const next = (last?.version ?? 0) + 1;
  return prisma.workflowVersion.create({ data: { workflowId, version: next } });
}

export async function addTrigger(context: TenantContext, versionId: string, type: string) {
  const v = await prisma.workflowVersion.findUnique({ where: { id: versionId } });
  if (!v) return null;
  const w = await prisma.workflow.findFirst({ where: { id: v.workflowId, subAccountId: context.subAccountId } });
  if (!w) return null;
  return prisma.workflowTrigger.create({ data: { workflowVersionId: versionId, type: type as any } });
}

export async function addAction(context: TenantContext, versionId: string, type: string) {
  const v = await prisma.workflowVersion.findUnique({ where: { id: versionId } });
  if (!v) return null;
  const w = await prisma.workflow.findFirst({ where: { id: v.workflowId, subAccountId: context.subAccountId } });
  if (!w) return null;
  const last = await prisma.workflowAction.findFirst({ where: { workflowVersionId: versionId }, orderBy: { position: "desc" } });
  const pos = (last?.position ?? 0) + 1;
  return prisma.workflowAction.create({ data: { workflowVersionId: versionId, type: type as any, position: pos } });
}

export async function listWorkflowRuns(context: TenantContext, workflowId: string) {
  const w = await prisma.workflow.findFirst({ where: { id: workflowId, subAccountId: context.subAccountId } });
  if (!w) return [];
  return prisma.workflowRun.findMany({
    where: { workflowId, subAccountId: context.subAccountId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { steps: { orderBy: { position: "asc" } } },
  });
}

export async function publishVersion(context: TenantContext, workflowId: string, versionId: string) {
  const w = await prisma.workflow.findFirst({ where: { id: workflowId, subAccountId: context.subAccountId } });
  if (!w) return null;
  const v = await prisma.workflowVersion.findFirst({ where: { id: versionId, workflowId } });
  if (!v) return null;
  await prisma.workflow.update({ where: { id: workflowId }, data: { currentVersionId: versionId, status: "ACTIVE" } });
  await prisma.workflowVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  return v;
}
