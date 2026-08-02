"use client";

import * as React from "react";
import { FileText, RefreshCw, X } from "lucide-react";
import { Badge, Button } from "@/components/admin/ui";
import { formatFileSize } from "@/lib/resume/validation";
import type { UploadedDocument } from "@/types/upload";

/**
 * A held document, with its actions (Resume AI · Step 1).
 *
 * Replace and Remove are both offered because they are different intents:
 * replace swaps the file and keeps the operator in flow, remove clears back to
 * the empty state. Collapsing them into one control would force a two-step
 * dance for the common case of picking the wrong file.
 *
 * The progress bar renders only when a transfer reports a number. Step 1 never
 * produces one — nothing leaves the browser yet — so the bar is present in the
 * component and dormant in practice, ready for the step that adds a real
 * transfer.
 */

export interface UploadCardProps {
  document: UploadedDocument;
  /** Null when indeterminate; 0–100 when known. */
  progress?: number | null;
  busy?: boolean;
  disabled?: boolean;
  onRemove: () => void;
  onReplace: () => void;
}

export function UploadCard({
  document,
  progress = null,
  busy = false,
  disabled = false,
  onRemove,
  onReplace,
}: UploadCardProps) {
  const inert = busy || disabled;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-slate-400"
          aria-hidden
        >
          <FileText className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-200" title={document.name}>
            {document.name}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            <Badge variant="neutral">{document.type.toUpperCase()}</Badge>
            <span>{formatFileSize(document.sizeBytes)}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReplace}
            disabled={inert}
            aria-label={`Replace ${document.name}`}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Replace
          </Button>
          <Button
            variant="icon"
            onClick={onRemove}
            disabled={inert}
            aria-label={`Remove ${document.name}`}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {busy && (
        <div className="mt-3">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]"
            role="progressbar"
            aria-label={`Uploading ${document.name}`}
            {...(progress === null
              ? {}
              : { "aria-valuenow": Math.round(progress), "aria-valuemin": 0, "aria-valuemax": 100 })}
          >
            <div
              className={
                progress === null
                  ? "h-full w-1/3 animate-pulse rounded-full bg-white/30"
                  : "h-full rounded-full bg-white/40 transition-[width] duration-300"
              }
              style={progress === null ? undefined : { width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
