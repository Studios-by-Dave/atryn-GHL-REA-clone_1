import "server-only";

export type WorkflowEventType = "OPPORTUNITY_STAGE_CHANGED";

export type WorkflowEvent = {
  type: WorkflowEventType;
  orgId: string;
  subAccountId: string;
  /** The entity the event is about. */
  entityId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Minimal in-process event bus. Phase 5 (workflow engine) will replace the
 * console sink with durable dispatch; callers should keep publishing as-is.
 */
export async function publishWorkflowEvent(event: WorkflowEvent): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    console.debug(
      `[workflow event] ${event.type} opportunity=${event.entityId}`,
      event.metadata,
    );
  }
}
