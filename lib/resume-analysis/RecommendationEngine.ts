/**
 * Recommendation seam (Resume AI · Phase 3) — INTERFACES ONLY.
 *
 * Nothing here has an implementation, and that is the point of the phase. The
 * deterministic engine can say a required skill is missing; it cannot say
 * whether the operator should add it, surface it from a buried bullet, or
 * accept the gap and target a different role. That is judgement, and judgement
 * is what the AI step is for.
 *
 * The constraint carried forward from `lib/resume/placeholder.ts`: a generator
 * takes an `AiGateway` rather than a provider client, so flag gating, the token
 * budget, redaction and `ai_audit_log` cannot be bypassed — matching
 * `lib/ai/summarize.ts` and `lib/ai/inbox.ts`.
 *
 * Note the input: a `ResumeAnalysis` that has ALREADY been computed. The model
 * is never asked to score. It explains an analysis it is handed, which keeps
 * the numbers reproducible and the token cost bounded.
 */

import type { AiGateway } from "@/lib/ai/gateway";
import type { ParsedResume } from "@/types/resume";
import type {
  JobDescriptionAnalysis,
  Recommendation,
  ResumeAnalysis,
} from "@/types/resume-analysis";

export interface RecommendationInput {
  /** Computed deterministically. The model does not recompute it. */
  analysis: ResumeAnalysis;
  jobDescription: JobDescriptionAnalysis;
  resume: ParsedResume;
  gateway: AiGateway;
  ownerId: string;
}

/** Turns a computed analysis into actionable advice. */
export interface RecommendationEngine {
  recommend(input: RecommendationInput): Promise<Recommendation[]>;
}

/**
 * Rewrites a single section in light of the analysis.
 *
 * Separate from `RecommendationEngine` because it is a different consent
 * boundary: advice is free to read and ignore, whereas rewritten prose invites
 * being pasted straight into a resume. When it lands it should return a
 * proposal the operator explicitly accepts, in the shape M9 established for
 * anything with consequences.
 */
export interface SectionRewriter {
  rewrite(input: RecommendationInput & { section: string }): Promise<string>;
}
