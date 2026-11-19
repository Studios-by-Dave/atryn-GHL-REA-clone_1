import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkflowActionType } from "@/generated/prisma/enums";
import type { TenantContext } from "@/server/rbac/guards";
import type { ContactInput } from "@/features/contacts/schemas";
import { prisma } from "@/server/db/client";

type JsonObject = Record<string, unknown>;

type Action = {
  id: string;
  position: number;
  type: string;
  config: JsonObject;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function delayMsFor(config: JsonObject): number {
  const minutes = Number(config.delayMinutes ?? config.delay ?? 0);
  const seconds = Number(config.delaySeconds ?? 0);
  if (Number.isFinite(minutes) && minutes > 0) return minutes * 60 * 1000;
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return 0;
}

function evalCondition(config: JsonObject, ctx: JsonObject): boolean {
  const c = asObject(config.condition ?? config);
  const field = String(c.field ?? "");
  const op = String(c.operator ?? c.op ?? "eq");
  const expected = c.value;
  const actual = field
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as JsonObject)[k]), ctx);
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

async function loadContext(run: { triggerEvent: unknown; contactId: string | null }): Promise<JsonObject> {
  const ctx: JsonObject = {
    triggerEvent: run.triggerEvent ?? {},
    ...asObject(asObject(run.triggerEvent).metadata),
  };
  if (run.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: run.contactId } });
    if (contact) ctx.contact = contact;
  }
  return ctx;
}

async function executeOne(runId: string, a: Action, ctx: JsonObject, tenant: TenantContext | null) {
  const startedAt = new Date();
  const contact = ctx.contact as { id?: string } | undefined;

  await prisma.workflowRunStep.upsert({
    where: { workflowRunId_position: { workflowRunId: runId, position: a.position } },
    create: {
      workflowRunId: runId,
      actionId: a.id,
      position: a.position,
      actionType: a.type as WorkflowActionType,
      status: "RUNNING",
      startedAt,
      input: toJson(a.config),
    },
    update: { status: "RUNNING", startedAt, error: null },
  });

  const cfg = a.config;
  let output: JsonObject = { ok: true };

  if (tenant) {
    const contactsSvc = await import("@/server/services/contacts");
    const pipelinesSvc = await import("@/server/services/pipelines");
    switch (a.type) {
      case "ADD_TAG": {
        let tagId: string | null = typeof cfg.tagId === "string" ? cfg.tagId : null;
        if (!tagId && cfg.tagName) {
          const tag = await contactsSvc.createTag(tenant, String(cfg.tagName));
          tagId = tag.id;
        }
        if (tagId && contact?.id) {
          await contactsSvc.tagContacts(tenant, tagId, [contact.id], "add");
        }
        output = { tagId };
        break;
      }
      case "REMOVE_TAG": {
        const tagId = typeof cfg.tagId === "string" ? cfg.tagId : null;
        if (tagId && contact?.id) {
          await contactsSvc.tagContacts(tenant, tagId, [contact.id], "remove");
        }
        output = { tagId };
        break;
      }
      case "UPDATE_CONTACT_FIELD": {
        if (contact?.id && cfg.field) {
          const input: Record<string, unknown> = {};
          input[String(cfg.field)] = cfg.value;
          await contactsSvc.updateContactDetails(tenant, contact.id, input as unknown as ContactInput);
        }
        output = { field: cfg.field, value: cfg.value };
        break;
      }
      case "MOVE_OPPORTUNITY": {
        if (typeof cfg.opportunityId === "string" && typeof cfg.stageId === "string") {
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
    data: { status: "SUCCESS", finishedAt: new Date(), durationMs: 10, output: toJson(output) },
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

  const actions = run.workflowVersion.actions as unknown as Action[];
  const ctx = await loadContext(run);

  let tenant: TenantContext | null = null;
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
            actionType: a.type as WorkflowActionType,
            status: "WAITING",
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 0,
            input: toJson(a.config),
            output: toJson({ resumedAt: resumeAt.toISOString() }),
          },
          update: {
            status: "WAITING",
            finishedAt: new Date(),
            output: toJson({ resumedAt: resumeAt.toISOString() }),
          },
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
            actionType: a.type as WorkflowActionType,
            status: "SUCCESS",
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 0,
            input: toJson(a.config),
            output: toJson({ result: ok }),
          },
          update: { status: "SUCCESS", finishedAt: new Date(), output: toJson({ result: ok }) },
        });
        await prisma.workflowRun.update({ where: { id: runId }, data: { currentActionPosition: a.position } });

        if (!ok) {
          // branch: skip to configured position or end
          const skipTo = a.config.skipToPosition ?? a.config.elsePosition ?? null;
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
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
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
