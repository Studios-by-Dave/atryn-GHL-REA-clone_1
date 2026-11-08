"use client";

import { useActionState } from "react";
import { createStageAction, deleteStageAction, updateStageAction } from "@/features/pipelines/actions";
import { initialContactState } from "@/features/contacts/action-state";

type Stage = {
  id: string;
  name: string;
  probability: number;
  isWon: boolean;
  isLost: boolean;
};

const inputClass = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

export function StageCreateForm({ subAccountId, pipelineId }: { subAccountId: string; pipelineId: string }) {
  const [state, formAction, pending] = useActionState(createStageAction, initialContactState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="subAccountId" value={subAccountId} />
      <input type="hidden" name="pipelineId" value={pipelineId} />
      <input name="name" required placeholder="Add stage…" className={inputClass} />
      <input name="probability" type="number" min={0} max={100} defaultValue={0} aria-label="Probability" className={inputClass} />
      <label className="flex items-center gap-1 text-sm text-slate-600">
        <input type="checkbox" name="isWon" /> Won
      </label>
      <label className="flex items-center gap-1 text-sm text-slate-600">
        <input type="checkbox" name="isLost" /> Lost
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add stage"}
      </button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

function StageRow({
  subAccountId,
  pipelineId,
  stage,
}: {
  subAccountId: string;
  pipelineId: string;
  stage: Stage;
}) {
  const [state, formAction, pending] = useActionState(updateStageAction, initialContactState);

  return (
    <li className="flex flex-wrap items-center gap-2 px-1 py-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="subAccountId" value={subAccountId} />
        <input type="hidden" name="pipelineId" value={pipelineId} />
        <input type="hidden" name="stageId" value={stage.id} />
        <input name="name" defaultValue={stage.name} required aria-label="Stage name" className={inputClass} />
        <input
          name="probability"
          type="number"
          min={0}
          max={100}
          defaultValue={stage.probability}
          aria-label="Probability"
          className={inputClass}
        />
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" name="isWon" defaultChecked={stage.isWon} /> Won
        </label>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" name="isLost" defaultChecked={stage.isLost} /> Lost
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      <form action={deleteStageAction}>
        <input type="hidden" name="subAccountId" value={subAccountId} />
        <input type="hidden" name="pipelineId" value={pipelineId} />
        <input type="hidden" name="stageId" value={stage.id} />
        <button
          type="submit"
          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </form>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
    </li>
  );
}

export function StageEditor({
  subAccountId,
  pipelineId,
  stages,
}: {
  subAccountId: string;
  pipelineId: string;
  stages: Stage[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-950">Stages</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {stages.map((stage) => (
          <StageRow key={stage.id} subAccountId={subAccountId} pipelineId={pipelineId} stage={stage} />
        ))}
      </ul>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <StageCreateForm subAccountId={subAccountId} pipelineId={pipelineId} />
      </div>
    </section>
  );
}
