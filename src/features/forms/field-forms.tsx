"use client";

import { useActionState, useState } from "react";
import { addFieldAction, updateFieldAction } from "@/features/forms/actions";
import { initialFormState } from "@/features/forms/action-state";

const inputClass = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

const FIELD_TYPES = [
  ["TEXT", "Single line"],
  ["EMAIL", "Email"],
  ["PHONE", "Phone"],
  ["DROPDOWN", "Dropdown"],
  ["CHECKBOX", "Checkbox"],
  ["TEXTAREA", "Multi-line"],
  ["DATE", "Date"],
  ["CONSENT", "Consent checkbox"],
] as const;

function FieldInputs({
  defaultValues,
}: {
  defaultValues?: {
    label: string;
    name: string;
    type: string;
    required: boolean;
    placeholder: string | null;
    helpText: string | null;
    options: string[];
  };
}) {
  const [type, setType] = useState(defaultValues?.type ?? "TEXT");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Label</span>
        <input name="label" required defaultValue={defaultValues?.label} className={inputClass} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Field key (lowercase, underscores)</span>
        <input
          name="name"
          required
          defaultValue={defaultValues?.name}
          pattern="[a-z][a-z0-9_]{0,39}"
          placeholder="e.g. service_interest"
          className={inputClass}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Type</span>
        <select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className={inputClass}
        >
          {FIELD_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Placeholder</span>
        <input name="placeholder" defaultValue={defaultValues?.placeholder ?? ""} className={inputClass} />
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span className="font-medium text-slate-700">Help text</span>
        <input name="helpText" defaultValue={defaultValues?.helpText ?? ""} className={inputClass} />
      </label>
      {type === "DROPDOWN" ? (
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">Dropdown options (one per line)</span>
          <textarea
            name="options"
            rows={3}
            defaultValue={defaultValues?.options.join("\n")}
            className={inputClass}
          />
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" defaultChecked={defaultValues?.required ?? false} className="rounded border-slate-300" />
        <span className="font-medium text-slate-700">Required</span>
      </label>
    </div>
  );
}

export function FieldAddForm({ subAccountId, formId }: { subAccountId: string; formId: string }) {
  const [state, formAction, pending] = useActionState(addFieldAction, initialFormState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="subAccountId" value={subAccountId} />
      <input type="hidden" name="formId" value={formId} />
      <h3 className="font-semibold text-slate-950">Add field</h3>
      <FieldInputs />
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add field"}
      </button>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function FieldEditForm({
  subAccountId,
  formId,
  field,
}: {
  subAccountId: string;
  formId: string;
  field: {
    id: string;
    label: string;
    name: string;
    type: string;
    required: boolean;
    placeholder: string | null;
    helpText: string | null;
    options: string[];
  };
}) {
  const [state, formAction, pending] = useActionState(updateFieldAction, initialFormState);

  return (
    <details className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-indigo-600">Edit field</summary>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="subAccountId" value={subAccountId} />
        <input type="hidden" name="formId" value={formId} />
        <input type="hidden" name="fieldId" value={field.id} />
        <FieldInputs
          defaultValues={{
            label: field.label,
            name: field.name,
            type: field.type,
            required: field.required,
            placeholder: field.placeholder,
            helpText: field.helpText,
            options: field.options,
          }}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save field"}
        </button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </form>
    </details>
  );
}
