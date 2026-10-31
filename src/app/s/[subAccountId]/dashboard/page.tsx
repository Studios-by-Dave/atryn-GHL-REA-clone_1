import { ArrowUpRight, ContactRound, UsersRound, Workflow } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { prisma } from "@/server/db/client";

export const instant = false;

type DashboardPageProps = {
  params: Promise<{ subAccountId: string }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { subAccountId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) {
    notFound();
  }
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "contacts.read");
  requirePermission(context, "opportunities.read");

  const opportunityWhere = {
    subAccountId,
    status: "OPEN" as const,
    ...(context.role === "CLIENT_USER" ? { assignedUserId: context.userId } : {}),
  };
  const [contactCount, opportunityCount] = await Promise.all([
    prisma.contact.count({ where: { subAccountId, status: "ACTIVE" } }),
    prisma.opportunity.count({ where: opportunityWhere }),
  ]);

  const cards = [
    {
      label: "Active contacts",
      value: contactCount,
      caption: contactCount === 0 ? "Your contact list is ready to build." : "Across this workspace",
      icon: ContactRound,
      tint: "bg-sky-50 text-sky-700",
    },
    {
      label: "Open opportunities",
      value: opportunityCount,
      caption:
        context.role === "CLIENT_USER"
          ? "Assigned to you"
          : "Currently in progress",
      icon: Workflow,
      tint: "bg-violet-50 text-violet-700",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Workspace overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Good to see you
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Here’s a snapshot of what’s happening in this workspace.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Workspace active
        </span>
      </section>

      <section aria-label="Workspace metrics" className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ label, value, caption, icon: Icon, tint }) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">{label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
              </div>
              <span className={`grid size-10 place-items-center rounded-xl ${tint}`}>
                <Icon size={19} aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 text-xs text-slate-500">{caption}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Get started</h2>
              <p className="mt-1 text-sm text-slate-500">Your workspace foundation is ready.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Next steps
            </span>
          </div>
          <div className="mt-6 divide-y divide-slate-100">
            {[
              ["Invite your team", "Bring your teammates into this workspace."],
              ["Add your contacts", "Keep your customer details in one place."],
              ["Set up your pipeline", "Track opportunities from first touch to close."],
            ].map(([title, description], index) => (
              <div key={title} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-800">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                </div>
                <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-slate-300" />
              </div>
            ))}
          </div>
        </article>

        <article className="flex min-h-60 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-950">Recent activity</h2>
          <p className="mt-1 text-sm text-slate-500">Updates from this workspace will appear here.</p>
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-slate-50 text-slate-400">
              <UsersRound size={21} aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-700">Nothing new just yet</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              New contacts and opportunity updates will show up here.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
