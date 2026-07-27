import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";
import { CompanyForm } from "@/components/admin/companies/CompanyForm";

export const metadata = { title: "New company" };

export default function NewCompanyPage() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="New company"
        breadcrumb={
          <Link
            href="/admin/companies"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Companies
          </Link>
        }
      />
      <CompanyForm mode="create" />
    </div>
  );
}
