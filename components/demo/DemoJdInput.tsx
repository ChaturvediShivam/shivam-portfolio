"use client";

import * as React from "react";
import { DEMO_MAX_JD_CHARS } from "@/lib/demo/limits";

/**
 * Job description input: the bundled sample, or pasted text.
 *
 * The counter is a courtesy, not a control. The server bounds the same value
 * with the same ceiling, so a visitor who defeats this one gains nothing except
 * a slower rejection.
 */

export interface DemoJdInputProps {
  /** Null means the bundled sample is selected. */
  value: string | null;
  disabled?: boolean;
  error?: string;
  onChange: (next: string | null) => void;
}

const SAMPLE_LABEL = "Sample posting — Senior Full Stack Engineer, Meridian AI";

export function DemoJdInput({ value, disabled, error, onChange }: DemoJdInputProps) {
  const usingSample = value === null;
  const length = value?.length ?? 0;
  const overLimit = length > DEMO_MAX_JD_CHARS;

  return (
    <section aria-labelledby="demo-jd-heading" className="flex flex-col gap-3">
      <h2 id="demo-jd-heading" className="text-sm font-semibold text-consulting-navy dark:text-white">
        2 · Job description
      </h2>

      <label htmlFor="demo-jd" className="sr-only">
        Paste a job description
      </label>
      <textarea
        id="demo-jd"
        rows={10}
        disabled={disabled}
        value={value ?? ""}
        placeholder="Paste the job description here…"
        aria-invalid={error !== undefined || overLimit}
        aria-describedby="demo-jd-status"
        onChange={(event) => {
          // Empty means "back to the sample", so clearing the box is never a
          // dead end the visitor has to recover from.
          const next = event.target.value;
          onChange(next.trim() === "" ? null : next);
        }}
        className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed text-consulting-navy placeholder:text-slate-400 focus:border-consulting-royal focus:outline-none focus:ring-2 focus:ring-consulting-royal/30 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-100"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled || usingSample}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-consulting-slate transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.06]"
        >
          Use the sample posting
        </button>

        <p
          id="demo-jd-status"
          role="status"
          aria-live="polite"
          className={
            error || overLimit
              ? "text-xs text-red-600 dark:text-red-400"
              : "text-xs text-consulting-slate dark:text-slate-400"
          }
        >
          {error
            ? error
            : overLimit
              ? `Too long by ${(length - DEMO_MAX_JD_CHARS).toLocaleString()} characters.`
              : usingSample
                ? SAMPLE_LABEL
                : `${length.toLocaleString()} characters`}
        </p>
      </div>
    </section>
  );
}
