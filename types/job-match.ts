/**
 * AI job matching — result contract (Phase 2).
 *
 * The shape the model must produce and the app may rely on. Declared here, in
 * `types/`, alongside every other domain contract rather than inside the
 * service, because the UI, the service and the tests all need it and none of
 * them should import from each other to get it.
 *
 * The enums are `as const` arrays rather than bare unions because they are
 * needed at RUNTIME: `lib/ai/schema.ts` validates structure only (type,
 * required, properties, items) and does not enforce `enum`, `minimum` or
 * `maximum`. So a reply can satisfy the JSON Schema and still say
 * `recommendation: "DEFINITELY"` or `overall_match_score: 900`. These arrays
 * are what `narrowJobMatch` checks against to close that gap.
 */

export const MATCH_RECOMMENDATIONS = ["APPLY", "MAYBE", "SKIP"] as const;
export type MatchRecommendation = (typeof MATCH_RECOMMENDATIONS)[number];

export const FIT_RATINGS = ["GOOD", "PARTIAL", "POOR"] as const;
export type FitRating = (typeof FIT_RATINGS)[number];

/**
 * Compensation is the one axis with an explicit "we were not told" value:
 * most postings state no salary, and scoring that as POOR would punish the
 * candidate for the employer's omission.
 */
export const COMPENSATION_FITS = ["GOOD", "UNKNOWN", "POOR"] as const;
export type CompensationFit = (typeof COMPENSATION_FITS)[number];

export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** A validated match assessment. Every field has survived `narrowJobMatch`. */
export interface JobMatch {
  /** 0–100, integer. Clamped on the way in; never trusted raw. */
  readonly overall_match_score: number;
  readonly recommendation: MatchRecommendation;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly required_skills_match: readonly string[];
  readonly transferable_skills: readonly string[];
  readonly experience_fit: FitRating;
  readonly role_fit: FitRating;
  readonly compensation_fit: CompensationFit;
  readonly explanation: string;
  readonly confidence: ConfidenceLevel;
}

/** A match plus how it was produced. What the UI and the cache both handle. */
export interface JobMatchRecord {
  readonly match: JobMatch;
  /** True when served from `ai_decisions` rather than a fresh model call. */
  readonly cached: boolean;
  /** ISO timestamp of the analysis that produced `match`. */
  readonly analyzedAt: string;
  /** Opaque provenance, recorded and displayed, never branched on. */
  readonly model: string | null;
  readonly promptVersion: string | null;
  /**
   * Which candidate profile fed the analysis. A fallback profile is thinner
   * than a real resume, so the UI can say the assessment is less grounded.
   */
  readonly profileSource: CandidateProfileSource;
}

export type CandidateProfileSource = "resume" | "fallback";

/**
 * What the model is told about the candidate.
 *
 * Deliberately NOT `ResumeProfile` from `types/resume.ts`. That type carries
 * `emails` and `phones`, and Phase 8 requires that unnecessary private
 * information never reaches the provider — a match assessment does not need a
 * phone number to decide whether a job fits. This is a narrower, purpose-built
 * projection, not a duplicate profile store: the underlying facts still come
 * from `resume_versions` when one exists.
 */
export interface CandidateProfile {
  readonly source: CandidateProfileSource;
  /** One-line positioning, e.g. "AI Application Engineer | Strategic Research & AI". */
  readonly headline: string;
  /** Years of professional experience, or null when genuinely unknown. */
  readonly yearsExperience: number | null;
  /** Roles actively targeted. Drives `role_fit`. */
  readonly targetRoles: readonly string[];
  /** Skills the candidate actually claims. Never inferred by the model. */
  readonly skills: readonly string[];
  /** Prose background: employment history, domains, notable projects. */
  readonly background: string;
  /**
   * Full resume text when a stored resume supplied it. Null on the fallback
   * profile — and the prompt is told so, rather than left to guess why the
   * section is empty.
   */
  readonly resumeText: string | null;
}
