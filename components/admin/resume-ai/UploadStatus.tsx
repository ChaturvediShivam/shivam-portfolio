"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadState } from "@/types/upload";

/**
 * Upload state messaging (Resume AI · Step 1).
 *
 * One component owns every non-idle state so the two uploaders cannot describe
 * the same condition differently, and so the live region exists in exactly one
 * place. `aria-live="polite"` rather than `assertive`: an upload result is worth
 * announcing but never worth interrupting what the screen reader is mid-way
 * through saying.
 *
 * A rejection is styled distinctly from an error. The first is the operator's
 * file being wrong and is fixable by choosing another; the second is the system
 * failing and is not their doing. Rendering both in the same red box would tell
 * them nothing about which it was.
 */

export interface UploadStatusProps {
  state: UploadState;
  /** Rendered when the upload succeeded. */
  successLabel?: string;
  id?: string;
  className?: string;
}

export function UploadStatus({ state, successLabel, id, className }: UploadStatusProps) {
  const content = render(state, successLabel);

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className={cn("min-h-[1.25rem]", className)}
    >
      {content}
    </div>
  );
}

function render(state: UploadState, successLabel?: string): React.ReactNode {
  switch (state.status) {
    case "empty":
      return null;

    case "validating":
      return <Busy>Checking the file…</Busy>;

    case "transferring":
      return (
        <Busy>
          {state.progress === null
            ? "Uploading…"
            : `Uploading… ${Math.round(state.progress)}%`}
        </Busy>
      );

    case "processing":
      return <Busy>Reading the document…</Busy>;

    case "ready":
      return successLabel ? (
        <p className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          {successLabel}
        </p>
      ) : null;

    case "rejected":
      return (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-300">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {state.rejection.message}
            {state.rejection.fileName && (
              <span className="mt-0.5 block text-amber-300/60">{state.rejection.fileName}</span>
            )}
          </span>
        </p>
      );

    case "error":
      return (
        <p className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      );
  }
}

function Busy({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
      {children}
    </p>
  );
}
