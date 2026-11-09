"use client";

import { useActionState } from "react";
import { createFormAction } from "@/features/forms/actions";
import { initialFormState } from "@/features/forms/action-state";

export function FormCreateForm({ subAccountId }: { subAccountId: string }) {
  const [state, formAction, pending] = useActionState(createFormAction, initialFormState);

  return (
    <form action={formAction} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="subAccountId" value={subAccountId} />
      <input
        name="name"
        required
        placeholder="New form name…"
        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create form"}
      </button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
