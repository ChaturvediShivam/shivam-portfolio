/**
 * Research provider contracts (Master API phase).
 *
 * The vocabulary every external research source normalizes into. Interfaces
 * only: nothing here imports a provider, and no provider type leaks upward.
 *
 *   research orchestrator -> depends on -> these contracts
 *   AI Jobs / SEC / Noozra -> implement -> these contracts
 *
 * Relationship to `lib/career-intelligence/providers/types.ts`, which already
 * defines `ImportProvider` and `NormalizedApplication`: that layer ingests
 * applications the candidate has ALREADY made — it is opportunity-shaped
 * (stageHint, appliedAt, contacts, documents). This layer searches the outside
 * world and returns things nobody has acted on yet. A posting on a job board
 * and an application in a pipeline are genuinely different entities, so they
 * get different types rather than one type with half its fields always null.
 * `lib/research/bridge.ts` is the one place that converts between them, which
 * is what keeps them from drifting into duplicates.
 *
 * The separation the whole design turns on:
 *
 *   SOURCE FACTS (here)  ≠  MODEL SYNTHESIS  ≠  HUMAN DECISION
 *
 * Nothing in this file is ever produced by a model. These are records of what
 * an external source actually said, and AI analysis attaches to them by
 * provenance rather than overwriting them.
 */

/** Providers implemented in this phase. Extended as adapters are added. */
export const RESEARCH_PROVIDER_IDS = [
  // Open providers — no credential, live-verified.
  "aidevboard",
  "ai_jobs_co",
  "sec_edgar",
  "noozra",
  // Credential-gated providers. The adapter exists and is tested against
  // mocks; it reports `configured: false` and is withheld from the registry
  // until its key is present, so an unconfigured provider can never be
  // mistaken for one that found nothing.
  "adzuna",
  "usajobs",
  "fred",
  "gnews",
  // Open provider — no credential of any kind; live-verified.
  "openalex",
] as const;
export type ResearchProviderId = (typeof RESEARCH_PROVIDER_IDS)[number];

/**
 * Where a record came from and when.
 *
 * Attached to every normalized entity, not stored alongside it optionally.
 * A research system whose records cannot be traced back to a source and a
 * timestamp produces claims, not evidence.
 */
export interface Provenance {
  readonly provider: ResearchProviderId;
  /** Stable id at the provider. With `provider`, the deduplication key. */
  readonly externalId: string;
  /** Canonical human-viewable URL for the record, when the source offers one. */
  readonly sourceUrl: string | null;
  /** When we retrieved it. ISO 8601. */
  readonly retrievedAt: string;
  /** When the source says it was published. ISO 8601, or null if unstated. */
  readonly publishedAt: string | null;
}

// --- Jobs --------------------------------------------------------------------

/** Workplace arrangement, normalized across boards that each name it differently. */
export type WorkplaceType = "remote" | "hybrid" | "onsite" | "unknown";

/**
 * A job posting from any board.
 *
 * `salaryText` is a string, not a number pair, because that is what the sources
 * actually publish: AI Jobs returns "$251K – $335K • Offers Equity" and AI Dev
 * Jobs returns integer bounds. Both are preserved honestly — the numeric fields
 * are filled only when the source gave numbers, and `salaryText` carries the
 * rest verbatim rather than being parsed into false precision.
 */
export interface NormalizedJob {
  readonly provenance: Provenance;
  readonly title: string;
  readonly company: string | null;
  readonly location: string | null;
  readonly workplace: WorkplaceType;
  readonly description: string | null;
  readonly applyUrl: string | null;
  readonly tags: readonly string[];
  /** Seniority as the source labelled it. Never inferred here. */
  readonly experienceLevel: string | null;
  readonly employmentType: string | null;
  readonly salaryMin: number | null;
  readonly salaryMax: number | null;
  /** The source's own salary wording, when it is not expressible as numbers. */
  readonly salaryText: string | null;
}

