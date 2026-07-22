import type { InquiryMetrics } from "@/types/inquiry";

export function MetricsRow({ metrics }: { metrics: InquiryMetrics }) {
  const cards: { label: string; value: number }[] = [
    { label: "Total Inquiries", value: metrics.total },
    { label: "New", value: metrics.new },
    { label: "In Progress", value: metrics.inProgress },
    { label: "Follow Up", value: metrics.followUp },
    { label: "Converted", value: metrics.converted },
    { label: "Closed", value: metrics.closed },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
        >
          <p className="text-2xl font-semibold text-white tabular-nums">{card.value}</p>
          <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
