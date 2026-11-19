"use client";

import { useActionState } from "react";
import { sendMessageAction } from "@/features/messaging/actions";
import { initialMessagingState } from "@/features/messaging/action-state";

const inputClass = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

export function MessageCompose({
  subAccountId,
  contactId,
  conversationId,
}: {
  subAccountId: string;
  contactId: string;
  conversationId: string;
}) {
  const [state, formAction, pending] = useActionState(sendMessageAction, initialMessagingState);

  return (
    <form
      key={state.sentAt ?? "compose"}
      action={formAction}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="subAccountId" value={subAccountId} />
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex flex-wrap gap-2">
        <select name="channel" defaultValue="EMAIL" className={`${inputClass} w-28`}>
          <option value="EMAIL">Email</option>
          <option value="SMS">SMS</option>
        </select>
        <input
          name="subject"
          placeholder="Subject (email only)"
          className={`${inputClass} min-w-0 flex-1`}
        />
      </div>
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Write a message…"
        className={`${inputClass} w-full`}
      />
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.sentAt ? <p className="text-sm text-emerald-700">Message sent.</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
