import "server-only";
import type { ResumeAnalysis } from "@/types/resume-analysis";
import { percent, prose } from "@/lib/ai-analysis/grounding";

/**
 * The narrative half of the review (Resume AI · Phase 3 · Step 2).
 *
 * Prose and one number: the overall summary, the hiring probability, and the
 * reasoning behind it.
 *
 * `overallHiringProbability` is the only figure the model is allowed to
 * produce, and this module is where it is kept honest. It is clamped to 0–100,
 * and it is refused when it merely restates the ATS score — a model that echoes
 * the number it was handed has added nothing while appearing to have made a
 * judgement, and the operator would read the agreement as corroboration.
 *
 * When the model gives no usable probability, the field falls back to the
 * deterministic score with the substitution stated in `reasoning`. Showing a
 * blank where a percentage belongs invites the reader to supply their own.
 */

/**
 * How close to the ATS score counts as an echo.
 *
 * Loose on purpose: the two numbers measure different things, so genuine
 * agreement within a point or two is coincidence rather than judgement.
 */
const ECHO_TOLERANCE = 2;

const FALLBACK_REASONING =
  "The AI returned no usable probability, so the deterministic match score is shown in its place.";

export interface Narrative {
  overallSummary: string;
  overallHiringProbability: number;
  reasoning: string;
  dropped: string[];
}

export function buildNarrative(raw: unknown, analysis: ResumeAnalysis): Narrative {
  const row = (raw ?? {}) as Record<string, unknown>;
  const dropped: string[] = [];

  const summary = prose(row.overallSummary);
  const reasoning = prose(row.reasoning);
  const probability = percent(row.overallHiringProbability);

  if (probability === null) {
    return {
      overallSummary: summary ?? analysis.summary.headline,
      overallHiringProbability: analysis.overallScore,
      reasoning: FALLBACK_REASONING,
      dropped: ["Hiring probability omitted: the AI did not return a usable number."],
    };
  }

  if (Math.abs(probability - analysis.overallScore) <= ECHO_TOLERANCE) {
    dropped.push(
      "Hiring probability restated the match score rather than forming a separate judgement.",
    );
  }

  return {
    overallSummary: summary ?? analysis.summary.headline,
    overallHiringProbability: probability,
    reasoning: reasoning ?? "The AI gave no reasoning for this figure.",
    dropped,
  };
}
