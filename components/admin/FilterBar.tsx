"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, Download } from "lucide-react";
import type { DateRangeFilter } from "@/types/inquiry";

const RANGE_OPTIONS: { value: DateRangeFilter; label: string }[] = [
  { value: null, label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "custom", label: "Custom Range" },
];

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const range = (searchParams.get("range") as DateRangeFilter) ?? null;
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParams({ q: search || null });
  }

  function handleRangeChange(value: string) {
    if (value === "") {
      updateParams({ range: null, from: null, to: null });
    } else if (value === "custom") {
      updateParams({ range: "custom" });
    } else {
      updateParams({ range: value, from: null, to: null });
    }
  }

  const exportHref = `/api/admin/inquiries/export?${searchParams.toString()}`;

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div className="flex flex-col sm:flex-row gap-3 flex-1">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, organization, message, notes..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </form>

        <select
          value={range ?? ""}
          onChange={(e) => handleRangeChange(e.target.value)}
          className="px-3 py-2 rounded-md border border-white/10 bg-white/[0.03] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
        >
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value ?? ""} className="bg-[#0B0E14]">
              {opt.label}
            </option>
          ))}
        </select>

        {range === "custom" && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={from.slice(0, 10)}
              onChange={(e) =>
                updateParams({ from: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
              className="px-3 py-2 rounded-md border border-white/10 bg-white/[0.03] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <span className="text-slate-600 text-sm">to</span>
            <input
              type="date"
              value={to.slice(0, 10)}
              onChange={(e) =>
                updateParams({ to: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
              className="px-3 py-2 rounded-md border border-white/10 bg-white/[0.03] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        )}
      </div>

      <a
        href={exportHref}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-white/10 bg-white/[0.03] text-sm text-slate-200 hover:bg-white/[0.06] transition-colors shrink-0"
      >
        <Download size={14} />
        Export CSV
      </a>
    </div>
  );
}
