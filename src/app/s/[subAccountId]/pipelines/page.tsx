import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { requireTenantContext } from "@/server/tenant/context";
import { getPipelinesList } from "@/features/pipelines/queries";
import { deletePipelineAction, renamePipelineAction } from "@/features/pipelines/actions";
import { PipelineCreateForm } from "@/features/pipelines/pipeline-create-form";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string }>;
};

export default async function PipelinesPage({ params }: PageProps) {
  const { subAccountId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "opportunities.read");

  const pipelines = await getPipelinesList(subAccountId);
  const canWrite = hasPermission(context.role, "opportunities.write");
  const first = pipelines[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Pipelines</h1>
        <p className="mt-1 text-sm text-slate-500">
          {pipelines.length} pipeline{pipelines.length === 1 ? "" : "s"}
        </p>
      </header>

      {canWrite ? <PipelineCreateForm subAccountId={subAccountId} /> : null}

      {pipelines.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No pipelines yet.{canWrite ? " Create the first one above." : ""}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {pipelines.map((pipeline) => (
            <li key={pipeline.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link
                href={`/s/${subAccountId}/pipelines/${pipeline.id}`}
                className="font-medium text-indigo-600 hover:text-indigo-700"
              >
                {pipeline.name}
              </Link>
              <span className="text-sm text-slate-500">
                {pipeline.stages.length} stages · {pipeline._count.opportunities} opportunities
              </span>
              {pipeline.isDefault ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Default</span>
              ) : null}
              <span className="flex-1" />
              {canWrite ? (
                <>
                  <form action={renamePipelineAction} className="flex gap-2">
                    <input type="hidden" name="subAccountId" value={subAccountId} />
                    <input type="hidden" name="pipelineId" value={pipeline.id} />
                    <input
                      name="name"
                      defaultValue={pipeline.name}
                      required
                      aria-label={`Rename ${pipeline.name}`}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Rename
                    </button>
                  </form>
                  <form action={deletePipelineAction}>
                    <input type="hidden" name="subAccountId" value={subAccountId} />
                    <input type="hidden" name="pipelineId" value={pipeline.id} />
                    <button
                      type="submit"
                      className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </form>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {first ? (
        <p className="text-sm text-slate-500">
          Tip: open a pipeline to work its board — <Link href={`/s/${subAccountId}/pipelines/${first.id}`} className="text-indigo-600">go to {first.name}</Link>.
        </p>
      ) : null}
    </div>
  );
}
