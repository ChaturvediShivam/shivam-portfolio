"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { summarizeMessageAction } from "@/app/admin/(dashboard)/messages/actions";

/**
 * "Summarize" — generates an AI summary for this message (Phase 3 · M7).
 *
 * The action runs the completion inline, so the summary is on screen when this
 * resolves. Disabled while pending, which is what stops a double-click becoming
 * a second billed call.
 */
export function SummarizeButton({ messageId, hasSummary }: { messageId: string; hasSummary: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await summarizeMessageAction(messageId);
      if (isActionError(result)) {
        setError(result.formError ?? "Could not summarize this message.");
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
        {pending ? "Summarizing…" : hasSummary ? "Re-summarize" : "Summarize"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
