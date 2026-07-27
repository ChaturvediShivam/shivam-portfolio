import * as React from "react";
import { cn } from "@/lib/utils";
import type { BadgeVariant } from "@/components/admin/ui";

export interface BarItem {
  label: string;
  value: number;
  /** Optional trailing note (e.g. "42%" or "→ 60%"). */
  hint?: string;
  variant?: BadgeVariant;
}

const barColor: Record<BadgeVariant, string> = {
  info: "bg-blue-500/60",
  progress: "bg-amber-500/60",
  special: "bg-purple-500/60",
  success: "bg-emerald-500/60",
  neutral: "bg-slate-500/50",
  danger: "bg-red-500/60",
};

/**
 * Lightweight CSS horizontal bar chart. No SVG/chart library. Each row is
 * labelled and announces its value for assistive tech.
 */
export function BarList({ items, max, className }: { items: BarItem[]; max?: number; className?: string }) {
  const peak = max ?? Math.max(1, ...items.map((i) => i.value));

  if (items.length === 0) {
    return <p className="text-xs text-slate-500">No data.</p>;
  }

  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item) => {
        const pct = Math.round((item.value / peak) * 100);
        return (
          <li key={item.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm" aria-label={`${item.label}: ${item.value}`}>
            <span className="truncate text-slate-400">{item.label}</span>
            <span className="h-2 rounded-full bg-white/[0.04]" role="presentation">
              <span
                className={cn("block h-2 rounded-full", barColor[item.variant ?? "neutral"])}
                style={{ width: `${item.value === 0 ? 0 : Math.max(pct, 3)}%` }}
              />
            </span>
            <span className="tabular-nums text-slate-300">
              {item.value}
              {item.hint && <span className="ml-2 text-xs text-slate-500">{item.hint}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
