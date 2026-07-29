"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonClasses } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { syncCalendarNowAction } from "@/app/admin/(dashboard)/calendar/actions";
import { ScheduleInterviewDialog } from "./ScheduleInterviewDialog";

/**
 * Calendar header actions (Phase 3 · M4): Sync now + Schedule interview.
 * Both require a connected Google account.
 */
export function CalendarToolbar({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function handleSync() {
    setError(null);
    startTransition(async () => {
      const result = await syncCalendarNowAction();
      if (isActionError(result)) {
        setError(result.formError ?? "Could not start sync.");
        return;
      }
      router.refresh();
    });
  }

  if (!connected) {
    return <span className="text-xs text-slate-500">Connect Google in Settings to sync your calendar.</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSync}
          disabled={pending}
          className={cn(buttonClasses("secondary"), pending && "cursor-not-allowed opacity-60")}
        >
          <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden />
          {pending ? "Syncing…" : "Sync now"}
        </button>
        <Button type="button" variant="primary" onClick={() => setDialogOpen(true)}>
          <CalendarPlus className="size-4" aria-hidden />
          Schedule interview
        </Button>
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
      <ScheduleInterviewDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
