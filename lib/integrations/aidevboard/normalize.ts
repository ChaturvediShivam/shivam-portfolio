/**
 * AI Dev Jobs → domain normalization.
 *
 * The seam between "their vocabulary" and "ours". `client.ts` speaks the API's
 * language; everything downstream (Supabase, matching, Claude) speaks
 * `NormalizedApplication`, which `lib/career-intelligence/providers/types.ts`
 * already defines. Nothing else in the app should ever see an `AiDevBoardJob`.
 *
 * Pure by contract — no I/O, no database, no clock of its own (`fetchedAt` is
 * passed in). That is what makes it testable against a captured fixture, and it
 * is the same purity `ImportProvider.normalize` requires, so wiring this into a
 * registered `JobBoardProvider` later is a wrapper, not a rewrite.
 *
 * NOT wired into the provider registry yet, deliberately. Two reasons:
 *   1. `ProviderId` mirrors the `integration_provider` Postgres enum, and
 *      `aidevboard` is not a member — adding it needs a migration first.
 *   2. Registering a provider tells the scheduler it may be polled. Turning on
 *      a background writer is a decision, not a side effect of adding a file.
 * Until then it normalizes under the existing `"other"` id. Dedup is keyed on
 * (providerId, externalId) and these ids are UUIDs, so sharing `"other"` with a
 * future source cannot collide.
 */

import type {
  NormalizedApplication,
  NormalizedCompany,
  ProviderId,
  RawImportRecord,
} from "@/lib/career-intelligence/providers/types";
import type { AiDevBoardJob } from "./client";

/** See the file header for why this is not `"aidevboard"` yet. */
const PROVIDER_ID: ProviderId = "other";

/** Their `workplace` vocabulary → the domain's `locationType`. */
function toLocationType(workplace: string | null): NormalizedApplication["locationType"] {
  switch ((workplace ?? "").toLowerCase()) {
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    case "onsite":
    case "on-site":
      return "onsite";
    default:
      // Unknown or absent stays null rather than guessing "onsite" — a wrong
      // location type would silently mis-filter every downstream search.
      return null;
  }
}

function toCompany(job: AiDevBoardJob): NormalizedCompany | null {
  if (!job.company_name) return null;
  return {
    name: job.company_name,
    externalIds: job.company_id ? { aidevboard_company_id: job.company_id } : undefined,
  };
}

/**
 * Map one job onto the domain shape.
 *
 * @param fetchedAt ISO timestamp of the fetch that produced `job`. Injected so
 * the function stays pure and a fixture replays identically.
 */
export function normalizeJob(job: AiDevBoardJob, fetchedAt: string): NormalizedApplication {
  const raw: RawImportRecord = {
    externalId: job.id,
    providerId: PROVIDER_ID,
    // The untouched source row, so a mapping bug can be replayed without
    // re-fetching — the reason `RawImportRecord` exists.
    payload: job,
    fetchedAt,
  };

  return {
    externalId: job.id,
    providerId: PROVIDER_ID,
    title: job.title,
    company: toCompany(job),
    jobUrl: job.apply_url ?? job.url ?? null,
    location: job.location,
    locationType: toLocationType(job.workplace),
    employmentType: job.job_type,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    // The API publishes no currency field. Asserting "USD" because the salaries
    // look American would be inventing data, so it stays null.
    salaryCurrency: null,
    deadlineAt: job.expires_at,
    description: job.description,
    // Fields with no domain equivalent survive here instead of being dropped;
    // the pipeline merges `extra` into the row's `metadata`.
    extra: {
      source: "aidevboard",
      board_url: job.url,
      slug: job.slug,
      tags: job.tags,
      experience_level: job.experience_level,
      remote_scope: job.remote_scope,
      quality_score: job.quality_score,
      company_slug: job.company_slug,
      company_logo_url: job.company_logo_url,
      published_at: job.published_at,
    },
    raw,
  };
}

/** Convenience for a whole page. One `fetchedAt` for the batch, by design. */
export function normalizeJobs(
  jobs: readonly AiDevBoardJob[],
  fetchedAt: string,
): NormalizedApplication[] {
  return jobs.map((job) => normalizeJob(job, fetchedAt));
}
