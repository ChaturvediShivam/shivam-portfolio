import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiGateway } from "@/lib/ai/gateway";
import { AiInvalidOutputError } from "@/lib/ai/errors";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import type { AiDevBoardJob } from "@/lib/integrations/aidevboard/client";
import {
  COMPENSATION_FITS,
  CONFIDENCE_LEVELS,
  FIT_RATINGS,
  MATCH_RECOMMENDATIONS,
  type CandidateProfile,
  type JobMatch,
  type JobMatchRecord,
} from "@/types/job-match";

/**
 * AI job matching (Phase 2).
 *
 * The decision layer between a job posting and a verdict: cache lookup, prompt
 * variables, the gateway call, output narrowing, and the write. Callers — the
 * Server Action today — are thin. Nothing but this module decides whether a
 * model call happens.
 *
 * It talks to the gateway through the `AiGateway` type and never constructs a
 * provider, so the whole file is testable against a fake gateway that names no
 * vendor. Same inversion the gateway itself uses.
 */

const TEMPLATE_ID = "job_match";

/** Entity type stamped on `ai_decisions` rows. Namespaced by source board. */
export const MATCH_ENTITY_TYPE = "aidevboard_job";

/**
 * Description ceiling. Bounds cost and the injection surface together. Postings
 * run long and the decisive requirements are near the top, so truncation costs
 * little; the prompt is told when it happened.
 */
export const MAX_DESCRIPTION_CHARS = 8_000;

/** Confidence as a number for `ai_decisions.confidence` (numeric(5,4)). */
const CONFIDENCE_SCORES: Record<JobMatch["confidence"], number> = {
  HIGH: 0.9,
  MEDIUM: 0.6,
  LOW: 0.3,
};

// --- Output narrowing --------------------------------------------------------

/**
 * `lib/ai/schema.ts` validates structure only — type, required, properties,
 * items. It does not enforce `enum`, `minimum` or `maximum`, so a reply can
 * pass the gateway's schema check and still carry `recommendation: "YES"` or a
 * score of 900. These helpers are that missing half.
 *
 * Extending the shared validator instead was the alternative and was rejected:
 * every other template depends on it, and widening a validator to fix one
 * caller is how a shared contract quietly changes for twelve.
 */

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    const hit = allowed.find((candidate) => candidate === upper);
    if (hit) return hit;
  }
  throw new AiInvalidOutputError(
    `Field "${field}" must be one of ${allowed.join(", ")}; received ${JSON.stringify(value)}.`,
  );
}

/**
 * Score is clamped rather than rejected.
 *
 * A model that returns 105 has still expressed "very strong fit" — discarding
 * the whole assessment over an off-by-five would trade a usable answer for a
 * hard failure. Enums are rejected instead of coerced because there is no
 * meaningful nearest value between APPLY and SKIP.
 */
function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) {
    throw new AiInvalidOutputError(
      `Field "overall_match_score" must be a number; received ${JSON.stringify(value)}.`,
    );
  }
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Strings only, trimmed, empties dropped, bounded — model output is not a list primitive. */
function stringList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed) out.push(trimmed.slice(0, 300));
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Turn an unvalidated reply into a `JobMatch`, or throw.
 *
 * Exported because it is the security boundary of this feature: nothing
 * downstream — cache, UI, future Supabase writes — sees model output that has
 * not been through here.
 */
export function narrowJobMatch(raw: unknown): JobMatch {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AiInvalidOutputError("Job match reply was not a JSON object.");
  }
  const value = raw as Record<string, unknown>;

  const explanation = typeof value.explanation === "string" ? value.explanation.trim() : "";
  if (!explanation) {
    throw new AiInvalidOutputError('Field "explanation" must be a non-empty string.');
  }

  return {
    overall_match_score: clampScore(value.overall_match_score),
    recommendation: oneOf(value.recommendation, MATCH_RECOMMENDATIONS, "recommendation"),
    strengths: stringList(value.strengths),
    gaps: stringList(value.gaps),
    required_skills_match: stringList(value.required_skills_match),
    transferable_skills: stringList(value.transferable_skills),
    experience_fit: oneOf(value.experience_fit, FIT_RATINGS, "experience_fit"),
    role_fit: oneOf(value.role_fit, FIT_RATINGS, "role_fit"),
    compensation_fit: oneOf(value.compensation_fit, COMPENSATION_FITS, "compensation_fit"),
    explanation: explanation.slice(0, 2_000),
    confidence: oneOf(value.confidence, CONFIDENCE_LEVELS, "confidence"),
  };
}

