import { requireTenantContext } from "@/server/tenant/context";
import { findWorkflow, listWorkflowRuns } from "@/server/services/workflows";
import { createVersionAction, publishVersionAction, addTriggerAction, addActionAction } from "@/features/workflows/actions";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ subAccountId: string; workflowId: string }>;
}) {
  const { subAccountId, workflowId } = await params;
  const ctx = await requireTenantContext(subAccountId);
  const workflow = await findWorkflow(ctx, workflowId);
  if (!workflow) return <main className="p-6">Not found.</main>;
  const runs = (await listWorkflowRuns(ctx, workflowId)) ?? [];

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">{workflow.name}</h1>
      <form action={createVersionAction} className="mt-4">
        <input type="hidden" name="subAccountId" value={subAccountId} />
        <input type="hidden" name="workflowId" value={workflowId} />
        <button type="submit" className="rounded bg-black px-3 py-1 text-white">New version</button>
      </form>
      <ul className="mt-4 space-y-2">
        {workflow.versions.map((v) => (
          <li key={v.id} className="rounded border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span>v{v.version} — {v.status}</span>
              <form action={publishVersionAction}>
                <input type="hidden" name="subAccountId" value={subAccountId} />
                <input type="hidden" name="workflowId" value={workflowId} />
                <input type="hidden" name="versionId" value={v.id} />
                <button type="submit" className="rounded border px-2 py-1 text-sm">Publish</button>
              </form>
            </div>
            <form action={addTriggerAction} className="flex gap-2">
              <input type="hidden" name="subAccountId" value={subAccountId} />
              <input type="hidden" name="versionId" value={v.id} />
              <input name="type" placeholder="trigger type" className="rounded border px-2 py-1 text-sm" />
              <button type="submit" className="rounded border px-2 py-1 text-sm">+ trigger</button>
            </form>
            <form action={addActionAction} className="flex gap-2">
              <input type="hidden" name="subAccountId" value={subAccountId} />
              <input type="hidden" name="versionId" value={v.id} />
              <input name="type" placeholder="action type" className="rounded border px-2 py-1 text-sm" />
              <button type="submit" className="rounded border px-2 py-1 text-sm">+ action</button>
            </form>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-xl font-semibold">Runs</h2>
      <ul className="mt-2 space-y-2">
        {runs.map((r) => (
          <li key={r.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.status}</span>
              <span className="text-sm text-gray-500">{new Date(r.startedAt).toLocaleString()}</span>
            </div>
            {r.isTestRun ? <span className="text-xs text-blue-600">test run</span> : null}
            {r.error ? <p className="text-sm text-red-600">{r.error}</p> : null}
            <ul className="mt-2 space-y-1">
              {r.steps.map((s) => (
                <li key={s.id} className="text-sm">
                  #{s.position} {s.actionType ?? "—"} — {s.status}
                  {s.durationMs != null ? ` (${s.durationMs}ms)` : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
        {runs.length === 0 ? <li className="text-sm text-gray-500">No runs yet.</li> : null}
      </ul>
    </main>
  );
}
