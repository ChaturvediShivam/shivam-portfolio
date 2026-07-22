import type { InquiryActivity } from "@/types/inquiry";

const EVENT_LABELS: Record<InquiryActivity["event_type"], string> = {
  created: "Inquiry created",
  status_changed: "Status changed",
  lead_source_changed: "Lead source changed",
  note_added: "Note added",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityTimeline({ activity }: { activity: InquiryActivity[] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-slate-600">No activity recorded yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {activity.map((event) => (
        <li key={event.id} className="flex gap-3 text-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-600 mt-1.5 shrink-0" />
          <div>
            <p className="text-slate-200">
              {EVENT_LABELS[event.event_type]}
              {event.detail && <span className="text-slate-500"> — {event.detail}</span>}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">{formatTimestamp(event.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
