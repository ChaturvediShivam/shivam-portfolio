import * as React from "react";
import { cn } from "@/lib/utils";

/** Base shimmer block. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/[0.04]", className)}
      aria-hidden
      {...props}
    />
  );
}

export type LoadingVariant = "table" | "card" | "detail" | "list";

export interface LoadingStateProps {
  variant?: LoadingVariant;
  /** Number of skeleton rows/cards (table/list/card). */
  rows?: number;
  className?: string;
}

/**
 * Layout-aware loading placeholder. Use as the content of a route `loading.tsx`
 * or a `<Suspense>` fallback. Marked `aria-busy` so assistive tech announces it.
 */
export function LoadingState({ variant = "table", rows = 6, className }: LoadingStateProps) {
  return (
    <div className={cn("w-full", className)} aria-busy="true" role="status">
      <span className="sr-only">Loading…</span>
      {variant === "table" && (
        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
          <div className="flex gap-4 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3 flex-1" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex gap-4 border-b border-white/[0.06] px-4 py-4 last:border-0">
              {Array.from({ length: 4 }).map((_, c) => (
                <Skeleton key={c} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      )}

      {variant === "list" && (
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {variant === "card" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {variant === "detail" && (
        <div className="space-y-4">
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
