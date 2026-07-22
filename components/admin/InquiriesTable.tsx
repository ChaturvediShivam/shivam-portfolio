import Link from "next/link";
import type { Inquiry } from "@/types/inquiry";
import { StatusBadge } from "@/components/admin/StatusBadge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InquiriesTable({ inquiries }: { inquiries: Inquiry[] }) {
  if (inquiries.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] py-16 text-center text-sm text-slate-500">
        No inquiries match the current filters.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.06] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left text-xs text-slate-500">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Organization</th>
            <th className="px-4 py-3 font-medium hidden md:table-cell">Message</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Received</th>
          </tr>
        </thead>
        <tbody>
          {inquiries.map((inquiry) => (
            <tr
              key={inquiry.id}
              className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-4 py-3">
                <Link href={`/admin/inquiries/${inquiry.id}`} className="block">
                  <p className="text-slate-200 font-medium">{inquiry.name}</p>
                  <p className="text-slate-500 text-xs">{inquiry.email}</p>
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-400">{inquiry.organization || "—"}</td>
              <td className="px-4 py-3 text-slate-400 hidden md:table-cell max-w-xs truncate">
                {inquiry.message}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={inquiry.status} />
              </td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                {formatDate(inquiry.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
