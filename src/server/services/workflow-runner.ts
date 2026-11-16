import "server-only";
import { prisma } from "@/server/db/client";

export async function runWorkflow(runId: string) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflowVersion: { include: { actions: { orderBy: { position: "asc" } } } } },
  });
  if (!run) return;
  await prisma.workflowRun.update({ where: { id: runId }, data: { status: "RUNNING" } });

  const actions = run.workflowVersion.actions;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const startedAt = new Date();
    await prisma.workflowRunStep.create({
      data: {
        workflowRunId: runId,
        actionId: a.id,
        position: a.position,
        actionType: a.type,
        status: "RUNNING",
        startedAt,
      },
    });
    // placeholder execution
    await new Promise((r) => setTimeout(r, 10));
    await prisma.workflowRunStep.update({
      where: { workflowRunId_position: { workflowRunId: runId, position: a.position } },
      data: { status: "SUCCESS", finishedAt: new Date(), durationMs: 10 },
    });
    await prisma.workflowRun.update({ where: { id: runId }, data: { currentActionPosition: a.position } });
  }
  await prisma.workflowRun.update({ where: { id: runId }, data: { status: "COMPLETED", finishedAt: new Date() } });
}

export async function sweepPendingRuns() {
  const pending = await prisma.workflowRun.findMany({ where: { status: "PENDING" }, take: 50 });
  for (const r of pending) {
    try {
      await runWorkflow(r.id);
    } catch (e) {
      console.error("[runner] failed", r.id, e);
    }
  }
}
