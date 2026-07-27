import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";
import { OpportunityForm } from "@/components/admin/opportunities/OpportunityForm";

export const metadata = { title: "New opportunity" };

export default function NewOpportunityPage() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="New opportunity"
        breadcrumb={
          <Link
            href="/admin/opportunities"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Opportunities
          </Link>
        }
      />
      <OpportunityForm mode="create" />
    </div>
  );
}