export interface JobSearchParams {
  readonly query?: string;
  readonly remoteOnly?: boolean;
  readonly location?: string;
  readonly level?: string;
  readonly limit?: number;
  readonly page?: number;
}

// --- Companies ---------------------------------------------------------------

/** One filing or disclosure document. */
export interface CompanyFiling {
  readonly form: string;
  readonly filedAt: string;
  readonly reportDate: string | null;
  readonly accessionNumber: string;
  readonly documentUrl: string | null;
}

/** One reported financial figure, tied to the filing that reported it. */
export interface FinancialFact {
  readonly metric: string;
  readonly label: string | null;
  readonly value: number;
  readonly unit: string;
  readonly periodStart: string | null;
  readonly periodEnd: string;
  readonly fiscalYear: number | null;
  readonly fiscalPeriod: string | null;
  readonly form: string | null;
  readonly filedAt: string | null;
}

export interface NormalizedCompany {
  readonly provenance: Provenance;
  readonly name: string;
  readonly tickers: readonly string[];
  readonly exchanges: readonly string[];
  /** Standard Industrial Classification — the industry, per the regulator. */
  readonly sic: string | null;
  readonly sicDescription: string | null;
  readonly entityType: string | null;
  readonly stateOfIncorporation: string | null;
  readonly website: string | null;
  readonly recentFilings: readonly CompanyFiling[];
}

// --- News --------------------------------------------------------------------

export interface NormalizedNewsItem {
  readonly provenance: Provenance;
  readonly headline: string;
  readonly summary: string | null;
  /** The outlet that published it, e.g. "AI Business". Never the aggregator. */
  readonly source: string | null;
  readonly category: string | null;
  readonly imageUrl: string | null;
}

// --- People ------------------------------------------------------------------

/**
 * A person associated with an opportunity.
 *
 * Declared, deliberately unimplemented. Every people-search provider in the
 * source list (HeroHunt, Village, Tomba) is key-gated and paid, and scraping
 * LinkedIn is out of scope. Declaring the contract now is what lets a keyed
 * adapter be added later without the orchestrator changing; implementing a
 * speculative adapter against a response shape nobody has seen would not.
 */
export interface NormalizedPerson {
  readonly provenance: Provenance;
  readonly fullName: string;
  readonly title: string | null;
  readonly company: string | null;
  readonly location: string | null;
  readonly profileUrls: readonly string[];
}

// --- Provider contracts ------------------------------------------------------

/** What a provider costs to call, so the orchestrator can budget and order. */
export interface ProviderMeta {
  readonly id: ResearchProviderId;
  readonly displayName: string;
  /** False when the provider needs a key that is not configured. */
  readonly configured: boolean;
  /** Documented ceiling, requests per second. Enforced by the shared client. */
  readonly rateLimitPerSecond: number;
}

export interface JobProvider extends ProviderMeta {
  readonly kind: "job";
  searchJobs(params: JobSearchParams, signal?: AbortSignal): Promise<NormalizedJob[]>;
}

export interface CompanyProvider extends ProviderMeta {
  readonly kind: "company";
  /** Resolve a name or ticker to candidate companies. */
  findCompanies(query: string, signal?: AbortSignal): Promise<CompanyRef[]>;
  getCompany(ref: string, signal?: AbortSignal): Promise<NormalizedCompany | null>;
  getFinancials(ref: string, metrics?: readonly string[], signal?: AbortSignal): Promise<FinancialFact[]>;
}

/** A lightweight company handle returned by search, before the full fetch. */
export interface CompanyRef {
  readonly provider: ResearchProviderId;
  /** Provider-native identifier (a CIK for SEC). Passed back to `getCompany`. */
  readonly ref: string;
  readonly name: string;
  readonly ticker: string | null;
}

export interface NewsProvider extends ProviderMeta {
  readonly kind: "news";
  searchNews(query: string, limit?: number, signal?: AbortSignal): Promise<NormalizedNewsItem[]>;
}

