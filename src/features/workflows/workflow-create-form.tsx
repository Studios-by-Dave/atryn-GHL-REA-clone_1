"use client";
import { useActionState } from "react";
import { createWorkflowAction } from "./actions";
import { initialWorkflowState } from "./action-state";

export function WorkflowCreateForm({ subAccountId }: { subAccountId: string }) {
  const [state, action, pending] = useActionState(createWorkflowAction, initialWorkflowState);
  return (
    <form action={action} className="mt-4 flex gap-2">
      <input type="hidden" name="subAccountId" value={subAccountId} />
      <input name="name" placeholder="Workflow name" className="rounded border px-2 py-1" required />
      <button type="submit" disabled={pending} className="rounded bg-black px-3 py-1 text-white">
        Create
      </button>
      {state?.error ? <span className="text-red-600">{state.error}</span> : null}
    </form>
  );
}
