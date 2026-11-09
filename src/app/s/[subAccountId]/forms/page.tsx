import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { requireTenantContext } from "@/server/tenant/context";
import { getFormsList } from "@/features/forms/queries";
import { deleteFormAction } from "@/features/forms/actions";
import { FormCreateForm } from "@/features/forms/form-create-form";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string }>;
};

const statusChip: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAUSED: "bg-amber-50 text-amber-700",
};

export default async function FormsPage({ params }: PageProps) {
  const { subAccountId } = await params;
  if (!z.uuid().safeParse(subAccountId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "forms.read");

  const forms = await getFormsList(subAccountId);
  const canWrite = hasPermission(context.role, "forms.write");
  const canDelete = hasPermission(context.role, "forms.delete");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Forms</h1>
        <p className="mt-1 text-sm text-slate-500">
          {forms.length} form{forms.length === 1 ? "" : "s"} · public capture pages pouring leads into contacts
        </p>
      </header>

      {canWrite ? <FormCreateForm subAccountId={subAccountId} /> : null}

      {forms.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No forms yet.{canWrite ? " Create the first one above." : ""}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {forms.map((form) => (
            <li key={form.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link
                href={`/s/${subAccountId}/forms/${form.id}`}
                className="font-medium text-indigo-600 hover:text-indigo-700"
              >
                {form.name}
              </Link>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusChip[form.status]}`}>
                {form.status}
              </span>
              <span className="text-sm text-slate-500">
                {form._count.fields} fields · {form._count.submissions} submissions
              </span>
              {form.status === "ACTIVE" ? (
                <code className="rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-500">/f/{form.publicId}</code>
              ) : null}
              <span className="flex-1" />
              {canDelete ? (
                <form action={deleteFormAction}>
                  <input type="hidden" name="subAccountId" value={subAccountId} />
                  <input type="hidden" name="formId" value={form.id} />
                  <button
                    type="submit"
                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
