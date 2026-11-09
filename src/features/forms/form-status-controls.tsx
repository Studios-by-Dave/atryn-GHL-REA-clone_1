"use client";

import { useActionState } from "react";
import { deleteFormAction, setFormStatusAction } from "@/features/forms/actions";
import { initialFormState } from "@/features/forms/action-state";

export function FormStatusControls({
  subAccountId,
  formId,
  status,
  publicId,
  canDelete,
}: {
  subAccountId: string;
  formId: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  publicId: string;
  canDelete: boolean;
}) {
  const [state, formAction, pending] = useActionState(setFormStatusAction, initialFormState);
  const target = status === "ACTIVE" ? "PAUSED" : "ACTIVE";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${origin}/f/${publicId}`;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        {status === "ACTIVE" ? "Published" : status === "PAUSED" ? "Paused" : "Draft"}
      </span>
      {status === "ACTIVE" ? (
        <input
          readOnly
          value={publicUrl}
          aria-label="Public form link"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        />
      ) : (
        <span className="flex-1 text-sm text-slate-500">
          {status === "PAUSED"
            ? "Paused — the public link is inactive until you publish again."
            : "Draft — publish to get a shareable public link."}
        </span>
      )}
      <form action={formAction}>
        <input type="hidden" name="subAccountId" value={subAccountId} />
        <input type="hidden" name="formId" value={formId} />
        <input type="hidden" name="status" value={target} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : status === "ACTIVE" ? "Pause form" : "Publish"}
        </button>
      </form>
      {canDelete ? (
        <form action={deleteFormAction}>
          <input type="hidden" name="subAccountId" value={subAccountId} />
          <input type="hidden" name="formId" value={formId} />
          <button
            type="submit"
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </form>
      ) : null}
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
    </div>
  );
}
