/**
 * Research → Career Intelligence bridge.
 *
 * The one place that converts a search result into the existing ingestion
 * contract. Everything upstream speaks `NormalizedJob` (a posting nobody has
 * acted on); everything downstream speaks `NormalizedApplication` (an
 * opportunity being tracked). Conversion happens once, here, when a human
 * decides to pursue a posting.
 *
 * Keeping one bridge rather than letting each provider emit
 * `NormalizedApplication` directly is what stops the two models drifting into
 * near-duplicates: a change to the ingestion contract breaks this file and
 * nothing else.
 *
 * Pure — no I/O, no clock of its own. `fetchedAt` comes from the provenance the
 * provider already recorded, so a bridged record replays identically.
 */

import type {
  NormalizedApplication,
  NormalizedCompany as ImportCompany,
  ProviderId,
  RawImportRecord,
} from "@/lib/career-intelligence/providers/types";
import type { NormalizedJob } from "@/lib/research/types";

/**
 * `ProviderId` mirrors the `integration_provider` Postgres enum, and no research
 * board is a member of it. Adding one requires a migration, so bridged records
 * use the existing `"other"` value until that decision is made deliberately.
 * Dedup is keyed on (providerId, externalId) and these ids are URLs or UUIDs,
 * so sharing `"other"` cannot collide.
 */
const BRIDGE_PROVIDER_ID: ProviderId = "other";

function toImportCompany(job: NormalizedJob): ImportCompany | null {
  if (!job.company) return null;
  return { name: job.company };
}

/** `NormalizedJob.workplace` has a fourth state the import contract lacks. */
function toLocationType(job: NormalizedJob): NormalizedApplication["locationType"] {
  return job.workplace === "unknown" ? null : job.workplace;
}

/**
 * Convert a posting into a trackable application.
 *
 * Sets no `stageHint` and no `appliedAt`: bridging records interest, not an
 * application. Asserting a stage here would let a research action silently
 * advance a pipeline the human has not moved.
 */
export function jobToApplication(job: NormalizedJob): NormalizedApplication {
  const raw: RawImportRecord = {
    externalId: job.provenance.externalId,
    providerId: BRIDGE_PROVIDER_ID,
    // The normalized posting, retained verbatim so a mapping bug can be
    // replayed without re-querying the board.
    payload: job,
    fetchedAt: job.provenance.retrievedAt,
  };

  return {
    externalId: job.provenance.externalId,
    providerId: BRIDGE_PROVIDER_ID,
    title: job.title,
    company: toImportCompany(job),
    jobUrl: job.applyUrl ?? job.provenance.sourceUrl,
    location: job.location,
    locationType: toLocationType(job),
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    // No board in this phase publishes a currency code. Inferring "USD" from
    // a dollar sign would be manufacturing data.
    salaryCurrency: null,
    description: job.description,
    extra: {
      researchProvider: job.provenance.provider,
      sourceUrl: job.provenance.sourceUrl,
      publishedAt: job.provenance.publishedAt,
      tags: job.tags,
      experienceLevel: job.experienceLevel,
      // Preserved because it is the only salary signal some boards give, and
      // dropping it would lose information the numeric fields cannot hold.
      salaryText: job.salaryText,
    },
    raw,
  };
}
