import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getOpportunity,
  getOpportunityContacts,
  getOpportunityNotes,
  getOpportunityEvents,
} from "@/lib/opportunities";
import { PageHeader, Badge } from "@/components/admin/ui";
import { OpportunityActions } from "@/components/admin/opportunities/OpportunityActions";
import { OpportunityContactsPanel } from "@/components/admin/opportunities/OpportunityContactsPanel";
import { OpportunityNotesPanel } from "@/components/admin/opportunities/OpportunityNotesPanel";
import { SummarizeButton } from "@/components/admin/opportunities/SummarizeButton";
import { featureEnabled } from "@/lib/featureFlags";
import { humanize, stageBadgeVariant, stageLabel, type Opportunity } from "@/types/opportunity";

interface PageProps {
  params: Promise<{ id: string }>;
}

const dash = <span className="text-slate-600">—</span>;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function formatSalary(o: Opportunity): string | null {
  const cur = o.salary_currency ?? "USD";
  const f = (n: number) => n.toLocaleString();
  if (o.salary_min != null && o.salary_max != null) return `${cur} ${f(o.salary_min)}–${f(o.salary_max)}`;
  if (o.salary_min != null) return `${cur} ${f(o.salary_min)}+`;
  if (o.salary_max != null) return `${cur} up to ${f(o.salary_max)}`;
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{children}</dd>
    </div>
  );
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const opportunity = (await getOpportunity(supabase, id)) as Opportunity | null;
  if (!opportunity) notFound();

  const [contacts, notes, events] = await Promise.all([
    getOpportunityContacts(supabase, id),
    getOpportunityNotes(supabase, id),
    getOpportunityEvents(supabase, id),
  ]);

  const isArchived = opportunity.archived_at != null;
  const salary = formatSalary(opportunity);
  // Gates the whole block, not just generation: flipping the flag off is the
  // first response to a bad summary, so it has to stop displaying them too.
  const summariesEnabled = featureEnabled("FEATURE_AI_SUMMARIES");

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={opportunity.title}
        breadcrumb={
          <Link href="/admin/opportunities" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="size-3.5" aria-hidden />
            Opportunities
          </Link>
        }
        actions={<OpportunityActions opportunity={opportunity} />}
      />

      {isArchived && (
        <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-slate-400">
          <Badge variant="neutral">Archived</Badge>
          <span>This opportunity is archived and hidden from the pipeline.</span>
        </div>
      )}

      {/* AI rollup (Phase 3 · M7.3) — a rollup goes stale as the pursuit moves,
          and nothing refreshes it automatically, so it always states its date. */}
      {summariesEnabled && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">AI summary</h2>
              {opportunity.ai_processed_at && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Generated {formatDate(opportunity.ai_processed_at) ?? "—"}
                </p>
              )}
            </div>
            <SummarizeButton
              opportunityId={opportunity.id}
              hasSummary={Boolean(opportunity.ai_summary)}
            />
          </div>
          {opportunity.ai_summary ? (
            <p className="mt-3 text-sm text-slate-300">{opportunity.ai_summary}</p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No summary yet.</p>
          )}
        </div>
      )}

      {/* Overview */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Badge variant={stageBadgeVariant(opportunity.stage)}>{stageLabel(opportunity.stage)}</Badge>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company">
            {opportunity.company ? (
              <Link href={`/admin/companies/${opportunity.company.id}`} className="text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2">
                {opportunity.company.name}
              </Link>
            ) : (
              dash
            )}
          </Field>
          <Field label="Primary contact">
            {opportunity.primary_contact ? (
              <Link href={`/admin/contacts/${opportunity.primary_contact.id}`} className="text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2">
                {opportunity.primary_contact.full_name}
              </Link>
            ) : (
              dash
            )}
          </Field>
          <Field label="Source">{opportunity.source ?? dash}</Field>
          <Field label="Location">{opportunity.location ?? dash}</Field>
          <Field label="Work mode">{opportunity.location_type ? humanize(opportunity.location_type) : dash}</Field>
          <Field label="Employment">{opportunity.employment_type ? humanize(opportunity.employment_type) : dash}</Field>
          <Field label="Seniority">{opportunity.seniority ?? dash}</Field>
          <Field label="Salary">{salary ?? dash}</Field>
          <Field label="Application method">{opportunity.application_method ?? dash}</Field>
          <Field label="Work authorization">{opportunity.work_authorization ?? dash}</Field>
          <Field label="Applied on">{formatDate(opportunity.applied_at) ?? dash}</Field>
          <Field label="Next action">{formatDate(opportunity.next_action_at) ?? dash}</Field>
          <Field label="Deadline">{formatDate(opportunity.deadline_at) ?? dash}</Field>
          <Field label="Priority">{opportunity.priority ? humanize(opportunity.priority) : dash}</Field>
          <Field label="Job posting">
            {opportunity.job_url ? (
              <a
                href={opportunity.job_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2"
              >
                View posting
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              dash
            )}
          </Field>
        </dl>

        {opportunity.job_description && (
          <details className="mt-5 border-t border-white/[0.06] pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-white marker:text-slate-500">
              Job description
              <span className="ml-2 font-normal text-slate-500">
                {opportunity.job_description.length.toLocaleString()} characters
              </span>
            </summary>
            {/* `whitespace-pre-wrap` preserves the posting's own paragraphing
                and bullet layout, which is most of what makes a description
                readable. Text is rendered as text, never as markup — this
                content arrives from arbitrary web pages via the capture
                extension. */}
            <p className="mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {opportunity.job_description}
            </p>
          </details>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <OpportunityContactsPanel opportunityId={opportunity.id} links={contacts} />
          <OpportunityNotesPanel opportunityId={opportunity.id} notes={notes} />
        </div>

        {/* Timeline */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white">Timeline</h2>
          <ol className="mt-3 space-y-3">
            {events.length === 0 && <li className="text-xs text-slate-500">No activity yet.</li>}
            {events.map((event) => (
              <li key={event.id} className="border-l border-white/10 pl-3">
                <p className="text-sm text-slate-200">{humanize(event.event_type)}</p>
                {event.detail && <p className="text-xs text-slate-500">{event.detail}</p>}
                <p className="mt-0.5 text-xs text-slate-600">
                  <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
                  {event.actor_type === "agent" && " · agent"}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        Added {formatDate(opportunity.created_at)} · Updated {formatDate(opportunity.updated_at)}
      </p>
    </div>
  );
}
