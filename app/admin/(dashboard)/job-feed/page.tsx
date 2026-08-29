import { notFound } from "next/navigation";
import { Radar, ExternalLink } from "lucide-react";
import { PageHeader, EmptyState, ErrorState, Badge } from "@/components/admin/ui";
import { featureEnabled } from "@/lib/featureFlags";
import { getJobs, type AiDevBoardJob } from "@/lib/integrations/aidevboard/client";
import { JobMatchPanel } from "@/components/admin/job-feed/JobMatchPanel";

/**
 * Job Feed — AI Dev Jobs listings, with per-job AI fit analysis.
 *
 * Phase 1 proved the REST adapter end to end and still shapes this page: it
 * renders the board's own fields, so what the API says and what the screen
 * shows can be compared by eye.
 *
 * Phase 2 adds `JobMatchPanel` per card. Nothing about that is automatic — the
 * page still costs zero model calls to render, and an assessment happens only
 * when the operator clicks. Fetching the feed and judging a job are separate
 * concerns and stay on separate paths.
 *
 * Errors are caught here rather than thrown, because a third-party outage
 * should degrade this page, not the dashboard around it. The caught error is
 * logged server-side and the visitor gets a fixed sentence: the adapter's
 * messages carry no secrets, but "expose nothing you did not choose to expose"
 * is cheaper to keep than to audit.
 */

export const metadata = { title: "Job Feed" };

/** Flag read per request: flipping it is a rollback, not a redeploy. */
export const dynamic = "force-dynamic";

/**
 * The demo query, exactly as verified with curl:
 *   /api/v1/jobs?q=LLM&workplace=remote&limit=5
 *
 * It lives here, in the caller, and not in the service — `getJobs` takes every
 * filter as a parameter and hardcodes none, so the next caller (a saved search,
 * a cron sweep) supplies its own.
 */
const DEMO_QUERY = { q: "LLM", workplace: "remote", limit: 5 } as const;

function formatSalary(min: number | null, max: number | null): string | null {
  const fmt = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n.toLocaleString("en-US")}`;
  if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`;
  if (min !== null) return `From ${fmt(min)}`;
  if (max !== null) return `Up to ${fmt(max)}`;
  return null; // Most postings state no salary; absence is normal, not an error.
}

function JobCard({ job, matchEnabled }: { job: AiDevBoardJob; matchEnabled: boolean }) {
  const salary = formatSalary(job.salary_min, job.salary_max);
  const applyUrl = job.apply_url ?? job.url;

  return (
    <li className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-slate-100">{job.title}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {job.company_name ?? "Unknown company"}
            {job.location ? <span className="text-slate-500"> · {job.location}</span> : null}
          </p>
        </div>
        {applyUrl ? (
          <a
            href={applyUrl}
            target="_blank"
            // noreferrer as well as noopener: the destination is an arbitrary
            // employer URL supplied by a third party.
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
          >
            Apply
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {job.workplace ? <Badge variant="info">{job.workplace}</Badge> : null}
        {job.experience_level ? <Badge variant="neutral">{job.experience_level}</Badge> : null}
        {job.job_type ? <Badge variant="neutral">{job.job_type}</Badge> : null}
        {salary ? <Badge variant="success">{salary}</Badge> : null}
      </div>

      {job.tags.length > 0 ? (
        <p className="mt-3 text-[11px] text-slate-500">{job.tags.join(" · ")}</p>
      ) : null}

      {/* Never analyzed on render — the panel only calls the model when the
          operator clicks. See JobMatchPanel. */}
      {matchEnabled ? <JobMatchPanel jobId={job.id} /> : null}
    </li>
  );
}

export default async function JobFeedPage() {
  if (!featureEnabled("FEATURE_AIDEVBOARD")) notFound();

  // Feature flags are server-only, so the answer travels to the client as a
  // prop rather than the flag travelling to the browser — same pattern as
  // the Resume AI page.
  const matchEnabled = featureEnabled("FEATURE_AI") && featureEnabled("FEATURE_JOB_MATCH");

  let page: Awaited<ReturnType<typeof getJobs>> | null = null;
  let failed = false;

  try {
    page = await getJobs(DEMO_QUERY);
  } catch (error) {
    // Server-side only. Sentry picks this up; the client is told nothing.
    console.error("[job-feed] AI Dev Jobs request failed:", error);
    failed = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Feed"
        description="Live results from the AI Dev Jobs public API (q=LLM · remote · 5)."
        count={page?.total}
        countLabel={page && !page.totalIsExact ? "approximate matches" : "matches"}
      />

      {failed ? (
        <ErrorState
          title="Could not reach AI Dev Jobs"
          message="The job board did not respond. This is an external service, so nothing else in the dashboard is affected. Try again shortly."
        />
      ) : page && page.jobs.length === 0 ? (
        <EmptyState
          icon={<Radar />}
          title="No matching jobs"
          description="The API responded successfully with zero results for this query."
        />
      ) : (
        <ul className="space-y-3">
          {page?.jobs.map((job) => (
            <JobCard key={job.id} job={job} matchEnabled={matchEnabled} />
          ))}
        </ul>
      )}

      {/* A non-zero count means their schema moved and rows were discarded.
          Surfaced rather than logged silently, because it is the earliest
          signal that this integration needs attention. */}
      {page && page.droppedCount > 0 ? (
        <p className="text-[11px] text-amber-400/80">
          {page.droppedCount} result{page.droppedCount === 1 ? "" : "s"} were discarded as malformed.
        </p>
      ) : null}
    </div>
  );
}
