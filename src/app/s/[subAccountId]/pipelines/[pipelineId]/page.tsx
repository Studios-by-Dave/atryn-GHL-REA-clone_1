import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { requireTenantContext } from "@/server/tenant/context";
import { getPipelineBoard } from "@/features/pipelines/queries";
import { parseBoardQuery } from "@/features/pipelines/schemas";
import { PipelineBoard, type Card } from "@/features/pipelines/board";
import { OpportunityForm } from "@/features/pipelines/opportunity-form";
import { StageEditor } from "@/features/pipelines/stage-editor";
import { listAssignableUsers, listContactOptions } from "@/server/repositories/pipelines";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string; pipelineId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const inputClass = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

export default async function PipelineBoardPage({ params, searchParams }: PageProps) {
  const { subAccountId, pipelineId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) notFound();
  if (!z.string().uuid().safeParse(pipelineId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "opportunities.read");

  const sp = await searchParams;
  const query = parseBoardQuery(sp);
  const board = await getPipelineBoard(subAccountId, pipelineId, query);
  if (!board) notFound();

  const canWrite = hasPermission(context.role, "opportunities.write");
  const { pipeline, opportunities } = board;
  const [owners, contacts] = await Promise.all([
    canWrite ? listAssignableUsers(context) : Promise.resolve([]),
    canWrite ? listContactOptions(context) : Promise.resolve([]),
  ]);

  const cards: Card[] = opportunities.map((opportunity) => ({
    id: opportunity.id,
    stageId: opportunity.stageId,
    name: opportunity.name,
    value: opportunity.value.toString(),
    currency: opportunity.currency,
    status: opportunity.status,
    contactName: `${opportunity.contact.firstName} ${opportunity.contact.lastName}`.trim(),
    assigneeName: opportunity.assignee?.name ?? null,
  }));

  const filtersHref = (overrides: Record<string, string>) => {
    const search = new URLSearchParams();
    const assignee = overrides.assignee ?? query.assignee;
    const status = overrides.status ?? query.status;
    const valueMin = overrides.valueMin ?? String(query.valueMin);
    const closeBefore = overrides.closeBefore ?? query.closeBefore;
    if (assignee) search.set("assignee", assignee);
    if (status !== "all") search.set("status", status);
    if (Number(valueMin) > 0) search.set("valueMin", valueMin);
    if (closeBefore) search.set("closeBefore", closeBefore);
    const qs = search.toString();
    return `/s/${subAccountId}/pipelines/${pipelineId}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/s/${subAccountId}/pipelines`} className="text-sm text-slate-500 hover:text-slate-800">
          ← All pipelines
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{pipeline.name}</h1>
          <span className="text-sm text-slate-500">
            {opportunities.length} opportunit{opportunities.length === 1 ? "y" : "ies"} on board
          </span>
        </div>
      </header>

      <form method="get" className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <select name="assignee" defaultValue={query.assignee} className={inputClass}>
          <option value="">Any assignee</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name ?? owner.email}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={query.status} className={inputClass}>
          <option value="all">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
        </select>
        <input
          name="valueMin"
          type="number"
          min={0}
          step="0.01"
          defaultValue={query.valueMin > 0 ? query.valueMin : ""}
          placeholder="Min value"
          className={inputClass}
        />
        <input name="closeBefore" type="date" defaultValue={query.closeBefore} className={inputClass} />
        <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          Apply
        </button>
        <a href={filtersHref({})} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Clear
        </a>
      </form>

      <PipelineBoard
        subAccountId={subAccountId}
        stages={pipeline.stages}
        cards={cards}
        canWrite={canWrite}
      />

      {canWrite ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-950">Add opportunity</h2>
          <OpportunityForm
            subAccountId={subAccountId}
            pipelineId={pipeline.id}
            stages={pipeline.stages}
            contacts={contacts.map((contact) => ({
              id: contact.id,
              name: `${contact.firstName} ${contact.lastName}`.trim() || contact.email || "Unnamed",
            }))}
            owners={owners.map((owner) => ({ id: owner.id, name: owner.name ?? owner.email }))}
          />
          <StageEditor subAccountId={subAccountId} pipelineId={pipeline.id} stages={pipeline.stages} />
        </section>
      ) : null}
    </div>
  );
}
