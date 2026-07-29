import Link from "next/link";
import { CalendarClock, MapPin } from "lucide-react";
import { Badge, EmptyState } from "@/components/admin/ui";
import type { CalendarEvent } from "@/types/calendar";

/**
 * Presentational agenda list (Phase 3 · M4). Groups upcoming events by day.
 * Server-compatible (no client state).
 */

function dayKey(iso: string | null): string {
  if (!iso) return "Undated";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function timeLabel(ev: CalendarEvent): string {
  if (ev.all_day) return "All day";
  if (!ev.starts_at) return "—";
  const start = new Date(ev.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const end = ev.ends_at ? new Date(ev.ends_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  return end ? `${start} – ${end}` : start;
}

export function CalendarAgenda({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-6" aria-hidden />}
        title="No upcoming events"
        description="Connected calendar events and scheduled interviews appear here."
      />
    );
  }

  const groups = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = dayKey(ev.starts_at);
    const list = groups.get(key) ?? [];
    list.push(ev);
    groups.set(key, list);
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([day, dayEvents]) => (
        <section key={day} aria-label={day}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{day}</h2>
          <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-white/[0.02]">
            {dayEvents.map((ev) => (
              <li key={ev.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">{ev.title ?? "(no title)"}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{timeLabel(ev)}</span>
                    {ev.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden />
                        {ev.location}
                      </span>
                    )}
                  </div>
                </div>
                {ev.opportunity && (
                  <Link href={`/admin/opportunities/${ev.opportunity.id}`} className="shrink-0">
                    <Badge variant="neutral">{ev.opportunity.title}</Badge>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
