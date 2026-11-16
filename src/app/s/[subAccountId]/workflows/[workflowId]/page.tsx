import { requireTenantContext } from "@/server/tenant/context";
import { findWorkflow } from "@/server/services/workflows";
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

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">{workflow.name}</h1>
      <form action={createVersionAction} className="mt-4">
        <input type="hidden" name="subAccountId" value={subAccountId} />
        <input type="hidden" name="workflowId" value={workflowId} />
        <button type="submit" className="rounded bg-black px-3 py-1 text-white">New version</button>
      </form>
      <ul className="mt-4 space-y-2">
        {workflow.versions.map((v: any) => (
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
    </main>
  );
}
