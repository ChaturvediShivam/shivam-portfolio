/**
 * Career Intelligence — import provider contracts (Phase 1).
 *
 * Interfaces only. No provider is implemented here, and nothing in this file
 * imports a provider SDK. Phase 2+ adds implementations (Gmail, LinkedIn,
 * Naukri, Indeed, Monster, the Chrome extension, company portals) by satisfying
 * these contracts and registering them — business logic never changes.
 *
 * The inversion that makes that possible:
 *
 *   ingestion pipeline  ->  depends on  ->  ImportProvider (this file)
 *   Gmail / LinkedIn / … ->  implement  ->  ImportProvider
 *
 * A provider's only job is to produce `NormalizedApplication` values. It never
 * touches Supabase, never knows a table name, and never decides whether a row
 * is new — the pipeline owns persistence and dedup, so a new provider cannot
 * introduce a new write path.
 */

import type { DocumentKind } from "@/types/career-intelligence";

/**
 * Provider identity. Mirrors the `integration_provider` Postgres enum; a value
 * here must exist there before rows can reference it.
 */
export const PROVIDER_IDS = [
  "gmail",
  "linkedin",
  "wellfound",
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "indeed",
  "naukri",
  "monster",
  "referral",
  "extension",
  "company_portal",
  "manual",
  "manual_import",
  "other",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * What a provider can do. The pipeline branches on capabilities rather than on
 * provider identity, so `if (provider.id === "gmail")` never needs to be
 * written anywhere.
 */
export interface ProviderCapabilities {
  /** Can be polled for new records (pull). */
  readonly pull: boolean;
  /** Delivers records to us unprompted (push/webhook/extension). */
  readonly push: boolean;
  /** Supports incremental sync via an opaque cursor. */
  readonly incremental: boolean;
  /** Can supply documents (resume copies, JD exports, offer letters). */
  readonly documents: boolean;
  /** Can supply recruiter/contact details. */
  readonly contacts: boolean;
}

/**
 * An untyped record exactly as the provider returned it. Persisted verbatim on
 * the ingested row's `metadata.raw` so a mapping bug can be replayed without
 * re-fetching from the provider.
 */
export interface RawImportRecord {
  /** Provider-side stable id; the dedup key together with `providerId`. */
  readonly externalId: string;
  readonly providerId: ProviderId;
  readonly payload: unknown;
  readonly fetchedAt: string;
}

/** A company as a provider sees it, before matching to a `companies` row. */
export interface NormalizedCompany {
  readonly name: string;
  readonly domain?: string | null;
  readonly website?: string | null;
  readonly linkedinUrl?: string | null;
  readonly careersUrl?: string | null;
  readonly externalIds?: Record<string, string>;
}

/** A person as a provider sees it, before matching to a `contacts` row. */
export interface NormalizedContact {
  readonly fullName: string;
  readonly email?: string | null;
  readonly title?: string | null;
  readonly linkedinUrl?: string | null;
  /** Role on this application: recruiter, hiring_manager, referral, … */
  readonly role?: string | null;
  readonly externalIds?: Record<string, string>;
}

export interface NormalizedDocument {
  readonly kind: DocumentKind;
  readonly title: string;
  readonly fileUrl?: string | null;
  readonly fileName?: string | null;
  readonly mimeType?: string | null;
  readonly contentText?: string | null;
  readonly externalId?: string | null;
}

/**
 * The single shape every provider must produce. Field names are domain terms,
 * deliberately not any one provider's vocabulary.
 *
 * Everything is optional except what is needed to create an `opportunities`
 * row, because real-world sources are partial: a job-board scrape has no
 * recruiter, an email has no salary. The pipeline fills gaps and resolves
 * `company`/`contacts` to existing rows.
 */
export interface NormalizedApplication {
  readonly externalId: string;
  readonly providerId: ProviderId;
  /** Role title — the only genuinely required field. */
  readonly title: string;
  readonly company?: NormalizedCompany | null;
  readonly contacts?: readonly NormalizedContact[];
  readonly documents?: readonly NormalizedDocument[];
  readonly jobUrl?: string | null;
  readonly location?: string | null;
  readonly locationType?: "remote" | "hybrid" | "onsite" | null;
  readonly employmentType?: string | null;
  readonly salaryMin?: number | null;
  readonly salaryMax?: number | null;
  readonly salaryCurrency?: string | null;
  readonly appliedAt?: string | null;
  readonly deadlineAt?: string | null;
  /**
   * Suggested stage. The pipeline treats this as a hint: it will not move an
   * opportunity backwards in the pipeline on re-import.
   */
  readonly stageHint?: string | null;
  readonly description?: string | null;
  /** Provider fields with no domain equivalent; merged into `metadata`. */
  readonly extra?: Record<string, unknown>;
  /** The untouched source record, retained for replay. */
  readonly raw: RawImportRecord;
}

/** Opaque provider cursor for incremental sync (Gmail historyId, page token…). */
export type SyncCursor = string;

export interface ImportContext {
  /** Which connected account to read from (`integration_accounts.id`). */
  readonly integrationAccountId: string;
  /** Resume point from the previous run; absent on a first sync. */
  readonly cursor?: SyncCursor | null;
  /** Lower bound when no cursor exists. */
  readonly since?: string | null;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface ImportBatch {
  readonly records: readonly NormalizedApplication[];
  /** Persist to `integration_accounts.sync_cursor` to resume next run. */
  readonly nextCursor?: SyncCursor | null;
  readonly hasMore: boolean;
}

/**
 * Base contract. Every provider is at minimum able to turn one raw record into
 * a normalized application.
 */
export interface ImportProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  /**
   * Map one provider record onto the domain shape. Pure: no I/O, no database
   * access, so it is trivially testable against a captured fixture.
   */
  normalize(raw: RawImportRecord): NormalizedApplication;
}

/** A provider the scheduler can poll. Backs Gmail, job boards and ATSs. */
export interface PullProvider extends ImportProvider {
  fetch(context: ImportContext): Promise<ImportBatch>;
}

/**
 * A provider that delivers to us. The Chrome extension and any future webhook
 * source implement this; `verify` is the trust boundary and must authenticate
 * the payload before it is normalized.
 */
export interface PushProvider extends ImportProvider {
  verify(request: Request): Promise<boolean>;
  accept(payload: unknown): Promise<readonly RawImportRecord[]>;
}

/** Mailbox-shaped sources (Gmail today; IMAP/Outlook later). */
export interface EmailProvider extends PullProvider {
  readonly capabilities: ProviderCapabilities & { readonly pull: true };
  /** Messages belonging to one provider thread, for conversation rollups. */
  fetchThread(threadId: string, context: ImportContext): Promise<ImportBatch>;
}

/** Posting-shaped sources: LinkedIn, Naukri, Indeed, Monster, career portals. */
export interface JobBoardProvider extends PullProvider {
  /** Fetch a single posting by its provider id or URL. */
  fetchPosting(reference: string, context: ImportContext): Promise<NormalizedApplication | null>;
}

/** Browser extension source; push-only by nature. */
export interface ExtensionProvider extends PushProvider {
  readonly capabilities: ProviderCapabilities & { readonly push: true };
}

/**
 * LinkedIn is a job board that can also surface recruiter conversations, so it
 * is the intersection rather than a special case in the pipeline.
 */
export interface LinkedInProvider extends JobBoardProvider {
  fetchRecruiterThread(threadId: string, context: ImportContext): Promise<ImportBatch>;
}

export type AnyImportProvider =
  | ImportProvider
  | PullProvider
  | PushProvider
  | EmailProvider
  | JobBoardProvider
  | ExtensionProvider
  | LinkedInProvider;

export function isPullProvider(p: AnyImportProvider): p is PullProvider {
  return p.capabilities.pull && typeof (p as PullProvider).fetch === "function";
}

export function isPushProvider(p: AnyImportProvider): p is PushProvider {
  return p.capabilities.push && typeof (p as PushProvider).accept === "function";
}
