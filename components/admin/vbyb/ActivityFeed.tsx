import Link from "next/link";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import type { EventWithCustomer } from "@/lib/vbyb/events";
import { formatDateTime } from "@/lib/vbyb/format";
import { DECISION_LABELS, EVENT_LABELS, humanize, type Decision } from "@/types/vbyb";

function detailFor(event: EventWithCustomer): string | null {
  const m = (event.metadata ?? {}) as Record<string, unknown>;
  switch (event.event_type) {
    case "DECISION_RECORDED":
      return typeof m.decision === "string" ? DECISION_LABELS[m.decision as Decision] ?? null : null;
    case "VALIDATION_STATUS_CHANGED":
    case "VALIDATION_STARTED":
    case "VALIDATION_DELIVERED":
      return typeof m.from === "string" && typeof m.to === "string" ? `${humanize(m.from)} → ${humanize(m.to)}` : null;
    case "SUBMISSION_LINKED":
      return typeof m.matched_by === "string" ? `Matched by ${m.matched_by}` : null;
    case "SUBMISSION_UNMATCHED":
      return typeof m.reason === "string" ? humanize(m.reason) : null;
    case "ORDER_CREATED":
      if (m.is_test === true) return "Test order";
      if (m.capacity_status === "over_capacity") return "Over capacity";
      return typeof m.slot_number === "number" ? `Founding slot ${m.slot_number}` : null;
    case "ORDER_REFUNDED":
      return typeof m.freed_slot_number === "number" ? `Freed slot ${m.freed_slot_number}` : null;
    case "VALIDATION_UPDATED":
      return typeof m.section === "string" ? `Updated ${humanize(m.section).toLowerCase()}` : null;
    default:
      return null;
  }
}

export function ActivityFeed({ events, emptyText = "No activity yet." }: { events: EventWithCustomer[]; emptyText?: string }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;

  return (
    <ol className="space-y-3">
      {events.map((event) => {
        const detail = detailFor(event);
        const who = event.customer?.name || event.customer?.email;
        const href = event.validation_id
          ? `${VBYB_BASE_PATH}/validations/${event.validation_id}`
          : event.order_id
            ? `${VBYB_BASE_PATH}/orders/${event.order_id}`
            : null;
        const label = EVENT_LABELS[event.event_type] ?? event.event_type;

        return (
          <li key={event.id} className="flex gap-3 text-sm">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
            <div className="min-w-0">
              <p className="text-slate-200">
                {href ? (
                  <Link href={href} className="hover:underline">
                    {label}
                  </Link>
                ) : (
                  label
                )}
                {who && <span className="text-slate-500"> · {who}</span>}
              </p>
              <p className="text-xs text-slate-500">
                {formatDateTime(event.created_at)} · {event.actor_type}
                {detail ? ` · ${detail}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
