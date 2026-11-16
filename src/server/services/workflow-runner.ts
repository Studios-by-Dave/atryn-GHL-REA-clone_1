import "server-only";
import { prisma } from "@/server/db/client";

type Action = {
  id: string;
  position: number;
  type: string;
  config: any;
};

function delayMsFor(config: any): number {
  const minutes = Number(config?.delayMinutes ?? config?.delay ?? 0);
  const seconds = Number(config?.delaySeconds ?? 0);
  if (Number.isFinite(minutes) && minutes > 0) return minutes * 60 * 1000;
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return 0;
}

function evalCondition(config: any, ctx: Record<string, any>): boolean {
  const c = config?.condition ?? config ?? {};
  const field = String(c.field ?? "");
  const op = String(c.operator ?? c.op ?? "eq");
  const expected = c.value;
  const actual = field.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);
  switch (op) {
    case "eq":
    case "equals":
      return actual === expected || String(actual) === String(expected);
    case "ne":
    case "notEquals":
      return !(actual === expected || String(actual) === String(expected));
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "truthy":
      return Boolean(actual);
    default:
      return Boolean(actual);
  }
}

async function loadContext(run: any): Promise<Record<string, any>> {
  const ctx: Record<string, any> = {
    triggerEvent: run.triggerEvent ?? {},
    ...(run.triggerEvent?.metadata ?? {}),
  };
  if (run.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: run.contactId } });
    if (contact) ctx.contact = contact;
  }
  return ctx;
}

async function executeOne(runId: string, a: Action, ctx: Record<string, any>, tenant: any) {
  const startedAt = new Date();
  await prisma.workflowRunStep.upsert({
    where: { workflowRunId_position: { workflowRunId: runId, position: a.position } },
    create: {
      workflowRunId: runId,
      actionId: a.id,
      position: a.position,
      actionType: a.type as any,
      status: "RUNNING",
      startedAt,
      input: a.config ?? {},
    },
    update: { status: "RUNNING", startedAt, error: null },
  });

  const cfg = a.config ?? {};
  let output: any = { ok: true };

  if (tenant) {
    const contactsSvc = await import("@/server/services/contacts");
    const pipelinesSvc = await import("@/server/services/pipelines");
    switch (a.type) {
      case "ADD_TAG": {
        let tagId = cfg.tagId;
        if (!tagId && cfg.tagName) {
          const tag = await contactsSvc.createTag(tenant, String(cfg.tagName));
          tagId = tag.id;
        }
        if (tagId && ctx.contact?.id) {
          await contactsSvc.tagContacts(tenant, tagId, [ctx.contact.id], "add");
        }
        output = { tagId };
        break;
      }
      case "REMOVE_TAG": {
        if (cfg.tagId && ctx.contact?.id) {
          await contactsSvc.tagContacts(tenant, cfg.tagId, [ctx.contact.id], "remove");
        }
        output = { tagId: cfg.tagId };
        break;
      }
      case "UPDATE_CONTACT_FIELD": {
        if (ctx.contact?.id && cfg.field) {
          const input: any = {};
          input[cfg.field] = cfg.value;
          await contactsSvc.updateContactDetails(tenant, ctx.contact.id, input);
        }
        output = { field: cfg.field, value: cfg.value };
        break;
      }
      case "MOVE_OPPORTUNITY": {
        if (cfg.opportunityId && cfg.stageId) {
          await pipelinesSvc.moveOpportunity(tenant, cfg.opportunityId, cfg.stageId);
        }
        output = { opportunityId: cfg.opportunityId, stageId: cfg.stageId };
        break;
      }
      case "CREATE_TASK":
      case "SEND_EMAIL":
      case "SEND_SMS":
      case "NOTIFY_USER":
      case "WEBHOOK":
        // services not yet implemented; log for now
        console.debug(`[workflow action] ${a.type} stub`, cfg);
        break;
      default:
        await new Promise((r) => setTimeout(r, 10));
        break;
    }
  } else {
    await new Promise((r) => setTimeout(r, 10));
  }

  await prisma.workflowRunStep.update({
    where: { workflowRunId_position: { workflowRunId: runId, position: a.position } },
    data: { status: "SUCCESS", finishedAt: new Date(), durationMs: 10, output },
  });
}

