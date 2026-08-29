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
 * USAJOBS — the US federal government job board.
 *
 * CREDENTIAL-GATED. Needs `USAJOBS_API_KEY` (free, issued by developer.usajobs.gov)
 * and `USAJOBS_USER_AGENT`, which must be the email address registered with that
 * key — USAJOBS uses it to identify the caller, exactly as SEC EDGAR does. Like
 * SEC, this provider REFUSES to call rather than send a fabricated address.
 *
 * Included because it covers a segment no commercial aggregator does: federal
 * research, analyst and data roles, which sit squarely in the research and
 * intelligence half of the candidate's positioning.
 *
 * VERIFICATION STATUS: the endpoint was confirmed reachable and gated (an
 * unauthenticated request returns 403 Access Denied). The success shape is
 * written from the published contract and has NOT been observed live. USAJOBS
 * nests deeply (`SearchResult.SearchResultItems[].MatchedObjectDescriptor`) and
 * returns most numbers as strings, so every read here goes through a narrowing
 * helper. Treat the mapping as unconfirmed until a key exists.
 */

const BASE = "https://data.usajobs.gov/api/search";
const PROVIDER = "usajobs" as const;

const RATE_LIMIT_PER_SECOND = 2;
const MAX_LIMIT = 50;
const REVALIDATE_SECONDS = 900;

function credentials(): { apiKey: string; userAgent: string } {
  const apiKey = str(process.env.USAJOBS_API_KEY);
  const userAgent = str(process.env.USAJOBS_USER_AGENT);
  if (!apiKey || !userAgent) {
    throw new ResearchUnconfiguredError(PROVIDER, "USAJOBS_API_KEY and USAJOBS_USER_AGENT");
  }
  return { apiKey, userAgent };
}

/**
 * `RemoteIndicator` is a real boolean in the USAJOBS contract, so remote can be
 * asserted. Its absence means the posting did not say — "unknown", not onsite.
 */
function toWorkplace(descriptor: Record<string, unknown>): WorkplaceType {
  const remote = descriptor.RemoteIndicator;
  if (remote === true) return "remote";
  if (remote === false) return "unknown";
  return "unknown";
}

/** Pay is nested under PositionRemuneration[] and arrives as numeric strings. */
function readPay(descriptor: Record<string, unknown>): {
  min: number | null;
  max: number | null;
  text: string | null;
} {
  const list = descriptor.PositionRemuneration;
  if (!Array.isArray(list) || list.length === 0) return { min: null, max: null, text: null };
  const first = list[0];
  if (!isObject(first)) return { min: null, max: null, text: null };

  const min = num(first.MinimumRange);
  const max = num(first.MaximumRange);
  const interval = str(first.RateIntervalCode);

  // A federal "per hour" or "per year" band is meaningful only with its
  // interval, so the interval is preserved rather than dropped into a bare pair.
  return {
    min,
    max,
    text: interval && (min !== null || max !== null) ? `${min ?? "?"}–${max ?? "?"} ${interval}` : null,
  };
}

function normalize(raw: unknown, retrievedAt: string): NormalizedJob | null {
  if (!isObject(raw)) return null;
  const descriptor = isObject(raw.MatchedObjectDescriptor) ? raw.MatchedObjectDescriptor : null;
  if (!descriptor) return null;

  const title = str(descriptor.PositionTitle);
  const id = str(raw.MatchedObjectId) ?? str(descriptor.PositionID);
  if (!title || !id) return null;

  const locations = Array.isArray(descriptor.PositionLocation)
    ? descriptor.PositionLocation.map((l) => (isObject(l) ? str(l.LocationName) : null)).filter(
        (v): v is string => v !== null,
      )
    : [];

  const details = isObject(descriptor.UserArea) && isObject(descriptor.UserArea.Details)
    ? descriptor.UserArea.Details
    : null;

  const pay = readPay(descriptor);

  return {
    provenance: {
      provider: PROVIDER,
      externalId: id,
      sourceUrl: str(descriptor.PositionURI),
      retrievedAt,
      publishedAt: isoDate(descriptor.PublicationStartDate),
    },
    title,
    company: str(descriptor.OrganizationName) ?? str(descriptor.DepartmentName),
    location: locations.length > 0 ? locations.join("; ") : null,
    workplace: toWorkplace(descriptor),
    description: str(descriptor.QualificationSummary) ?? (details ? str(details.JobSummary) : null),
    applyUrl: str(descriptor.ApplyURI) ?? str(descriptor.PositionURI),
    tags: strArray(descriptor.JobCategory as unknown[] | undefined)
      .concat(
        Array.isArray(descriptor.JobCategory)
          ? descriptor.JobCategory.map((c) => (isObject(c) ? str(c.Name) : null)).filter(
              (v): v is string => v !== null,
            )
          : [],
      )
      .slice(0, 8),
    experienceLevel: details ? str(details.LowGrade) : null,
    employmentType: Array.isArray(descriptor.PositionSchedule)
      ? (isObject(descriptor.PositionSchedule[0]) ? str(descriptor.PositionSchedule[0].Name) : null)
      : null,
    salaryMin: pay.min,
    salaryMax: pay.max,
    salaryText: pay.text,
  };
}

async function searchJobs(
  params: JobSearchParams,
  signal?: AbortSignal,
): Promise<NormalizedJob[]> {
  const { apiKey, userAgent } = credentials();

  const url = new URL(BASE);
  const query = str(params.query);
  if (query) url.searchParams.set("Keyword", query);
  const where = str(params.location);
  if (where) url.searchParams.set("LocationName", where);
  if (params.remoteOnly === true) url.searchParams.set("RemoteIndicator", "True");

  url.searchParams.set(
    "ResultsPerPage",
    String(Math.min(MAX_LIMIT, Math.max(1, Math.trunc(num(params.limit) ?? 20)))),
  );
  const page = num(params.page);
  if (page !== null && page > 1) url.searchParams.set("Page", String(Math.trunc(page)));

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url,
    // The key travels in a header, never the query string — a URL with a
    // credential in it ends up in logs, proxies and browser history.
    headers: { "Authorization-Key": apiKey, "User-Agent": userAgent, Host: "data.usajobs.gov" },
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: REVALIDATE_SECONDS,
  });

  const result = isObject(body) && isObject(body.SearchResult) ? body.SearchResult : null;
  if (!result || !Array.isArray(result.SearchResultItems)) {
    throw new ResearchResponseError(PROVIDER, "Response is missing SearchResult.SearchResultItems.");
  }

  const retrievedAt = new Date().toISOString();
  const out: NormalizedJob[] = [];
  for (const row of result.SearchResultItems) {
    const job = normalize(row, retrievedAt);
    if (job) out.push(job);
  }
  return out;
}

export const usaJobsProvider: JobProvider = {
  kind: "job",
  id: PROVIDER,
  displayName: "USAJOBS",
  get configured() {
    return str(process.env.USAJOBS_API_KEY) !== null && str(process.env.USAJOBS_USER_AGENT) !== null;
  },
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  searchJobs,
};

/** Exported for tests. */
export const __testing = { normalize };
