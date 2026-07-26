"use client";

import * as React from "react";
import { Loader2, X, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EntityOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface EntityPickerProps {
  /** Async loader; called (debounced) with the current query. */
  loadOptions: (query: string) => Promise<EntityOption[]>;
  value: EntityOption | EntityOption[] | null;
  onChange: (value: EntityOption | EntityOption[] | null) => void;
  multiple?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  debounceMs?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Generic async search-and-select for related records (companies, contacts,
 * opportunities…). Entity-agnostic: callers supply `loadOptions`. Implements the
 * WAI-ARIA combobox pattern (single) / with removable chips (multiple).
 */
export function EntityPicker({
  loadOptions,
  value,
  onChange,
  multiple = false,
  placeholder = "Search…",
  emptyMessage = "No matches",
  debounceMs = 250,
  disabled,
  className,
}: EntityPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<EntityOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = React.useRef(0);
  const listId = React.useId();

  const selected = React.useMemo<EntityOption[]>(
    () => (value == null ? [] : Array.isArray(value) ? value : [value]),
    [value],
  );
  const selectedValues = React.useMemo(() => new Set(selected.map((o) => o.value)), [selected]);

  // Load options when opened / query changes (debounced, race-safe).
  React.useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      const id = ++reqId.current;
      try {
        const opts = await loadOptions(query);
        if (id === reqId.current) {
          setOptions(opts);
          setActive(0);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, query, loadOptions, debounceMs]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function select(opt: EntityOption) {
    if (multiple) {
      const exists = selectedValues.has(opt.value);
      const next = exists ? selected.filter((o) => o.value !== opt.value) : [...selected, opt];
      onChange(next);
      setQuery("");
    } else {
      onChange(opt);
      setOpen(false);
      setQuery("");
    }
  }

  function remove(val: string) {
    if (multiple) onChange(selected.filter((o) => o.value !== val));
    else onChange(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && options[active]) select(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && multiple && selected.length > 0) {
      remove(selected[selected.length - 1].value);
    }
  }

  const showSingleValue = !multiple && selected[0] && !open;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex min-h-[2.5rem] flex-wrap items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5",
          "focus-within:ring-2 focus-within:ring-white/20 focus-within:border-white/20",
          disabled && "opacity-50",
        )}
      >
        {multiple &&
          selected.map((o) => (
            <span
              key={o.value}
              className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-2 py-0.5 text-xs text-slate-200"
            >
              {o.label}
              <button
                type="button"
                onClick={() => remove(o.value)}
                aria-label={`Remove ${o.label}`}
                className="text-slate-500 hover:text-slate-200"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}

        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={showSingleValue ? selected[0].label : query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 || multiple ? placeholder : ""}
          className="min-w-[6rem] flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
        />

        {!multiple && selected[0] && (
          <button
            type="button"
            onClick={() => remove(selected[0].value)}
            aria-label="Clear selection"
            className="text-slate-500 hover:text-slate-200"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
        <ChevronDown className="size-4 shrink-0 text-slate-500" aria-hidden />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-white/10 bg-[#0B0E14] py-1 shadow-2xl shadow-black/40"
        >
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Searching…
            </li>
          )}
          {!loading && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">{emptyMessage}</li>
          )}
          {!loading &&
            options.map((o, i) => {
              const isSelected = selectedValues.has(o.value);
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(o);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                    i === active ? "bg-white/[0.06] text-white" : "text-slate-300",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.sublabel && <span className="block truncate text-xs text-slate-500">{o.sublabel}</span>}
                  </span>
                  {isSelected && <Check className="size-4 shrink-0 text-emerald-400" aria-hidden />}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
