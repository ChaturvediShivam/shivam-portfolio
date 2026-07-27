import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Users, Briefcase } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCompany, getCompanyRelationCounts } from "@/lib/companies";
import { PageHeader, Badge } from "@/components/admin/ui";
import { CompanyActions } from "@/components/admin/companies/CompanyActions";
import type { Company } from "@/types/company";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{children}</dd>
    </div>
  );
}

function ExternalLinkValue({ href }: { href: string | null }) {
  if (!href) return <span className="text-slate-600">—</span>;
  const display = href.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2"
    >
      {display}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const company = (await getCompany(supabase, id)) as Company | null;
  if (!company) notFound();

  const counts = await getCompanyRelationCounts(supabase, id);
  const isArchived = company.archived_at != null;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={company.name}
        breadcrumb={
          <Link
            href="/admin/companies"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Companies
          </Link>
        }
        actions={<CompanyActions company={company} />}
      />

      {isArchived && (
        <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-slate-400">
          <Badge variant="neutral">Archived</Badge>
          <span>This company is archived and hidden from the default list.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Users className="size-3.5" aria-hidden /> Contacts
          </div>
          <p className="mt-1 text-xl font-semibold text-white">{counts.contacts}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Briefcase className="size-3.5" aria-hidden /> Opportunities
          </div>
          <p className="mt-1 text-xl font-semibold text-white">{counts.opportunities}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Industry">{company.industry ?? <span className="text-slate-600">—</span>}</Field>
          <Field label="Employees">{company.employee_range ?? <span className="text-slate-600">—</span>}</Field>
          <Field label="Headquarters">{company.headquarters ?? <span className="text-slate-600">—</span>}</Field>
          <Field label="Country">{company.country ?? <span className="text-slate-600">—</span>}</Field>
          <Field label="Domain">{company.domain ?? <span className="text-slate-600">—</span>}</Field>
          <Field label="Website"><ExternalLinkValue href={company.website} /></Field>
          <Field label="LinkedIn"><ExternalLinkValue href={company.linkedin_url} /></Field>
          <Field label="Careers"><ExternalLinkValue href={company.careers_url} /></Field>
        </dl>

        {company.description && (
          <div className="mt-5 border-t border-white/[0.06] pt-5">
            <dt className="text-xs text-slate-500">Description</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{company.description}</dd>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-600">
        Added {formatDate(company.created_at)} · Updated {formatDate(company.updated_at)}
      </p>
    </div>
  );
}
