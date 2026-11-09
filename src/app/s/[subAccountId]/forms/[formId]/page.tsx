import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { requireTenantContext } from "@/server/tenant/context";
import { getFormBuilder, getFormNotifyCandidates } from "@/features/forms/queries";
import { deleteFieldAction, moveFieldAction } from "@/features/forms/actions";
import { FormStatusControls } from "@/features/forms/form-status-controls";
import { FormSettingsForm } from "@/features/forms/form-settings-form";
import { FieldAddForm, FieldEditForm } from "@/features/forms/field-forms";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string; formId: string }>;
};

const typeLabels: Record<string, string> = {
  TEXT: "Single line",
  EMAIL: "Email",
  PHONE: "Phone",
  DROPDOWN: "Dropdown",
  CHECKBOX: "Checkbox",
  TEXTAREA: "Multi-line",
  DATE: "Date",
  CONSENT: "Consent",
};

export default async function FormBuilderPage({ params }: PageProps) {
  const { subAccountId, formId } = await params;
  if (!z.uuid().safeParse(subAccountId).success) notFound();
  if (!z.uuid().safeParse(formId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "forms.read");

  const form = await getFormBuilder(subAccountId, formId);
  if (!form) notFound();

  const canWrite = hasPermission(context.role, "forms.write");
  const canDelete = hasPermission(context.role, "forms.delete");
  const members = canWrite ? await getFormNotifyCandidates(subAccountId) : [];
  const editable = canWrite && form.status === "DRAFT";

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/s/${subAccountId}/forms`} className="text-sm text-slate-500 hover:text-slate-800">
          ← All forms
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{form.name}</h1>
          <span className="text-sm text-slate-500">{form.fields.length} fields · builder</span>
        </div>
      </header>

      {canWrite ? (
        <FormStatusControls
          subAccountId={subAccountId}
          formId={form.id}
          status={form.status}
          publicId={form.publicId}
          canDelete={canDelete}
        />
      ) : null}

      <section className={form.status === "DRAFT" ? "space-y-6" : "space-y-6 opacity-60"}>
        <div className="rounded-2xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {form.fields.length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-slate-500">
                No fields yet — add the first field below.
              </li>
            ) : (
              form.fields.map((field, index) => (
                <li key={field.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                    <span className="font-medium text-slate-900">{field.label}</span>
                    <code className="rounded bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500">{field.name}</code>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {typeLabels[field.type] ?? field.type}
                    </span>
                    {field.required ? (
                      <span className="text-xs font-semibold text-red-500">required</span>
                    ) : null}
                    {field.type === "DROPDOWN" ? (
                      <span className="text-xs text-slate-500">{field.options.length} options</span>
                    ) : null}
                    <span className="flex-1" />
                    {editable ? (
                      <div className="flex gap-1">
                        <form action={moveFieldAction}>
                          <input type="hidden" name="subAccountId" value={subAccountId} />
                          <input type="hidden" name="formId" value={form.id} />
                          <input type="hidden" name="fieldId" value={field.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button
                            type="submit"
                            aria-label={`Move ${field.label} up`}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            ↑
                          </button>
                        </form>
                        <form action={moveFieldAction}>
                          <input type="hidden" name="subAccountId" value={subAccountId} />
                          <input type="hidden" name="formId" value={form.id} />
                          <input type="hidden" name="fieldId" value={field.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button
                            type="submit"
                            aria-label={`Move ${field.label} down`}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            ↓
                          </button>
                        </form>
                        <form action={deleteFieldAction}>
                          <input type="hidden" name="subAccountId" value={subAccountId} />
                          <input type="hidden" name="formId" value={form.id} />
                          <input type="hidden" name="fieldId" value={field.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                  {editable ? (
                    <div className="mt-2">
                      <FieldEditForm subAccountId={subAccountId} formId={form.id} field={field} />
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>

        {canWrite ? (
          <FieldAddForm subAccountId={subAccountId} formId={form.id} />
        ) : null}
      </section>

      {canWrite ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-950">Form settings</h2>
          <FormSettingsForm
            subAccountId={subAccountId}
            formId={form.id}
            form={{
              name: form.name,
              submitLabel: form.submitLabel,
              successMessage: form.successMessage,
              redirectUrl: form.redirectUrl,
              consentText: form.consentText,
              autoTags: form.autoTags,
              notifyUserIds: form.notifyUserIds,
            }}
            members={members.map((member) => ({
              id: member.id,
              name: member.name ?? member.email,
              email: member.email,
            }))}
          />
          <p className="text-sm text-slate-500">
            Settings stay editable while the form is published; the field list itself is frozen until paused.
          </p>
        </section>
      ) : null}
    </div>
  );
}
