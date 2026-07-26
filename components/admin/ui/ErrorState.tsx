"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  /** Retry handler — in a route `error.tsx`, pass the boundary's `reset`. */
  onRetry?: () => void;
  /** Optional technical detail (dev aid); never shown by default in prod copy. */
  details?: string;
  className?: string;
}

/**
 * Recoverable error surface. Use as the content of a route `error.tsx`
 * (a client component that receives `error` + `reset`) or inside a failed panel.
 */
export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this. Please try again.",
  onRetry,
  details,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-16 rounded-lg border border-red-500/20 bg-red-500/[0.03]",
        className,
      )}
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-slate-500">{message}</p>
      {details && (
        <pre className="mt-3 max-w-full overflow-x-auto rounded-md bg-black/30 px-3 py-2 text-left text-[11px] text-slate-500">
          {details}
        </pre>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
