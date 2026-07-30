"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import {
  markAllNotificationsReadAction,
  scanNotificationsAction,
} from "@/app/admin/(dashboard)/notifications/actions";

/**
 * Notifications page actions (Phase 3 · M5): Check now (bootstraps + refreshes
 * the scan) and Mark all read.
 */
export function NotificationsToolbar({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean } & Record<string, unknown>>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (isActionError(result as never)) {
        setError("Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => run(scanNotificationsAction)}
          disabled={pending}
          className={cn(buttonClasses("secondary"), pending && "cursor-not-allowed opacity-60")}
        >
          <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden />
          Check now
        </button>
        {hasUnread && (
          <button
            type="button"
            onClick={() => run(markAllNotificationsReadAction)}
            disabled={pending}
            className={cn(buttonClasses("ghost"), pending && "cursor-not-allowed opacity-60")}
          >
            <CheckCheck className="size-4" aria-hidden />
            Mark all read
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
