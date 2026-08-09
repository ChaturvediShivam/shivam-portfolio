"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_FILE_BYTES } from "@/types/upload";
import { formatFileSize } from "@/lib/resume/validation";
import { useFilePicker } from "./useFilePicker";

/**
 * Drag-and-drop file target (Resume AI · Step 1).
 *
 * The presentational primitive: it reports files and owns no upload state, so
 * both uploaders share one implementation of the fiddly parts — drag counting,
 * keyboard equivalence, and the input reset.
 *
 * Accessibility notes, because a div-based dropzone is the usual way this gets
 * done wrong:
 *
 *   • The interactive element is a real `<button>`, so Enter and Space work
 *     without reimplementing them and it is announced as a control rather than
 *     as decoration. The `<input type="file">` is visually hidden but present,
 *     and the button forwards clicks to it.
 *   • Drag events are decoration only. Every affordance here is reachable by
 *     keyboard, because dragging is not.
 *   • A counter tracks enter/leave rather than a boolean: dragging over a child
 *     element fires `dragleave` on the parent, so a boolean flickers the
 *     highlight off while the pointer is still inside.
 */

export interface DropzoneProps {
  /** Labels the control for assistive tech. */
  label: string;
  /** Short instruction rendered under the label. */
  hint?: string;
  disabled?: boolean;
  busy?: boolean;
  /** True when the last attempt was rejected, for the error styling. */
  invalid?: boolean;
  /** Ties the control to an external message element. */
  describedBy?: string;
  /**
   * Size shown in the hint line. Defaults to the shared MAX_FILE_BYTES.
   *
   * Exists because a caller may enforce a stricter ceiling than the shared one —
   * the public demo does — and a dropzone advertising a limit its caller will
   * reject is worse than no limit at all.
   */
  maxBytes?: number;
  onFiles: (files: FileList | File[]) => void;
  className?: string;
}

export function Dropzone({
  label,
  hint,
  disabled = false,
  busy = false,
  invalid = false,
  describedBy,
  maxBytes = MAX_FILE_BYTES,
  onFiles,
  className,
}: DropzoneProps) {
  const [dragging, setDragging] = React.useState(false);
  // Counter, not boolean — see the note above.
  const dragDepth = React.useRef(0);

  const inert = disabled || busy;
  const picker = useFilePicker(onFiles, inert);

  const reset = React.useCallback(() => {
    dragDepth.current = 0;
    setDragging(false);
  }, []);

  function handleDragEnter(event: React.DragEvent) {
    if (inert) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    if (inert) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDragOver(event: React.DragEvent) {
    if (inert) return;
    // Without preventDefault the browser navigates to the dropped file.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: React.DragEvent) {
    if (inert) return;
    event.preventDefault();
    reset();
    if (event.dataTransfer.files?.length) onFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn("relative", className)}
    >
      <input {...picker.inputProps} />

      <button
        type="button"
        onClick={picker.open}
        disabled={inert}
        aria-describedby={describedBy}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          invalid
            ? "border-red-500/40 bg-red-500/[0.03]"
            : dragging
              ? "border-white/30 bg-white/[0.06]"
              : "border-white/[0.12] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
        )}
      >
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]",
            dragging ? "text-slate-200" : "text-slate-500",
          )}
        >
          <UploadCloud className="size-5" aria-hidden />
        </span>

        <span className="space-y-1">
          <span className="block text-sm font-medium text-slate-200">
            {dragging ? "Drop to upload" : label}
          </span>
          <span className="block text-xs text-slate-500">
            {hint ?? "Drag and drop, or click to browse"}
          </span>
          <span className="block text-xs text-slate-600">
            PDF or DOCX · up to {formatFileSize(maxBytes)}
          </span>
        </span>
      </button>
    </div>
  );
}
