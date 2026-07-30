"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationView } from "@/types/notification";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/admin/(dashboard)/notifications/actions";

/**
 * Notification bell (Phase 3 · M5). Unread badge + dropdown of recent items,
 * fed by the server layout (no client fetch/endpoint). Marking read revalidates.
 */
export function NotificationBell({
  unreadCount,
  recent,
}: {
  unreadCount: number;
  recent: NotificationView[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();

  function markRead(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="relative rounded-md p-2 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-white/10 bg-[#0b0f17] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <span className="text-sm font-medium text-slate-200">Notifications</span>
              {unreadCount > 0 && (
                <button type="button" onClick={markAll} className="text-xs text-slate-400 hover:text-slate-200">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-80 divide-y divide-white/[0.06] overflow-y-auto">
              {recent.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-slate-500">You&apos;re all caught up.</li>
              ) : (
                recent.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => markRead(n.id)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]",
                        !n.readAt && "bg-white/[0.02]",
                      )}
                    >
                      <span className="flex w-full items-center gap-2">
                        {!n.readAt && <span className="size-1.5 shrink-0 rounded-full bg-red-400" aria-hidden />}
                        <span className="truncate text-sm text-slate-200">{n.title}</span>
                      </span>
                      {n.body && <span className="truncate text-xs text-slate-500">{n.body}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="border-t border-white/[0.06] px-3 py-2 text-center">
              <Link href="/admin/notifications" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-200">
                View all
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
