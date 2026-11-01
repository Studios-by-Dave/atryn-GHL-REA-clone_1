"use client";

import { useActionState } from "react";
import { importContactsAction, initialContactState } from "@/features/contacts/actions";

export function ImportContactsForm({ subAccountId }: { subAccountId: string }) {
  const [state, formAction, pending] = useActionState(importContactsAction, initialContactState);
  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <input type="hidden" name="subAccountId" value={subAccountId} />
      <textarea
        name="csv"
        rows={12}
        required
        className="w-full rounded-xl border border-slate-200 p-3 font-mono text-sm"
        placeholder="firstName,lastName,email,phone,company,source"
      />
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Importing..." : "Import"}
      </button>
    </form>
  );
}