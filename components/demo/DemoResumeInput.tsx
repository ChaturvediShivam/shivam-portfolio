"use client";

import * as React from "react";
import { Dropzone } from "@/components/admin/resume-ai/Dropzone";
import { validateSelection, toUploadedDocument } from "@/lib/resume/validation";
import { parseResume, ResumeParseError } from "@/lib/resume/parse";
import { DEMO_MAX_FILE_BYTES } from "@/lib/demo/limits";

/**
 * Resume input: the bundled sample, or a file the visitor supplies.
 *
 * Extraction happens HERE, in the browser, and only the resulting text is
 * handed upward. pdfjs runs nowhere else, and keeping the binary on the device
 * means the server never receives a file to validate, store, or be attacked
 * with. The server re-derives structure from the text it does receive, so
 * nothing about this component is trusted — it is a convenience, not a
 * boundary.
 *
 * Reuses `Dropzone`, `validateSelection` and `parseResume` unchanged. There is
 * no second parser here and no second set of upload rules.
 */

export interface DemoResumeInputProps {
  /** Null means the bundled sample is selected. */
  value: string | null;
  label: string;
  disabled?: boolean;
  onChange: (next: { text: string | null; label: string }) => void;
}

const SAMPLE_LABEL = "Sample resume — Jordan Ellis, senior frontend engineer";

export function DemoResumeInput({ value, label, disabled, onChange }: DemoResumeInputProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      setError(null);

      const selection = validateSelection(files);
      if (selection.ok === false) {
        setError(selection.rejection.message);
        return;
      }

      // A second, tighter ceiling than the shared one: a 10 MB scan is a tab
      // crash on a mid-range phone, and this page is public.
      if (selection.file.size > DEMO_MAX_FILE_BYTES) {
        setError(
          `Keep the file under ${Math.round(DEMO_MAX_FILE_BYTES / (1024 * 1024))} MB for the demo.`,
        );
        return;
      }

      setBusy(true);
      try {
        const parsed = await parseResume(toUploadedDocument(selection.file, selection.type));
        onChange({ text: parsed.text, label: selection.file.name });
      } catch (err) {
        // ResumeParseError messages are written for the reader; anything else
        // stays generic rather than surfacing a library's internals.
        setError(
          err instanceof ResumeParseError
            ? err.message
            : "That file could not be read. Try exporting it again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  const usingSample = value === null;

  return (
    <section aria-labelledby="demo-resume-heading" className="flex flex-col gap-3">
      <h2
        id="demo-resume-heading"
        className="text-sm font-semibold text-consulting-navy dark:text-white"
      >
        1 · Resume
      </h2>

      <Dropzone
        label="Upload a resume"
        hint="Parsed in your browser — the file is never uploaded."
        maxBytes={DEMO_MAX_FILE_BYTES}
        tone="light"
        disabled={disabled}
        busy={busy}
        invalid={error !== null}
        describedBy="demo-resume-status"
        onFiles={handleFiles}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setError(null);
            onChange({ text: null, label: SAMPLE_LABEL });
          }}
          disabled={disabled || usingSample}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-consulting-slate transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.06]"
        >
          Use the sample resume
        </button>
      </div>

      {/* One live region for both states: a screen reader hears the outcome of
          a drop whether it succeeded or failed, without two competing regions. */}
      <p
        id="demo-resume-status"
        role="status"
        aria-live="polite"
        className={
          error
            ? "text-xs text-red-600 dark:text-red-400"
            : "text-xs text-consulting-slate dark:text-slate-400"
        }
      >
        {error
          ? error
          : busy
            ? "Reading your resume…"
            : usingSample
              ? SAMPLE_LABEL
              : `Ready: ${label}`}
      </p>
    </section>
  );
}
