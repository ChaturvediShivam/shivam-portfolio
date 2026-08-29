import "server-only";
import {
  listCompanyProviders,
  listJobProviders,
  listMacroProviders,
  listNewsProviders,
  listScholarlyProviders,
  listUnavailableOfKind,
} from "@/lib/research/registry";
import type {
  CompanyRef,
  FinancialFact,
  JobSearchParams,
  NormalizedCompany,
  NormalizedEconomicSeries,
  NormalizedJob,
  NormalizedNewsItem,
  NormalizedScholarlyWork,
  ProviderUnavailable,
  ScholarlySearchParams,
} from "@/lib/research/types";

/**
 * Cross-provider search.
 *
 * The layer the orchestrator and the UI call. It fans out to every available
 * provider, merges, deduplicates and orders — so a caller asks for "remote AI
 * engineer jobs" once and never learns how many boards answered.
 *
 * Two rules make this safe to put in front of third-party services:
 *
 *   1. ONE SLOW OR BROKEN PROVIDER MUST NOT FAIL THE SEARCH. Providers are
 *      settled independently and a rejection is logged and skipped. A partial
 *      result with a named failure beats an error page.
 *   2. NOTHING IS SYNTHESIZED. These are source records merged and sorted.
 *      No model runs here, and no field is inferred that a provider did not
 *      supply — AI analysis happens downstream, against these records.
 */

export interface SearchOutcome<T> {
  readonly results: readonly T[];
  /** Providers that answered successfully. */
  readonly succeeded: readonly string[];
  /** Providers that ran and errored, with a safe reason. Never swallowed. */
  readonly failed: readonly { provider: string; reason: string }[];
  /**
   * Providers that never ran — turned off, or missing a credential.
   *
   * The field that stops "not configured" masquerading as "found nothing".
   * `results: []` with a non-empty `unavailable` means the search did not
   * really happen, and the caller must say so rather than rendering an empty
   * state that implies the market is empty.
   */
  readonly unavailable: readonly ProviderUnavailable[];
}

/**
 * True when the search could not meaningfully run: nothing was available and
 * nothing succeeded. Callers use this to pick "configure a provider" over
 * "no results found".
 */
export function didNotRun<T>(outcome: SearchOutcome<T>): boolean {
  return outcome.succeeded.length === 0 && outcome.failed.length === 0;
}

/** Provider-agnostic message. Adapter errors carry no keys or query content. */
function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : "Provider request failed.";
}

/**
 * Deduplicate across boards.
 *
 * The same role is frequently syndicated to several aggregators, so identity is
 * (company + title) case-folded, falling back to the apply URL. Not perfect —
 * two genuinely distinct openings with one title at one company collapse — but
 * the alternative, showing the operator the same job four times, is the worse
 * failure for a tool whose entire purpose is signal.
 */
function jobKey(job: NormalizedJob): string {
  const company = (job.company ?? "").trim().toLowerCase();
  const title = job.title.trim().toLowerCase();
  if (company && title) return `${company}::${title}`;
  return (job.applyUrl ?? job.provenance.externalId).toLowerCase();
}

function publishedTime(value: string | null): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export async function searchJobsAcrossProviders(
  params: JobSearchParams,
  signal?: AbortSignal,
): Promise<SearchOutcome<NormalizedJob>> {
  const providers = listJobProviders();
  const unavailable = listUnavailableOfKind("job");
  if (providers.length === 0) return { results: [], succeeded: [], failed: [], unavailable };

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.searchJobs(params, signal)),
  );

  const succeeded: string[] = [];
  const failed: { provider: string; reason: string }[] = [];
  const byKey = new Map<string, NormalizedJob>();

  settled.forEach((outcome, index) => {
    const provider = providers[index];
    if (outcome.status === "rejected") {
      console.error(`[research] ${provider.id} job search failed:`, outcome.reason);
      failed.push({ provider: provider.id, reason: reasonFor(outcome.reason) });
      return;
    }
    succeeded.push(provider.id);
    for (const job of outcome.value) {
      const key = jobKey(job);
      const existing = byKey.get(key);
      // On a collision keep the record with more substance: a posting carrying
      // a description and a salary is more useful than a bare duplicate.
      if (!existing || score(job) > score(existing)) byKey.set(key, job);
    }
  });

  const results = [...byKey.values()].sort(
    (a, b) => publishedTime(b.provenance.publishedAt) - publishedTime(a.provenance.publishedAt),
  );

  return { results, succeeded, failed, unavailable };
}

/** Completeness heuristic used only to break duplicate ties. */
function score(job: NormalizedJob): number {
  let points = 0;
  if (job.description) points += 3;
  if (job.salaryMin !== null || job.salaryText) points += 2;
  if (job.company) points += 1;
  if (job.location) points += 1;
  if (job.tags.length > 0) points += 1;
  return points;
}

export async function searchNewsAcrossProviders(
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<SearchOutcome<NormalizedNewsItem>> {
  const providers = listNewsProviders();
  const unavailable = listUnavailableOfKind("news");
  if (providers.length === 0) return { results: [], succeeded: [], failed: [], unavailable };

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.searchNews(query, limit, signal)),
  );

  const succeeded: string[] = [];
  const failed: { provider: string; reason: string }[] = [];
  const byUrl = new Map<string, NormalizedNewsItem>();

  settled.forEach((outcome, index) => {
    const provider = providers[index];
    if (outcome.status === "rejected") {
      console.error(`[research] ${provider.id} news search failed:`, outcome.reason);
      failed.push({ provider: provider.id, reason: reasonFor(outcome.reason) });
      return;
    }
    succeeded.push(provider.id);
    for (const item of outcome.value) {
      const key = (item.provenance.sourceUrl ?? item.provenance.externalId).toLowerCase();
      if (!byUrl.has(key)) byUrl.set(key, item);
    }
  });

  const results = [...byUrl.values()]
    .sort((a, b) => publishedTime(b.provenance.publishedAt) - publishedTime(a.provenance.publishedAt))
    .slice(0, limit);

  return { results, succeeded, failed, unavailable };
}

