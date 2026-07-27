import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCompany } from "@/lib/companies";
import { PageHeader } from "@/components/admin/ui";
import { CompanyForm } from "@/components/admin/companies/CompanyForm";
import type { Company } from "@/types/company";

export const metadata = { title: "Edit company" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCompanyPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const company = (await getCompany(supabase, id)) as Company | null;
  if (!company) notFound();

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={`Edit ${company.name}`}
        breadcrumb={
          <Link
            href={`/admin/companies/${company.id}`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {company.name}
          </Link>
        }
      />
      <CompanyForm mode="edit" company={company} />
    </div>
  );
}
