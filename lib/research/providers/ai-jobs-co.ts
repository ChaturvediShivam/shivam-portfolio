import "server-only";
import {
  fetchJson,
  isObject,
  isoDate,
  num,
  str,
  strArray,
  ResearchResponseError,
} from "@/lib/research/http";
import type {
  JobProvider,
  JobSearchParams,
  NormalizedJob,
  WorkplaceType,
} from "@/lib/research/types";

/**
 * Artificial Intelligence Jobs (artificialintelligencejobs.co).
 *
 * Live AI/ML listings pulled from ~260 companies' own career pages. Selected
 * over the other no-auth boards in the source list on measured signal quality:
 * 18,947 live postings, and `q=AI engineer&remote=true&region=US` narrows to
 * ~38 roles at frontier-model labs and AI tooling companies. Arbeitnow, the
 * other no-auth option, returned 4 remote roles in 175 and was dominated by
 * duplicated German listings, so it was rejected rather than integrated.
 *
 * No authentication. Verified against the live API before this file was
 * written — the envelope, the filter behaviour and the nullable `salary` below
 * are observed, not assumed.
 */

const BASE = "https://artificialintelligencejobs.co/api/jobs";
const PROVIDER = "ai_jobs_co" as const;

/** Undocumented ceiling; kept low because this is a small free service. */
const RATE_LIMIT_PER_SECOND = 2;

/** The API caps a page well below this, but a bound belongs on our side too. */
const MAX_LIMIT = 50;

/** Listings change slowly; a 10-minute window keeps repeat searches free. */
const REVALIDATE_SECONDS = 600;

/**
 * Their `remote` flag is a boolean and `location` is free text, so a hybrid
 * role is indistinguishable from an onsite one here. Reporting "unknown"
 * instead of guessing "onsite" keeps a downstream filter honest.
 */
function toWorkplace(remote: unknown): WorkplaceType {
  if (remote === true) return "remote";
  if (remote === false) return "unknown";
  return "unknown";
}

/**
 * Salary arrives as display text — "$251K – $335K • Offers Equity" — or null.
 * It is carried verbatim rather than parsed: inventing `salaryMin: 251000` from
 * a string that also mentions equity would manufacture precision the source
 * never offered, and every downstream comparison would inherit the error.
 */
function normalize(raw: unknown, retrievedAt: string): NormalizedJob | null {
  if (!isObject(raw)) return null;

  const title = str(raw.title);
  // The board exposes no stable id, so the canonical URL is the identity. A
  // posting with neither a title nor a URL cannot be shown or deduplicated.
  const url = str(raw.url);
  if (!title || !url) return null;

  return {
    provenance: {
      provider: PROVIDER,
      externalId: url,
      sourceUrl: url,
      retrievedAt,
      publishedAt: isoDate(raw.posted),
    },
    title,
    company: str(raw.company),
    location: str(raw.location),
    workplace: toWorkplace(raw.remote),
    // The list endpoint returns no description; the detail page is HTML only.
    description: null,
    applyUrl: str(raw.apply_url) ?? url,
    tags: strArray(raw.category ? [raw.category] : []),
    experienceLevel: str(raw.level),
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryText: str(raw.salary),
  };
}

async function searchJobs(
  params: JobSearchParams,
  signal?: AbortSignal,
): Promise<NormalizedJob[]> {
  const url = new URL(BASE);
  const set = (key: string, value: string | null) => {
    if (value) url.searchParams.set(key, value);
  };

  set("q", str(params.query));
  set("level", str(params.level));
  set("region", str(params.location));
  if (params.remoteOnly === true) url.searchParams.set("remote", "true");

  const limit = num(params.limit);
  url.searchParams.set("limit", String(Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? 20)))));

  const page = num(params.page);
  if (page !== null && page > 1) {
    // The API paginates by offset, not page number.
    const size = Number(url.searchParams.get("limit"));
    url.searchParams.set("offset", String(Math.trunc(page - 1) * size));
  }

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url,
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: REVALIDATE_SECONDS,
  });

  if (!isObject(body) || !Array.isArray(body.jobs)) {
    throw new ResearchResponseError(PROVIDER, 'Response is missing a "jobs" array.');
  }

  const retrievedAt = new Date().toISOString();
  const out: NormalizedJob[] = [];
  for (const row of body.jobs) {
    const job = normalize(row, retrievedAt);
    // One malformed row must not cost the caller the rest of the page.
    if (job) out.push(job);
  }
  return out;
}

export const aiJobsCoProvider: JobProvider = {
  kind: "job",
  id: PROVIDER,
  displayName: "Artificial Intelligence Jobs",
  // No credential to check: the public endpoints are open.
  configured: true,
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  searchJobs,
};

/** Exported for tests. */
export const __testing = { normalize };
