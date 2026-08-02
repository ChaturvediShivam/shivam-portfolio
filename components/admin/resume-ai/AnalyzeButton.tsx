"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/admin/ui";

/**
 * Analyze action (Resume AI · Step 1).
 *
 * Disabled until both inputs are present. The reason is stated in text next to
 * the button rather than only in a `title`: a disabled control with no
 * explanation is the most common accessibility failure in a form like this, and
 * `title` is not announced reliably.
 *
 * The button is disabled but never removed from the tab order by being hidden,
 * so a keyboard user reaches it, hears why it cannot be used, and knows what to
 * fix.
 *
 * No handler is wired in Step 1. `onAnalyze` is optional so the later step
 * supplies it without changing a prop signature that other code depends on.
 */

export interface AnalyzeButtonProps {
  ready: boolean;
  loading?: boolean;
  /** Why it cannot run yet. Rendered when `ready` is false. */
  blockedReason?: string;
  onAnalyze?: () => void;
}

export function AnalyzeButton({ ready, loading = false, blockedReason, onAnalyze }: AnalyzeButtonProps) {
  const messageId = React.useId();
  const disabled = !ready || loading;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="primary"
        disabled={disabled}
        isLoading={loading}
        onClick={onAnalyze}
        aria-describedby={!ready && blockedReason ? messageId : undefined}
      >
        <Sparkles className="size-4" aria-hidden />
        {loading ? "Analyzing…" : "Analyze resume"}
      </Button>

      {!ready && blockedReason && (
        <p id={messageId} className="text-xs text-slate-500">
          {blockedReason}
        </p>
      )}
    </div>
  );
}
