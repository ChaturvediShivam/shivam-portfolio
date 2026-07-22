import type { InquiryStatus } from "@/types/inquiry";

const STATUS_STYLES: Record<InquiryStatus, string> = {
  New: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "In Progress": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Follow Up": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Converted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Closed: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  Spam: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function StatusBadge({ status }: { status: InquiryStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
