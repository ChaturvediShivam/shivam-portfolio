"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUrlParams } from "./useUrlParams";

export type FilterConfig =
  | {
      type: "select";
      name: string;
      label: string;
      options: { value: string; label: string }[];
      allLabel?: string;
    }
  | {
      type: "toggle";
      name: string;
      label: string;
      /** Param value set when the toggle is on. */
      onValue?: string;
    };

export interface FilterBarProps {
  filters: FilterConfig[];
  /** Extra custom controls rendered inline (e.g. a SearchInput). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * URL-driven filter row. Each control writes its param and resets pagination;
 * "Clear" removes all managed filter params. Server components re-render from
 * the updated query.
 */
export function FilterBar({ filters, children, className }: FilterBarProps) {
  const { searchParams, setParams } = useUrlParams();

  const activeCount = filters.reduce((n, f) => (searchParams.get(f.name) ? n + 1 : n), 0);

  function clearAll() {
    const updates: Record<string, null> = {};
    for (const f of filters) updates[f.name] = null;
    setParams(updates, { resetPage: true });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}

      {filters.map((f) => {
        const current = searchParams.get(f.name) ?? "";
        if (f.type === "select") {
          return (
            <select
              key={f.name}
              aria-label={f.label}
              value={current}
              onChange={(e) => setParams({ [f.name]: e.target.value || null }, { resetPage: true })}
              className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 [&>option]:bg-[#0B0E14]"
            >
              <option value="">{f.allLabel ?? `All ${f.label.toLowerCase()}`}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        }
        // toggle
        const on = current === (f.onValue ?? "1");
        return (
          <button
            key={f.name}
            type="button"
            aria-pressed={on}
            onClick={() => setParams({ [f.name]: on ? null : f.onValue ?? "1" }, { resetPage: true })}
            className={cn(
              "rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
              on
                ? "border-white/20 bg-white/[0.06] text-slate-200"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200",
            )}
          >
            {f.label}
          </button>
        );
      })}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          <X className="size-3.5" aria-hidden />
          Clear ({activeCount})
        </button>
      )}
    </div>
  );
}
