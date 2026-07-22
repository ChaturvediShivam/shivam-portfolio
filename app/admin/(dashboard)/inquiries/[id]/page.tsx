import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInquiryById, getNotes, getActivity } from "@/lib/inquiries";
import { StatusSelect } from "@/components/admin/StatusSelect";
import { LeadSourceSelect } from "@/components/admin/LeadSourceSelect";
import { NotesPanel } from "@/components/admin/NotesPanel";
import { ActivityTimeline } from "@/components/admin/ActivityTimeline";
import { DeleteInquiryButton } from "@/components/admin/DeleteInquiryButton";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InquiryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const inquiry = await getInquiryById(supabase, id);
  if (!inquiry) notFound();

  const [notes, activity] = await Promise.all([
    getNotes(supabase, id),
    getActivity(supabase, id),
  ]);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to inquiries
        </Link>
        <DeleteInquiryButton inquiryId={inquiry.id} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h1 className="text-xl font-semibold text-white">{inquiry.name}</h1>
            <p className="text-sm text-slate-500 mt-1">{inquiry.email}</p>
          </div>

          <div>
            <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Message
            </h2>
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
              {inquiry.message}
            </p>
          </div>

          <div>
            <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Internal Notes
            </h2>
            <NotesPanel inquiryId={inquiry.id} notes={notes} />
          </div>

          <div>
            <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Activity Timeline
            </h2>
            <ActivityTimeline activity={activity} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Organization</p>
              <p className="text-sm text-slate-200">{inquiry.organization || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Received</p>
              <p className="text-sm text-slate-200">{formatDate(inquiry.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Status</p>
              <StatusSelect inquiryId={inquiry.id} status={inquiry.status} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Lead Source</p>
              <LeadSourceSelect inquiryId={inquiry.id} leadSource={inquiry.lead_source} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
