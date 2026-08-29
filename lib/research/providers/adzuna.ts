import "server-only";
import {
  fetchJson,
  isObject,
  isoDate,
  num,
  str,
  strArray,
  ResearchResponseError,
  ResearchUnconfiguredError,
} from "@/lib/research/http";
import type {
  JobProvider,
  JobSearchParams,
  NormalizedJob,
  WorkplaceType,
} from "@/lib/research/types";

/**
 * Adzuna — job aggregator with structured salary data.
 *
 * CREDENTIAL-GATED. Needs `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` (free tier
 * available at developer.adzuna.com). Until both are set the provider reports
 * `configured: false`, the registry withholds it, and the search layer names it
 * in `unavailable` — it is never silently counted as "found nothing".
 *
 * Chosen among the keyed job boards because it supplies what the open providers
 * do not: normalized NUMERIC salary bounds (`salary_min`/`salary_max`) plus
 * `salary_is_predicted`, which lets a downstream comparison distinguish a stated
 * salary from Adzuna's own estimate.
 *
 * VERIFICATION STATUS: the endpoint was confirmed reachable and key-gated
 * (unauthenticated request returns 400), but the SUCCESS response shape has not
 * been observed — no key was available. The normalizer is written against
 * Adzuna's published contract and is defensive throughout: every field is read
 * through a narrowing helper, so an unexpected shape yields nulls or a dropped
 * row rather than a crash. Treat the field mapping as unconfirmed until a key
 * exists and the live shape is checked.
 */

const BASE = "https://api.adzuna.com/v1/api/jobs";
const PROVIDER = "adzuna" as const;

/** Free tier is documented at 25 calls/minute; well under 1/s. */
const RATE_LIMIT_PER_SECOND = 1;

const MAX_LIMIT = 50;
const REVALIDATE_SECONDS = 600;

/** Adzuna partitions by country; a search must name one. */
const DEFAULT_COUNTRY = "us";

function credentials(): { appId: string; appKey: string } {
  const appId = str(process.env.ADZUNA_APP_ID);
  const appKey = str(process.env.ADZUNA_APP_KEY);
  // Fail closed and loudly. Calling without credentials would return a 400 that
  // looks like a bad query rather than a configuration problem.
  if (!appId || !appKey) {
    throw new ResearchUnconfiguredError(PROVIDER, "ADZUNA_APP_ID and ADZUNA_APP_KEY");
  }
  return { appId, appKey };
}

/**
 * Adzuna has no workplace field. `contract_time` describes hours, not location,
 * so workplace is always "unknown" here rather than guessed from the title —
 * a remote-sounding title is not a remote role.
 */
function toWorkplace(): WorkplaceType {
  return "unknown";
}

function normalize(raw: unknown, retrievedAt: string): NormalizedJob | null {
  if (!isObject(raw)) return null;

  const id = str(raw.id);
  const title = str(raw.title);
  if (!id || !title) return null;

  const company = isObject(raw.company) ? str(raw.company.display_name) : null;
  const location = isObject(raw.location) ? str(raw.location.display_name) : null;
  const category = isObject(raw.category) ? str(raw.category.label) : null;

  const min = num(raw.salary_min);
  const max = num(raw.salary_max);
  // `salary_is_predicted` arrives as "1"/"0". A predicted figure is Adzuna's
  // model output, not the employer's statement, so it is labelled rather than
  // presented as a stated salary.
  const predicted = str(raw.salary_is_predicted) === "1" || raw.salary_is_predicted === true;

  return {
    provenance: {
      provider: PROVIDER,
      externalId: id,
      sourceUrl: str(raw.redirect_url),
      retrievedAt,
      publishedAt: isoDate(raw.created),
    },
    title,
    company,
    location,
    workplace: toWorkplace(),
    description: str(raw.description),
    applyUrl: str(raw.redirect_url),
    tags: strArray(category ? [category] : []),
    experienceLevel: null,
    employmentType: str(raw.contract_time) ?? str(raw.contract_type),
    salaryMin: predicted ? null : min,
    salaryMax: predicted ? null : max,
    salaryText: predicted && (min !== null || max !== null) ? `${min ?? "?"}–${max ?? "?"} (estimated)` : null,
  };
}

async function searchJobs(
  params: JobSearchParams,
  signal?: AbortSignal,
): Promise<NormalizedJob[]> {
  const { appId, appKey } = credentials();

  const page = Math.max(1, Math.trunc(num(params.page) ?? 1));
  const country = (str(process.env.ADZUNA_COUNTRY) ?? DEFAULT_COUNTRY).toLowerCase();
  const url = new URL(`${BASE}/${encodeURIComponent(country)}/search/${page}`);

  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set(
    "results_per_page",
    String(Math.min(MAX_LIMIT, Math.max(1, Math.trunc(num(params.limit) ?? 20)))),
  );

  const query = str(params.query);
  if (query) url.searchParams.set("what", query);
  const where = str(params.location);
  if (where) url.searchParams.set("where", where);
  // Adzuna models remote as a keyword, not a filter. Adding it to `what` is
  // the documented approach; it is a hint, so results are not asserted remote.
  if (params.remoteOnly === true) {
    url.searchParams.set("what", `${query ?? ""} remote`.trim());
  }

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url,
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: REVALIDATE_SECONDS,
  });

  if (!isObject(body) || !Array.isArray(body.results)) {
    throw new ResearchResponseError(PROVIDER, 'Response is missing a "results" array.');
  }

  const retrievedAt = new Date().toISOString();
  const out: NormalizedJob[] = [];
  for (const row of body.results) {
    const job = normalize(row, retrievedAt);
    if (job) out.push(job);
  }
  return out;
}

export const adzunaProvider: JobProvider = {
  kind: "job",
  id: PROVIDER,
  displayName: "Adzuna",
  get configured() {
    return str(process.env.ADZUNA_APP_ID) !== null && str(process.env.ADZUNA_APP_KEY) !== null;
  },
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  searchJobs,
};

/** Exported for tests. */
export const __testing = { normalize };
