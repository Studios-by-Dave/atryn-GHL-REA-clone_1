"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { moveOpportunityAction } from "@/features/pipelines/actions";

export type Stage = {
  id: string;
  name: string;
  probability: number;
  isWon: boolean;
  isLost: boolean;
};

export type Card = {
  id: string;
  stageId: string;
  name: string;
  value: string;
  currency: string;
  status: string;
  contactName: string;
  assigneeName: string | null;
};

type BoardProps = {
  subAccountId: string;
  stages: Stage[];
  cards: Card[];
  canWrite: boolean;
};

function OpportunityCard({ card }: { card: Card }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <p className="font-medium text-slate-900">{card.name}</p>
      <p className="mt-1 text-xs text-slate-500">
        {card.contactName} · {card.currency} {card.value}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        {card.assigneeName ?? "Unassigned"}
        {card.status !== "OPEN" ? ` · ${card.status}` : ""}
      </p>
    </div>
  );
}

function DraggableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? "opacity-40" : ""}`}
    >
      <OpportunityCard card={card} />
    </div>
  );
}

function StageColumn({
  stage,
  cards,
  isOver,
}: {
  stage: Stage;
  cards: Card[];
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-40 w-64 shrink-0 flex-col gap-2 rounded-2xl border p-3 ${
        isOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <header className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-slate-800">{stage.name}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
          {stage.isWon ? "won" : stage.isLost ? "lost" : `${stage.probability}%`}
        </span>
      </header>
      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} />
        ))}
        {cards.length === 0 ? <p className="px-1 py-4 text-xs text-slate-400">Nothing here.</p> : null}
      </div>
    </div>
  );
}

export function PipelineBoard({ subAccountId, stages, cards: initialCards, canWrite }: BoardProps) {
  const [cards, setCards] = useState(initialCards);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const byStage = useMemo(() => {
    const grouped = new Map<string, Card[]>();
    for (const stage of stages) {
      grouped.set(
        stage.id,
        cards.filter((card) => card.stageId === stage.id),
      );
    }
    return grouped;
  }, [cards, stages]);

  const [overStageId, setOverStageId] = useState<string | null>(null);

  async function handleDragEnd(event: DragEndEvent) {
    setOverStageId(null);
    const opportunityId = String(event.active.id);
    const toStageId = event.over ? String(event.over.id) : null;
    if (!toStageId || !canWrite) return;
    const card = cards.find((c) => c.id === opportunityId);
    const targetStage = stages.find((s) => s.id === toStageId);
    if (!card || !targetStage || card.stageId === toStageId) return;

    const previous = cards;
    setCards((current) =>
      current.map((c) =>
        c.id === opportunityId
          ? { ...c, stageId: toStageId, status: targetStage.isWon ? "WON" : targetStage.isLost ? "LOST" : c.status }
          : c,
      ),
    );
    const result = await moveOpportunityAction(subAccountId, opportunityId, toStageId);
    if (result.error) {
      setCards(previous);
      setError(result.error);
      return;
    }
    setError(null);
  }

  return (
    <div className="space-y-2">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <DndContext
        sensors={sensors}
        onDragOver={(event) => {
          setOverStageId(event.over ? String(event.over.id) : null);
        }}
        onDragCancel={() => setOverStageId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              cards={byStage.get(stage.id) ?? []}
              isOver={canWrite && overStageId === stage.id}
            />
          ))}
        </div>
      </DndContext>
      {!canWrite ? (
        <p className="text-xs text-slate-400">View only — you can see opportunities assigned to you.</p>
      ) : null}
    </div>
  );
}
