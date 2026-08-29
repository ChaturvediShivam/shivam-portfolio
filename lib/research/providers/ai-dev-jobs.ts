import "server-only";
import { getJobs, type AiDevBoardJob } from "@/lib/integrations/aidevboard/client";
import type {
  JobProvider,
  JobSearchParams,
  NormalizedJob,
  WorkplaceType,
} from "@/lib/research/types";

/**
 * AI Dev Jobs, as a research provider.
 *
 * A thin adapter over the Phase 1 client, which is NOT modified. Phase 1 is
 * verified, shipped and independently tested; the way to bring it under a new
 * abstraction without risking it is to wrap it, not to rewrite it. The Job Feed
 * and Job Match still call the Phase 1 client directly and are unaffected by
 * anything in this file.
 *
 * This is what makes the multi-provider architecture real rather than
 * theoretical: two boards with different envelopes, different field names and
 * different salary conventions both arrive at `NormalizedJob`, and the caller
 * cannot tell which produced which.
 */

const PROVIDER = "aidevboard" as const;

/** Phase 1's client sets its own cache window; this is for the shared limiter. */
const RATE_LIMIT_PER_SECOND = 4;

function toWorkplace(value: string | null): WorkplaceType {
  switch ((value ?? "").toLowerCase()) {
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    case "onsite":
    case "on-site":
      return "onsite";
    default:
      return "unknown";
  }
}

/**
 * Unlike AI Jobs, this board publishes integer salary bounds, so the numeric
 * fields are populated and `salaryText` stays null. Both providers are honest
 * about what their source actually gave — that asymmetry is the point.
 */
function normalize(job: AiDevBoardJob, retrievedAt: string): NormalizedJob {
  return {
    provenance: {
      provider: PROVIDER,
      externalId: job.id,
      sourceUrl: job.url || null,
      retrievedAt,
      publishedAt: job.published_at,
    },
    title: job.title,
    company: job.company_name,
    location: job.location,
    workplace: toWorkplace(job.workplace),
    description: job.description,
    applyUrl: job.apply_url ?? job.url ?? null,
    tags: job.tags,
    experienceLevel: job.experience_level,
    employmentType: job.job_type,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    salaryText: null,
  };
}

async function searchJobs(
  params: JobSearchParams,
  signal?: AbortSignal,
): Promise<NormalizedJob[]> {
  const page = await getJobs(
    {
      q: params.query,
      workplace: params.remoteOnly === true ? "remote" : undefined,
      location: params.location,
      level: params.level,
      limit: params.limit,
      page: params.page,
    },
    { signal },
  );

  const retrievedAt = new Date().toISOString();
  return page.jobs.map((job) => normalize(job, retrievedAt));
}

export const aiDevJobsProvider: JobProvider = {
  kind: "job",
  id: PROVIDER,
  displayName: "AI Dev Jobs",
  configured: true,
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  searchJobs,
};

/** Exported for tests. */
export const __testing = { normalize };
