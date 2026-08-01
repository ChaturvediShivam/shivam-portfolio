"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import {
  backfillSummariesAction,
  type BackfillSummariesResult,
} from "@/app/admin/(dashboard)/settings/actions";

/**
 * "Summarize backlog" — one bounded backfill pass (Phase 3 · M7.4).
 *
 * Reports what the pass did rather than just succeeding, because the operator
 * runs this repeatedly and needs to see progress: a batch that scans rows but
 * finds none eligible means the remaining backlog is short or promotional mail,
 * not that the backfill is broken.
 */
export function BackfillSummariesButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BackfillSummariesResult | null>(null);

  function handleClick() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await backfillSummariesAction();
      if (isActionError(outcome)) {
        setError(outcome.formError ?? "Could not run the backfill.");
        return;
      }
      setResult(outcome.data);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={cn(buttonClasses("secondary"), pending && "cursor-not-allowed opacity-60")}
      >
        <History className={cn("size-4", pending && "animate-pulse")} aria-hidden />
        {pending ? "Requesting…" : "Summarize backlog"}
      </button>

      {result && (
        <p className="text-xs text-slate-400">
          Scanned {result.scanned} · eligible {result.eligible} · skipped {result.skipped} ·
          requested {result.enqueued}
          {result.failed > 0 && <span className="text-red-400"> · failed {result.failed}</span>}
          {result.enqueued > 0 && (
            <span className="text-slate-500"> — summaries appear as the queue drains.</span>
          )}
        </p>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
