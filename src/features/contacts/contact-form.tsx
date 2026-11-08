"use client";

import { useActionState } from "react";
import {
  createContactAction,
  updateContactAction,
} from "@/features/contacts/actions";
import { initialContactState } from "@/features/contacts/action-state";

type Owner = { id: string; name: string | null; email: string };

type Props = {
  subAccountId: string;
  contactId?: string;
  owners?: Owner[];
  defaults?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    company?: string;
    source?: string;
    ownerUserId?: string;
  };
};

export function ContactForm({ subAccountId, contactId, owners = [], defaults = {} }: Props) {
  const action = contactId ? updateContactAction : createContactAction;
  const [state, formAction, pending] = useActionState(action, initialContactState);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <input type="hidden" name="subAccountId" value={subAccountId} />
      {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <input name="firstName" defaultValue={defaults.firstName} placeholder="First name" required className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input name="lastName" defaultValue={defaults.lastName} placeholder="Last name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input name="email" type="email" defaultValue={defaults.email} placeholder="Email" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input name="phone" defaultValue={defaults.phone} placeholder="Phone" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input name="company" defaultValue={defaults.company} placeholder="Company" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input name="source" defaultValue={defaults.source} placeholder="Source" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <select
          name="ownerUserId"
          defaultValue={defaults.ownerUserId ?? ""}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Unassigned</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name ?? owner.email}
            </option>
          ))}
        </select>
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Saving..." : contactId ? "Update contact" : "Create contact"}
      </button>
    </form>
  );
}