/** Declared for the seam; no implementation ships in this phase. */
export interface PeopleProvider extends ProviderMeta {
  readonly kind: "people";
  searchPeople(query: string, limit?: number, signal?: AbortSignal): Promise<NormalizedPerson[]>;
}

// --- Economic / macro --------------------------------------------------------

/** One observation in an economic time series. */
export interface EconomicObservation {
  /** ISO date of the observation period. */
  readonly date: string;
  /** Null when the source reports the period as unavailable (FRED sends "."). */
  readonly value: number | null;
}

/**
 * A named economic indicator over time — CPI, GDP, unemployment.
 *
 * Company-level financials live in `FinancialFact`; this is the macro context
 * a market or industry brief needs, which no company filing supplies.
 */
export interface NormalizedEconomicSeries {
  readonly provenance: Provenance;
  readonly seriesId: string;
  readonly title: string | null;
  readonly units: string | null;
  readonly frequency: string | null;
  readonly observations: readonly EconomicObservation[];
}

export interface MacroProvider extends ProviderMeta {
  readonly kind: "macro";
  getSeries(seriesId: string, limit?: number, signal?: AbortSignal): Promise<NormalizedEconomicSeries | null>;
}

// --- Scholarly research ------------------------------------------------------

/**
 * One scholarly work — a paper, preprint or dataset.
 *
 * Answers "who is actually doing the work in this area?", which no job board,
 * filing or news feed can. Authors and institutions are the point: they turn a
 * topic into named people and organisations for a research or competitive
 * brief.
 *
 * Every field is one the source actually returns. Nothing about a company's
 * finances, hiring or products is inferred from a publication.
 */
export interface NormalizedScholarlyWork {
  readonly provenance: Provenance;
  readonly title: string;
  /** Author display names, in the order the source lists them. */
  readonly authors: readonly string[];
  /** Distinct affiliated institutions across all authors. */
  readonly institutions: readonly string[];
  /** Journal, conference or repository, when the source names one. */
  readonly venue: string | null;
  readonly publicationYear: number | null;
  /** Citation count as reported. A popularity signal, never a quality claim. */
  readonly citedByCount: number | null;
  /** Subject topics/keywords as labelled by the source. */
  readonly topics: readonly string[];
  readonly doi: string | null;
  /** Free full-text URL when the work is open access. */
  readonly openAccessUrl: string | null;
  /** Work type as the source classifies it: article, preprint, dataset… */
  readonly workType: string | null;
  /** Abstract, when the source supplies one. Never model-generated. */
  readonly abstract: string | null;
}

export interface ScholarlySearchParams {
  readonly query?: string;
  /** ISO date lower bound on publication. */
  readonly fromDate?: string;
  readonly limit?: number;
  readonly page?: number;
}

export interface ScholarlyProvider extends ProviderMeta {
  readonly kind: "scholarly";
  searchWorks(
    params: ScholarlySearchParams,
    signal?: AbortSignal,
  ): Promise<NormalizedScholarlyWork[]>;
}

/**
 * Why a provider is not usable right now.
 *
 * The distinction the UI must never collapse: a provider the operator turned
 * off, a provider missing its key, and a provider that ran and found nothing
 * are three different answers. Reporting all three as "no results" is what
 * section 3 forbids, and what `SearchOutcome.unavailable` exists to prevent.
 */
export type UnavailableReason = "disabled" | "unconfigured";

export interface ProviderUnavailable {
  readonly provider: ResearchProviderId;
  readonly displayName: string;
  readonly reason: UnavailableReason;
  /** Which flag to turn on, or which variable to set. */
  readonly remedy: string;
}

export type AnyResearchProvider =
  | JobProvider
  | CompanyProvider
  | NewsProvider
  | PeopleProvider
  | MacroProvider
  | ScholarlyProvider;
