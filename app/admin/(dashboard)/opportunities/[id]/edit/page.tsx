import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOpportunity } from "@/lib/opportunities";
import { PageHeader } from "@/components/admin/ui";
import { OpportunityForm } from "@/components/admin/opportunities/OpportunityForm";
import type { Opportunity } from "@/types/opportunity";

export const metadata = { title: "Edit opportunity" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditOpportunityPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const opportunity = (await getOpportunity(supabase, id)) as Opportunity | null;
  if (!opportunity) notFound();

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={`Edit ${opportunity.title}`}
        breadcrumb={
          <Link
            href={`/admin/opportunities/${opportunity.id}`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {opportunity.title}
          </Link>
        }
      />
      <OpportunityForm mode="edit" opportunity={opportunity} />
    </div>
  );
}
