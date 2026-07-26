"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUrlParams } from "./useUrlParams";

export interface SearchInputProps {
  /** URL param to bind to. */
  param?: string;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

/**
 * Debounced free-text search bound to a URL param (drives server-side FTS).
 */
export function SearchInput({
  param = "q",
  placeholder = "Search…",
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const { searchParams, setParams } = useUrlParams();
  const [value, setValue] = React.useState(searchParams.get(param) ?? "");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync when the URL changes externally (e.g. Clear filters).
  React.useEffect(() => {
    setValue(searchParams.get(param) ?? "");
  }, [searchParams, param]);

  function push(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParams({ [param]: next || null }, { resetPage: true }), debounceMs);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    push(e.target.value);
  }

  function clear() {
    setValue("");
    if (timer.current) clearTimeout(timer.current);
    setParams({ [param]: null }, { resetPage: true });
  }

  return (
    <div role="search" className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-white/10 bg-white/[0.03] py-2 pl-9 pr-9 text-sm text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus:border-white/20"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
