"use client";

import { useActionState } from "react";
import { updateFormSettingsAction } from "@/features/forms/actions";
import { initialFormState } from "@/features/forms/action-state";

const inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

export function FormSettingsForm({
  subAccountId,
  formId,
  form,
  members,
}: {
  subAccountId: string;
  formId: string;
  form: {
    name: string;
    submitLabel: string;
    successMessage: string;
    redirectUrl: string | null;
    consentText: string | null;
    autoTags: string[];
    notifyUserIds: string[];
  };
  members: { id: string; name: string; email: string }[];
}) {
  const [state, formAction, pending] = useActionState(updateFormSettingsAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="subAccountId" value={subAccountId} />
      <input type="hidden" name="formId" value={formId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Form name</span>
          <input name="name" defaultValue={form.name} required className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Submit button label</span>
          <input name="submitLabel" defaultValue={form.submitLabel} className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700">Success message</span>
        <input name="successMessage" defaultValue={form.successMessage} className={inputClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Redirect URL after submit (https)</span>
          <input
            name="redirectUrl"
            type="url"
            defaultValue={form.redirectUrl ?? ""}
            placeholder="https://…"
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Auto tags (comma-separated)</span>
          <input name="autoTags" defaultValue={form.autoTags.join(", ")} className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700">Consent text (renders a CONSENT field if added)</span>
        <input name="consentText" defaultValue={form.consentText ?? ""} className={inputClass} />
      </label>
      {members.length > 0 ? (
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium text-slate-700">Notify these members on submit</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {members.map((member) => (
              <label key={member.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="notifyUserIds"
                  value={member.id}
                  defaultChecked={form.notifyUserIds.includes(member.id)}
                  className="rounded border-slate-300"
                />
                <span>{member.name ?? member.email}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
