"use client";

import { useActionState } from "react";
import {
  createOpportunityAction,
  updateOpportunityAction,
} from "@/features/pipelines/actions";
import { initialContactState } from "@/features/contacts/action-state";

type Option = { id: string; name: string };

type Props = {
  subAccountId: string;
  pipelineId: string;
  stages: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  opportunity?: {
    id: string;
    stageId: string;
    name: string;
    value: string;
    currency: string;
    assignedUserId: string | null;
    source: string | null;
    notes: string | null;
    expectedCloseDate: string | null;
  };
};

const inputClass = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function OpportunityForm({
  subAccountId,
  pipelineId,
  stages,
  contacts,
  owners,
  opportunity,
}: Props) {
  const action = opportunity ? updateOpportunityAction : createOpportunityAction;
  const [state, formAction, pending] = useActionState(action, initialContactState);

  return (
    <form action={formAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <input type="hidden" name="subAccountId" value={subAccountId} />
      <input type="hidden" name="pipelineId" value={pipelineId} />
      {opportunity ? <input type="hidden" name="opportunityId" value={opportunity.id} /> : null}
      {opportunity ? <input type="hidden" name="stageId" value={opportunity.stageId} /> : null}
      <input name="name" required placeholder="Opportunity name" defaultValue={opportunity?.name} className={inputClass} />
      <select name="stageId" required defaultValue={opportunity?.stageId ?? ""} className={inputClass} hidden={Boolean(opportunity)}>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
      <select name="contactId" required defaultValue="" className={inputClass} hidden={Boolean(opportunity)}>
        <option value="" disabled>
          Choose a contact…
        </option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.name}
          </option>
        ))}
      </select>
      <input
        name="value"
        type="number"
        min="0"
        step="0.01"
        required
        placeholder="Value"
        defaultValue={opportunity?.value}
        className={inputClass}
      />
      <input name="currency" defaultValue={opportunity?.currency ?? "USD"} maxLength={3} placeholder="Currency" className={inputClass} />
      <select name="assignedUserId" defaultValue={opportunity?.assignedUserId ?? ""} className={inputClass}>
        <option value="">Unassigned</option>
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.name}
          </option>
        ))}
      </select>
      <input
        name="expectedCloseDate"
        type="date"
        defaultValue={toDateInputValue(opportunity?.expectedCloseDate ?? null)}
        className={inputClass}
      />
      <input name="source" defaultValue={opportunity?.source ?? ""} placeholder="Source" className={inputClass} />
      <input name="notes" defaultValue={opportunity?.notes ?? ""} placeholder="Notes" className={inputClass} />
      <div className="sm:col-span-2">
        {state.error ? <p className="mb-2 text-sm text-red-600">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : opportunity ? "Update opportunity" : "Create opportunity"}
        </button>
      </div>
    </form>
  );
}

export type { Option };
