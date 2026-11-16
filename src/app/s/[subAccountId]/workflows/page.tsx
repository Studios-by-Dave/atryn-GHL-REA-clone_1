import { getWorkflowsList } from "@/features/workflows/queries";
import { WorkflowCreateForm } from "@/features/workflows/workflow-create-form";

export default async function WorkflowsPage({ params }: { params: Promise<{ subAccountId: string }> }) {
  const { subAccountId } = await params;
  const workflows = await getWorkflowsList(subAccountId);
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Workflows</h1>
      <WorkflowCreateForm subAccountId={subAccountId} />
      <ul className="mt-4 space-y-2">
        {(workflows ?? []).map((w) => (
          <li key={w.id} className="rounded border p-3">
            <div className="font-medium">{w.name}</div>
            {w.description ? <div className="text-sm text-gray-600">{w.description}</div> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