// --- Cache key ---------------------------------------------------------------

/**
 * Fingerprint of everything that could change the verdict.
 *
 * Includes the prompt version and the profile, not just the job: a re-worded
 * prompt or an updated resume SHOULD invalidate a cached assessment, and a
 * cache keyed on job id alone would silently serve a stale one forever.
 *
 * Stored in `ai_decisions.input_hash`, which is exactly what that column is for.
 */
export function computeInputHash(
  job: AiDevBoardJob,
  profile: CandidateProfile,
  promptVersion: string,
): string {
  const material = JSON.stringify({
    v: promptVersion,
    job: {
      id: job.id,
      title: job.title,
      company: job.company_name,
      location: job.location,
      workplace: job.workplace,
      jobType: job.job_type,
      level: job.experience_level,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      tags: job.tags,
      // The description drives most of the verdict, so it belongs in the key.
      description: (job.description ?? "").slice(0, MAX_DESCRIPTION_CHARS),
    },
    profile: {
      source: profile.source,
      headline: profile.headline,
      years: profile.yearsExperience,
      roles: profile.targetRoles,
      skills: profile.skills,
      background: profile.background,
      resume: profile.resumeText,
    },
  });
  return createHash("sha256").update(material).digest("hex");
}

// --- Prompt variables --------------------------------------------------------

function formatSalary(job: AiDevBoardJob): string {
  const { salary_min: min, salary_max: max } = job;
  if (min !== null && max !== null) return `${min}-${max}`;
  if (min !== null) return `from ${min}`;
  if (max !== null) return `up to ${max}`;
  // Explicit, so the model reads "not stated" rather than an empty line it has
  // to interpret. This is what makes compensation_fit UNKNOWN instead of POOR.
  return "not stated";
}

/** Exported for tests: what the model is shown is worth asserting directly. */
export function buildPromptVariables(
  job: AiDevBoardJob,
  profile: CandidateProfile,
): Record<string, unknown> {
  const description = job.description ?? "";
  const truncated = description.length > MAX_DESCRIPTION_CHARS;

  return {
    headline: profile.headline,
    yearsExperience: profile.yearsExperience ?? "not stated",
    targetRoles: profile.targetRoles.join(", "),
    skills: profile.skills.join(", "),
    background: profile.background,
    resumeText: profile.resumeText ?? "(no resume on file)",
    profileNote:
      profile.source === "fallback"
        ? "\nThis is a summary profile rather than a full resume. Lower your confidence accordingly."
        : "",

    jobTitle: job.title,
    company: job.company_name ?? "not stated",
    location: job.location ?? "not stated",
    workplace: job.workplace ?? "not stated",
    jobType: job.job_type ?? "not stated",
    experienceLevel: job.experience_level ?? "not stated",
    salary: formatSalary(job),
    tags: job.tags.length > 0 ? job.tags.join(", ") : "none",
    description: truncated ? description.slice(0, MAX_DESCRIPTION_CHARS) : description || "(none)",
    truncationNote: truncated ? "\n(The description was truncated for length.)" : "",
  };
}

// --- Persistence -------------------------------------------------------------

/**
 * Read the newest cached assessment for this exact input.
 *
 * `ai_decisions` is append-only, so a re-analysis adds a row rather than
 * replacing one and the history stays intact — hence "newest matching hash"
 * rather than "the row".
 *
 * Never throws: a cache that fails should cost a model call, not the feature.
 */
