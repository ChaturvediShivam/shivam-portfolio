"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { syncNowAction } from "@/app/admin/(dashboard)/messages/actions";

/**
 * "Sync now" — enqueues a Gmail sync for the connected account (Phase 3 · M3).
 * The actual sync runs in the background job; this just requests one.
 */
export function SyncNowButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await syncNowAction();
      if (isActionError(result)) {
        setError(result.formError ?? "Could not start sync.");
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
        <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden />
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
