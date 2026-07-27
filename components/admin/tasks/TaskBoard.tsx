"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import {
  TASK_STATUSES,
  isOverdue,
  priorityBadgeVariant,
  priorityLabel,
  statusLabel,
  type Task,
  type TaskStatus,
} from "@/types/task";
import { changeStatusAction } from "@/app/admin/(dashboard)/tasks/actions";

type Columns = Record<TaskStatus, Task[]>;

function group(items: Task[]): Columns {
  const cols = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Columns;
  for (const t of items) (cols[t.status] ?? cols.todo).push(t);
  return cols;
}

function linkedLabel(t: Task): string | null {
  return t.opportunity?.title ?? t.contact?.full_name ?? t.company?.name ?? null;
}
function formatDate(v: string) {
  return new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const { toast } = useToast();
  const [columns, setColumns] = React.useState<Columns>(() => group(tasks));
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overStatus, setOverStatus] = React.useState<TaskStatus | null>(null);

  React.useEffect(() => setColumns(group(tasks)), [tasks]);

  function move(cardId: string, toStatus: TaskStatus) {
    const prev = columns;
    let card: Task | undefined;
    let fromStatus: TaskStatus | undefined;
    for (const s of TASK_STATUSES) {
      const found = prev[s].find((t) => t.id === cardId);
      if (found) {
        card = found;
        fromStatus = s;
        break;
      }
    }
    if (!card || !fromStatus || fromStatus === toStatus) return;

    const next: Columns = { ...prev };
    next[fromStatus] = prev[fromStatus].filter((t) => t.id !== cardId);
    next[toStatus] = [{ ...card, status: toStatus }, ...prev[toStatus]];
    setColumns(next);

    void (async () => {
      const result = await changeStatusAction(cardId, toStatus);
      if (isActionError(result)) {
        setColumns(prev);
        toast({ variant: "error", title: "Couldn't move", description: result.formError });
      } else {
        toast({ variant: "success", title: `Status: ${statusLabel(toStatus)}` });
      }
    })();
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3">
        {TASK_STATUSES.map((status) => {
          const items = columns[status];
          const isOver = overStatus === status;
          return (
            <section
              key={status}
              aria-label={`${statusLabel(status)} (${items.length})`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStatus(status);
              }}
              onDragLeave={() => setOverStatus((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStatus(null);
                if (dragId) move(dragId, status);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-lg border ${
                isOver ? "border-white/25 bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{statusLabel(status)}</span>
                <span className="text-xs text-slate-600">{items.length}</span>
              </div>

              <ul className="flex min-h-[6rem] flex-1 flex-col gap-2 p-2">
                {items.length === 0 && <li className="px-2 py-6 text-center text-xs text-slate-600">Drop here</li>}
                {items.map((t) => {
                  const linked = linkedLabel(t);
                  const overdue = isOverdue(t);
                  return (
                    <li
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      className="group rounded-md border border-white/[0.06] bg-[#0B0E14] p-3 shadow-sm transition-colors hover:border-white/15"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/admin/tasks/${t.id}`}
                          className="block text-sm font-medium text-slate-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded"
                        >
                          {t.title}
                        </Link>
                        <Badge variant={priorityBadgeVariant(t.priority)}>{priorityLabel(t.priority)}</Badge>
                      </div>
                      {linked && <p className="mt-0.5 truncate text-xs text-slate-500">{linked}</p>}
                      {t.due_at && (
                        <p className={`mt-1 text-xs ${overdue ? "text-red-400" : "text-slate-500"}`}>
                          {overdue ? "Overdue · " : "Due "}
                          {formatDate(t.due_at)}
                        </p>
                      )}
                      <label className="sr-only" htmlFor={`status-${t.id}`}>
                        Status for {t.title}
                      </label>
                      <select
                        id={`status-${t.id}`}
                        value={t.status}
                        onChange={(e) => move(t.id, e.target.value as TaskStatus)}
                        className="mt-2 w-full rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 [&>option]:bg-[#0B0E14]"
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
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
