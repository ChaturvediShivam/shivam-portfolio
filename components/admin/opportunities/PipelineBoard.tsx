"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import {
  OPPORTUNITY_STAGES,
  stageLabel,
  type Opportunity,
  type OpportunityStage,
} from "@/types/opportunity";
import { changeStageAction } from "@/app/admin/(dashboard)/opportunities/actions";

type Columns = Record<OpportunityStage, Opportunity[]>;

function group(items: Opportunity[]): Columns {
  const cols = Object.fromEntries(OPPORTUNITY_STAGES.map((s) => [s, [] as Opportunity[]])) as Columns;
  for (const o of items) (cols[o.stage] ?? cols.lead).push(o);
  return cols;
}

function formatSalary(o: Opportunity): string | null {
  const cur = o.salary_currency ?? "USD";
  const fmt = (n: number) => n.toLocaleString();
  if (o.salary_min != null && o.salary_max != null) return `${cur} ${fmt(o.salary_min)}–${fmt(o.salary_max)}`;
  if (o.salary_min != null) return `${cur} ${fmt(o.salary_min)}+`;
  if (o.salary_max != null) return `${cur} up to ${fmt(o.salary_max)}`;
  return null;
}

function formatDate(v: string) {
  return new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PipelineBoard({ opportunities }: { opportunities: Opportunity[] }) {
  const { toast } = useToast();
  const [columns, setColumns] = React.useState<Columns>(() => group(opportunities));
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<OpportunityStage | null>(null);

  React.useEffect(() => setColumns(group(opportunities)), [opportunities]);

  function move(cardId: string, toStage: OpportunityStage) {
    const prev = columns;
    let card: Opportunity | undefined;
    let fromStage: OpportunityStage | undefined;
    for (const s of OPPORTUNITY_STAGES) {
      const found = prev[s].find((o) => o.id === cardId);
      if (found) {
        card = found;
        fromStage = s;
        break;
      }
    }
    if (!card || !fromStage || fromStage === toStage) return;

    const next: Columns = { ...prev };
    next[fromStage] = prev[fromStage].filter((o) => o.id !== cardId);
    next[toStage] = [{ ...card, stage: toStage }, ...prev[toStage]];
    setColumns(next); // optimistic

    void (async () => {
      const result = await changeStageAction(cardId, toStage);
      if (isActionError(result)) {
        setColumns(prev); // rollback
        toast({ variant: "error", title: "Couldn't move", description: result.formError });
      } else {
        toast({ variant: "success", title: `Moved to ${stageLabel(toStage)}` });
      }
    })();
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3">
        {OPPORTUNITY_STAGES.map((stage) => {
          const items = columns[stage];
          const isOver = overStage === stage;
          return (
            <section
              key={stage}
              aria-label={`${stageLabel(stage)} (${items.length})`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                if (dragId) move(dragId, stage);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-lg border ${
                isOver ? "border-white/25 bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{stageLabel(stage)}</span>
                <span className="text-xs text-slate-600">{items.length}</span>
              </div>

              <ul className="flex min-h-[6rem] flex-1 flex-col gap-2 p-2">
                {items.length === 0 && (
                  <li className="px-2 py-6 text-center text-xs text-slate-600">Drop here</li>
                )}
                {items.map((o) => {
                  const salary = formatSalary(o);
                  return (
                    <li
                      key={o.id}
                      draggable
                      onDragStart={() => setDragId(o.id)}
                      onDragEnd={() => setDragId(null)}
                      className="group rounded-md border border-white/[0.06] bg-[#0B0E14] p-3 shadow-sm transition-colors hover:border-white/15"
                    >
                      <Link
                        href={`/admin/opportunities/${o.id}`}
                        className="block text-sm font-medium text-slate-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded"
                      >
                        {o.title}
                      </Link>
                      {o.company?.name && <p className="mt-0.5 text-xs text-slate-500">{o.company.name}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {salary && <span>{salary}</span>}
                        {o.next_action_at && <span>Next: {formatDate(o.next_action_at)}</span>}
                      </div>
                      <label className="sr-only" htmlFor={`stage-${o.id}`}>
                        Stage for {o.title}
                      </label>
                      <select
                        id={`stage-${o.id}`}
                        value={o.stage}
                        onChange={(e) => move(o.id, e.target.value as OpportunityStage)}
                        className="mt-2 w-full rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 [&>option]:bg-[#0B0E14]"
                      >
                        {OPPORTUNITY_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {stageLabel(s)}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
