import "server-only";
import { prisma } from "@/server/db/client";
import { runWorkflow } from "@/server/services/workflow-runner";

export type WorkflowEventType =
  | "FORM_SUBMITTED"
  | "CONTACT_CREATED"
  | "TAG_ADDED"
  | "APPOINTMENT_BOOKED"
  | "APPOINTMENT_STATUS_CHANGED"
  | "OPPORTUNITY_STAGE_CHANGED"
  | "INBOUND_SMS"
  | "INBOUND_EMAIL";

export type WorkflowEvent = {
  type: WorkflowEventType;
  orgId: string;
  subAccountId: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Durable dispatch stub (W5b): finds published workflow versions whose trigger
 * type matches the event and creates PENDING WorkflowRun rows. The runner
 * (W5c) will pick these up. Falls back to console in dev for visibility.
 */
export async function publishWorkflowEvent(event: WorkflowEvent): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    console.debug(`[workflow event] ${event.type} opportunity=${event.entityId}`, event.metadata);
  }
  try {
    const workflows = await prisma.workflow.findMany({
      where: { subAccountId: event.subAccountId, status: "ACTIVE", currentVersionId: { not: null } },
      include: { currentVersion: { include: { triggers: true } } },
    });
    for (const w of workflows) {
      const v = w.currentVersion;
      if (!v) continue;
      const matches = v.triggers.some((t) => String(t.type) === event.type);
      if (!matches) continue;
      const run = await prisma.workflowRun.create({
        data: {
          subAccountId: event.subAccountId,
          workflowId: w.id,
          workflowVersionId: v.id,
          triggerEvent: event as any,
          status: "PENDING",
        },
      });
      // fire-and-forget run
      void runWorkflow(run.id);
    }
  } catch (e) {
    console.error("[workflow dispatch] failed", e);
  }
}
