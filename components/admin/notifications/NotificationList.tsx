import { Badge, EmptyState } from "@/components/admin/ui";
import { BellRing } from "lucide-react";
import type { NotificationPriority, NotificationView } from "@/types/notification";

/**
 * Presentational notifications list (Phase 3 · M5). Server-compatible.
 */

const PRIORITY_BADGE: Record<NotificationPriority, { variant: "danger" | "neutral" | "success"; label: string } | null> = {
  critical: { variant: "danger", label: "Critical" },
  high: { variant: "danger", label: "High" },
  normal: null,
  low: null,
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationList({ notifications }: { notifications: NotificationView[] }) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<BellRing className="size-6" aria-hidden />}
        title="No notifications"
        description="Task reminders, new mail, and upcoming interviews will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-white/[0.02]">
      {notifications.map((n) => {
        const badge = PRIORITY_BADGE[n.priority];
        return (
          <li key={n.id} className="flex items-start gap-3 p-3">
            {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-red-400" aria-hidden />}
            <div className={n.readAt ? "min-w-0 flex-1 opacity-70" : "min-w-0 flex-1"}>
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-slate-200">{n.title}</p>
                {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
              </div>
              {n.body && <p className="mt-0.5 text-xs text-slate-400">{n.body}</p>}
              <p className="mt-0.5 text-xs text-slate-600">{when(n.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
