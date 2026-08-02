"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/admin/ui";
import { Dropzone } from "./Dropzone";
import { UploadCard } from "./UploadCard";
import { UploadStatus } from "./UploadStatus";
import { useDocumentUpload } from "./useDocumentUpload";
import { useFilePicker } from "./useFilePicker";
import { isUploadBusy } from "@/types/upload";
import {
  JD_SOURCES,
  MAX_JD_CHARS,
  MIN_JD_CHARS,
  type JobDescriptionInput,
  type JobDescriptionSource,
} from "@/types/job-description";

/**
 * Job description input (Resume AI · Step 1).
 *
 * Two ways in, one output: whichever tab is active, the parent receives a
 * `JobDescriptionInput` and never learns which. That is the point of the union
 * in `types/job-description.ts` — a third source later is a new tab and a new
 * variant, not a change to everything downstream.
 *
 * Each tab keeps its own state while the other is shown. Switching tabs to look
 * at the alternative and losing what you had typed would be the obvious way to
 * make this annoying, so the pasted text and the held file both survive; only
 * the active tab decides what is reported upward.
 *
 * The tablist implements the WAI-ARIA pattern properly: roving tabindex, arrow
 * keys, Home and End. Tabs styled as tabs but keyboard-navigated as links are a
 * common and avoidable failure.
 */

export interface JDUploaderProps {
  disabled?: boolean;
  onChange?: (input: JobDescriptionInput | null) => void;
}

const TAB_LABELS: Record<JobDescriptionSource, string> = {
  paste: "Paste job description",
  upload: "Upload job description",
};

export function JDUploader({ disabled = false, onChange }: JDUploaderProps) {
  const [active, setActive] = React.useState<JobDescriptionSource>("paste");
  const [text, setText] = React.useState("");

  const upload = useDocumentUpload();
  const statusId = React.useId();
  const baseId = React.useId();

  const busy = isUploadBusy(upload.state);
  const inert = disabled || busy;
  const replacePicker = useFilePicker(upload.accept, inert);

  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  // One place decides what the parent sees, so the two tabs cannot disagree
  // about which input is live.
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    if (active === "paste") {
      const trimmed = text.trim();
      onChangeRef.current?.(trimmed ? { source: "paste", text: trimmed } : null);
      return;
    }
    onChangeRef.current?.(upload.document ? { source: "upload", document: upload.document } : null);
  }, [active, text, upload.document]);

  function onTabKeyDown(event: React.KeyboardEvent) {
    const index = JD_SOURCES.indexOf(active);
    let next: number | null = null;

    if (event.key === "ArrowRight") next = (index + 1) % JD_SOURCES.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + JD_SOURCES.length) % JD_SOURCES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = JD_SOURCES.length - 1;

    if (next === null) return;
    event.preventDefault();
    const source = JD_SOURCES[next];
    setActive(source);
    tabRefs.current[source]?.focus();
  }

  const trimmedLength = text.trim().length;
  const tooShort = trimmedLength > 0 && trimmedLength < MIN_JD_CHARS;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Job description source" className="flex gap-1 border-b border-white/[0.06]">
        {JD_SOURCES.map((source) => {
          const selected = active === source;
          return (
            <button
              key={source}
              ref={(node) => {
                tabRefs.current[source] = node;
              }}
              role="tab"
              id={`${baseId}-tab-${source}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${source}`}
              // Roving tabindex: one stop for the whole tablist.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(source)}
              onKeyDown={onTabKeyDown}
              disabled={disabled}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-white/60 font-medium text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300",
              )}
            >
              {TAB_LABELS[source]}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-paste`}
        aria-labelledby={`${baseId}-tab-paste`}
        hidden={active !== "paste"}
      >
        <label htmlFor={`${baseId}-textarea`} className="sr-only">
          Job description text
        </label>
        <Textarea
          id={`${baseId}-textarea`}
          rows={10}
          value={text}
          maxLength={MAX_JD_CHARS}
          disabled={disabled}
          invalid={tooShort}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste the complete job description here..."
          aria-describedby={`${baseId}-textarea-hint`}
        />
        <p id={`${baseId}-textarea-hint`} className="mt-2 text-xs text-slate-600">
          {trimmedLength === 0
            ? `Include the requirements and responsibilities — at least ${MIN_JD_CHARS} characters.`
            : tooShort
              ? `${trimmedLength} of ${MIN_JD_CHARS} characters minimum.`
              : `${trimmedLength.toLocaleString()} characters.`}
        </p>
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-upload`}
        aria-labelledby={`${baseId}-tab-upload`}
        hidden={active !== "upload"}
      >
        <div className="space-y-3">
          {upload.document ? (
            <>
              <UploadCard
                document={upload.document}
                busy={busy}
                disabled={disabled}
                progress={upload.state.status === "transferring" ? upload.state.progress : null}
                onRemove={upload.clear}
                onReplace={replacePicker.open}
              />
              <input {...replacePicker.inputProps} />
            </>
          ) : (
            <Dropzone
              label="Upload the job description"
              hint="Drag and drop, or click to browse"
              disabled={disabled}
              busy={busy}
              invalid={upload.state.status === "rejected"}
              describedBy={statusId}
              onFiles={upload.accept}
            />
          )}

          <UploadStatus id={statusId} state={upload.state} successLabel="Job description ready." />
        </div>
      </div>
    </div>
  );
}
