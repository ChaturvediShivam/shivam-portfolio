import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInquiries, getMetrics } from "@/lib/inquiries";
import { MetricsRow } from "@/components/admin/MetricsRow";
import { FilterBar } from "@/components/admin/FilterBar";
import { InquiriesTable } from "@/components/admin/InquiriesTable";
import type { DateRangeFilter } from "@/types/inquiry";

interface PageProps {
  searchParams: Promise<{ q?: string; range?: string; from?: string; to?: string }>;
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const filters = {
    search: params.q,
    range: (params.range as DateRangeFilter) ?? null,
    from: params.from,
    to: params.to,
  };

  const [metrics, inquiries] = await Promise.all([
    getMetrics(supabase),
    getInquiries(supabase, filters),
  ]);

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-white">Inquiries</h1>
        <p className="text-sm text-slate-500 mt-1">
          {inquiries.length} {inquiries.length === 1 ? "result" : "results"}
        </p>
      </div>

      <MetricsRow metrics={metrics} />
      <FilterBar />
      <InquiriesTable inquiries={inquiries} />
    </div>
  );
}
