"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { summarizeOpportunityAction } from "@/app/admin/(dashboard)/opportunities/actions";

/**
 * "Summarize" — generates an AI rollup for this opportunity (Phase 3 · M7.3).
 *
 * Separate from the Messages button because the two call different actions;
 * sharing one component would mean passing the action in, which is more
 * indirection than two small files are worth.
 */
export function SummarizeButton({
  opportunityId,
  hasSummary,
}: {
  opportunityId: string;
  hasSummary: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await summarizeOpportunityAction(opportunityId);
      if (isActionError(result)) {
        setError(result.formError ?? "Could not summarize this opportunity.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={cn(buttonClasses("secondary"), pending && "cursor-not-allowed opacity-60")}
      >
        <Sparkles className={cn("size-4", pending && "animate-pulse")} aria-hidden />
        {pending ? "Summarizing…" : hasSummary ? "Refresh summary" : "Summarize"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