async function readCached(
  client: SupabaseClient,
  ownerId: string,
  jobId: string,
  inputHash: string,
): Promise<JobMatchRecord | null> {
  try {
    const { data, error } = await client
      .from("ai_decisions")
      .select("evidence, model, prompt_version, created_at")
      .eq("entity_type", MATCH_ENTITY_TYPE)
      .eq("entity_id", jobId)
      .eq("owner_id", ownerId)
      .eq("input_hash", inputHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const evidence = (data as { evidence?: unknown }).evidence;
    // A stored row is re-narrowed rather than trusted. It was validated when
    // written, but the shape could predate a change to this file, and a bad
    // cache row must degrade to a fresh call, not corrupt the UI.
    const match = narrowJobMatch(evidence);
    const row = data as { model?: string; prompt_version?: string; created_at?: string };

    return {
      match,
      cached: true,
      analyzedAt: row.created_at ?? new Date().toISOString(),
      model: row.model ?? null,
      promptVersion: row.prompt_version ?? null,
      // Recoverable from the hash, but not worth a second column: the hash
      // already guarantees the cached row was built from this same profile.
      profileSource: "resume",
    };
  } catch (error) {
    console.error("[job-match] cache read failed; will re-analyze:", error);
    return null;
  }
}

/** Append the assessment. A write failure costs the cache, never the answer. */
async function writeDecision(
  client: SupabaseClient,
  input: {
    ownerId: string;
    jobId: string;
    inputHash: string;
    match: JobMatch;
    model: string;
    promptVersion: string;
  },
): Promise<void> {
  try {
    const { error } = await client.from("ai_decisions").insert({
      entity_type: MATCH_ENTITY_TYPE,
      entity_id: input.jobId,
      prompt_version: input.promptVersion,
      model: input.model,
      confidence: CONFIDENCE_SCORES[input.match.confidence],
      decision: input.match.recommendation,
      reasoning: input.match.explanation,
      // The full structured verdict. `evidence` is jsonb and this is what makes
      // the row a cache entry rather than only an audit trail.
      evidence: input.match,
      input_hash: input.inputHash,
      owner_id: input.ownerId,
    });
    if (error) throw error;
  } catch (error) {
    console.error("[job-match] decision write failed; result still returned:", error);
  }
}

// --- Public API --------------------------------------------------------------

export interface MatchJobInput {
  readonly job: AiDevBoardJob;
  readonly profile: CandidateProfile;
  readonly ownerId: string;
  /** Skip the cache read and force a fresh assessment. */
  readonly refresh?: boolean;
}

/**
 * Assess one job against one candidate profile.
 *
 * Cost control lives here, not in the caller: the cache is consulted first, and
 * a model call only happens on a miss or an explicit refresh. Combined with the
 * UI never analyzing on page load, a job is assessed at most once per
 * (job, profile, prompt version).
 *
 * @throws {AiError} subclasses from the gateway — disabled, unconfigured,
 * budget, rate limit, transient, invalid output. Callers map these to messages;
 * they are provider-agnostic and carry no request content.
 */
export async function matchJobToCandidate(
  gateway: AiGateway,
  client: SupabaseClient,
  input: MatchJobInput,
): Promise<JobMatchRecord> {
  const { job, profile, ownerId } = input;

  const template = getPromptTemplate(TEMPLATE_ID);
  const inputHash = computeInputHash(job, profile, template.version);

  if (!input.refresh) {
    const cached = await readCached(client, ownerId, job.id, inputHash);
    if (cached) return { ...cached, profileSource: profile.source };
  }

  const completion = await gateway.complete<unknown>({
    templateId: TEMPLATE_ID,
    templateVersion: template.version,
    variables: buildPromptVariables(job, profile),
    ownerId,
    actor: "user",
    action: "job_match",
    entityType: MATCH_ENTITY_TYPE,
    entityId: job.id,
    // No tools. This call reads nothing and writes nothing; it turns text into
    // a verdict. Offering the catalogue would widen the blast radius of a
    // prompt-injection attempt in a posting for no benefit.
    enableTools: false,
  });

  // `parsed` is set only when the gateway's schema validation succeeded. Falling
  // back to re-parsing `text` would be re-doing the check the gateway just did.
  const match = narrowJobMatch(completion.parsed);

  await writeDecision(client, {
    ownerId,
    jobId: job.id,
    inputHash,
    match,
    model: completion.model,
    promptVersion: template.version,
  });

  return {
    match,
    cached: false,
    analyzedAt: new Date().toISOString(),
    model: completion.model,
    promptVersion: template.version,
    profileSource: profile.source,
  };
}