export async function runWorkflow(runId: string, fromPosition?: number) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflowVersion: { include: { actions: { orderBy: { position: "asc" } } } } },
  });
  if (!run) return;
  if (run.status === "CANCELLED" || run.status === "COMPLETED" || run.status === "FAILED") return;

  await prisma.workflowRun.update({ where: { id: runId }, data: { status: "RUNNING" } });

  const actions: Action[] = run.workflowVersion.actions as any;
  const ctx = await loadContext(run);

  let tenant: any = null;
  if (run.startedByUserId) {
    const sub = await prisma.subAccount.findUnique({ where: { id: run.subAccountId } });
    if (sub) {
      tenant = { orgId: sub.orgId, subAccountId: run.subAccountId, userId: run.startedByUserId, role: "AGENT" };
    }
  }

  let i = 0;
  if (fromPosition != null) {
    i = actions.findIndex((a) => a.position > fromPosition);
    if (i < 0) i = actions.length;
  } else if (run.currentActionPosition != null) {
    i = actions.findIndex((a) => a.position > run.currentActionPosition);
    if (i < 0) i = actions.length;
  }

  try {
    while (i < actions.length) {
      const a = actions[i];

      if (a.type === "WAIT") {
        const ms = delayMsFor(a.config);
        const resumeAt = new Date(Date.now() + ms);
        await prisma.workflowRunStep.upsert({
          where: { workflowRunId_position: { workflowRunId: runId, position: a.position } },
          create: {
            workflowRunId: runId,
            actionId: a.id,
            position: a.position,
            actionType: a.type as any,
            status: "WAITING",
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 0,
            input: a.config ?? {},
            output: { resumedAt: resumeAt.toISOString() },
          },
          update: { status: "WAITING", finishedAt: new Date(), output: { resumedAt: resumeAt.toISOString() } },
        });
        await prisma.workflowRun.update({
          where: { id: runId },
          data: { status: "WAITING", resumeAt, currentActionPosition: a.position },
        });
        return; // durable bookmark; reconciliation sweep resumes
      }

      if (a.type === "CONDITION") {
        const ok = evalCondition(a.config, ctx);
        await prisma.workflowRunStep.upsert({
          where: { workflowRunId_position: { workflowRunId: runId, position: a.position } },
          create: {
            workflowRunId: runId,
            actionId: a.id,
            position: a.position,
            actionType: a.type as any,
            status: "SUCCESS",
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 0,
            input: a.config ?? {},
            output: { result: ok },
          },
          update: { status: "SUCCESS", finishedAt: new Date(), output: { result: ok } },
        });
        await prisma.workflowRun.update({ where: { id: runId }, data: { currentActionPosition: a.position } });

        if (!ok) {
          // branch: skip to configured position or end
          const skipTo = a.config?.skipToPosition ?? a.config?.elsePosition ?? null;
          if (skipTo != null) {
            const idx = actions.findIndex((x) => x.position >= Number(skipTo));
            i = idx < 0 ? actions.length : idx;
          } else {
            // skip remaining actions
            i = actions.length;
          }
          continue;
        }
        i++;
        continue;
      }

      await executeOne(runId, a, ctx, tenant);
      await prisma.workflowRun.update({ where: { id: runId }, data: { currentActionPosition: a.position } });
      i++;
    }

    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "COMPLETED", finishedAt: new Date(), resumeAt: null },
    });
  } catch (e: any) {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "FAILED", error: String(e?.message ?? e), finishedAt: new Date() },
    });
    throw e;
  }
}

export async function resumeWorkflow(runId: string) {
  const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "WAITING") return;
  if (run.resumeAt && run.resumeAt.getTime() > Date.now()) return;
  await runWorkflow(runId, run.currentActionPosition ?? undefined);
}

export async function sweepPendingRuns() {
  // PENDING runs
  const pending = await prisma.workflowRun.findMany({ where: { status: "PENDING" }, take: 50 });
  for (const r of pending) {
    try {
      await runWorkflow(r.id);
    } catch (e) {
      console.error("[runner] failed", r.id, e);
    }
  }
  // WAITING runs past due
  const waiting = await prisma.workflowRun.findMany({
    where: { status: "WAITING", resumeAt: { lte: new Date() } },
    take: 50,
  });
  for (const r of waiting) {
    try {
      await resumeWorkflow(r.id);
    } catch (e) {
      console.error("[runner] resume failed", r.id, e);
    }
  }
}