// --- Companies ---------------------------------------------------------------

/**
 * Resolve a company name or ticker to candidates across company providers.
 *
 * Same partial-failure contract as the job and news searches: a provider that
 * is off or keyless is named in `unavailable`, never folded into an empty
 * result set.
 */
export async function findCompaniesAcrossProviders(
  query: string,
  signal?: AbortSignal,
): Promise<SearchOutcome<CompanyRef>> {
  const providers = listCompanyProviders();
  const unavailable = listUnavailableOfKind("company");
  if (providers.length === 0) return { results: [], succeeded: [], failed: [], unavailable };

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.findCompanies(query, signal)),
  );

  const succeeded: string[] = [];
  const failed: { provider: string; reason: string }[] = [];
  const seen = new Set<string>();
  const results: CompanyRef[] = [];

  settled.forEach((outcome, index) => {
    const provider = providers[index];
    if (outcome.status === "rejected") {
      console.error(`[research] ${provider.id} company search failed:`, outcome.reason);
      failed.push({ provider: provider.id, reason: reasonFor(outcome.reason) });
      return;
    }
    succeeded.push(provider.id);
    for (const ref of outcome.value) {
      // (provider, ref) is the identity — two providers may legitimately hold
      // the same company under different native identifiers.
      const key = `${ref.provider}::${ref.ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(ref);
    }
  });

  return { results, succeeded, failed, unavailable };
}

/** A company profile with the financial facts that back it. */
export interface CompanyDossier {
  readonly company: NormalizedCompany;
  readonly financials: readonly FinancialFact[];
}

/**
 * Fetch one company profile plus its headline financials.
 *
 * Financial failure is tolerated: a profile with no figures is still useful,
 * and an XBRL hiccup should not cost the operator the filings list. Nothing
 * here is synthesized — every figure carries the filing that reported it.
 */
export async function getCompanyDossier(
  providerId: string,
  ref: string,
  signal?: AbortSignal,
): Promise<{ dossier: CompanyDossier | null; unavailable: readonly ProviderUnavailable[] }> {
  const unavailable = listUnavailableOfKind("company");
  const provider = listCompanyProviders().find((p) => p.id === providerId);
  if (!provider) return { dossier: null, unavailable };

  const company = await provider.getCompany(ref, signal);
  if (!company) return { dossier: null, unavailable };

  let financials: readonly FinancialFact[] = [];
  try {
    financials = await provider.getFinancials(ref, undefined, signal);
  } catch (error) {
    console.error(`[research] ${provider.id} financials failed:`, error);
  }

  return { dossier: { company, financials }, unavailable };
}

// --- Macro -------------------------------------------------------------------

/**
 * Fetch one economic series from the first available macro provider.
 *
 * Not a fan-out: economic series are identified by provider-specific codes
 * (FRED's "CPIAUCSL"), so asking every provider for one id would be asking a
 * question only one of them can answer.
 */
export async function getMacroSeries(
  seriesId: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<{
  series: NormalizedEconomicSeries | null;
  failed: readonly { provider: string; reason: string }[];
  unavailable: readonly ProviderUnavailable[];
}> {
  const unavailable = listUnavailableOfKind("macro");
  const [provider] = listMacroProviders();
  if (!provider) return { series: null, failed: [], unavailable };

  try {
    return { series: await provider.getSeries(seriesId, limit, signal), failed: [], unavailable };
  } catch (error) {
    console.error(`[research] ${provider.id} series failed:`, error);
    return {
      series: null,
      failed: [{ provider: provider.id, reason: reasonFor(error) }],
      unavailable,
    };
  }
}

// --- Scholarly ---------------------------------------------------------------

/**
 * Search scholarly works across providers.
 *
 * Same partial-failure and availability contract as every other search: a
 * provider that is off is named in `unavailable`, never folded into an empty
 * result set. Deduplicated by the source's own record id.
 */
export async function searchScholarlyAcrossProviders(
  params: ScholarlySearchParams,
  signal?: AbortSignal,
): Promise<SearchOutcome<NormalizedScholarlyWork>> {
  const providers = listScholarlyProviders();
  const unavailable = listUnavailableOfKind("scholarly");
  if (providers.length === 0) return { results: [], succeeded: [], failed: [], unavailable };

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.searchWorks(params, signal)),
  );

  const succeeded: string[] = [];
  const failed: { provider: string; reason: string }[] = [];
  const byId = new Map<string, NormalizedScholarlyWork>();

  settled.forEach((outcome, index) => {
    const provider = providers[index];
    if (outcome.status === "rejected") {
      console.error(`[research] ${provider.id} scholarly search failed:`, outcome.reason);
      failed.push({ provider: provider.id, reason: reasonFor(outcome.reason) });
      return;
    }
    succeeded.push(provider.id);
    for (const work of outcome.value) {
      const key = work.provenance.externalId.toLowerCase();
      if (!byId.has(key)) byId.set(key, work);
    }
  });

  // Provider relevance order is preserved rather than re-sorted by date or
  // citations: the source ranked these for the query, and re-ranking on a
  // single axis discards that judgement.
  return { results: [...byId.values()], succeeded, failed, unavailable };
}
