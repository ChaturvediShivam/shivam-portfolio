"use server";

import { withAdminAction, actionSuccess, actionError, type ActionResult } from "@/lib/actions";
import { featureEnabled } from "@/lib/featureFlags";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { AiError } from "@/lib/ai/errors";
import { analyzeResume } from "@/lib/resume-analysis/ResumeAnalysisService";
import { generateInsights, buildInsightRequest } from "@/lib/ai-analysis/ResumeInsightsService";
import { draftCoverLetter, type CoverLetterDraft } from "@/lib/ai-analysis/CoverLetterPrompt";
import {
  COVER_LETTER_LENGTHS,
  COVER_LETTER_TONES,
  DEFAULT_COVER_LETTER_OPTIONS,
  MAX_COMPANY_CHARS,
  MAX_HIRING_MANAGER_CHARS,
  type CoverLetterOptions,
} from "@/lib/ai-analysis/CoverLetterTypes";
import { rewriteSections } from "@/lib/ai-analysis/SectionRewriteService";
import {
  REWRITE_INTENSITIES,
  REWRITE_SECTIONS,
  REWRITE_TARGETS,
  type RewriteOptions,
  type RewriteResult,
} from "@/lib/ai-analysis/RewriteTypes";
import type { AiResumeInsights } from "@/lib/ai-analysis/AIAnalysisTypes";
import type { ParsedResume } from "@/types/resume";

/**
 * Resume AI server actions (Phase 3 · Step 2).
 *
 * The first server-side step in this feature. Everything before it — upload,
 * parse, deterministic scoring — runs in the browser, and would have kept
 * running there if the gateway allowed it. It does not, for good reasons: the
 * feature flag, the token budget, redaction and the audit log are all
 * server-side, and a provider call from the browser would expose the key and
 * skip every one of them.
 *
 * The deterministic analysis is recomputed here rather than accepted from the
 * client. It is the same pure function over the same parsed resume, so the
 * result is identical to what the operator is looking at — but it is now
 * engine-produced on the server, which means a crafted request cannot hand the
 * model a fabricated score to explain.
 */

/**
 * Ceiling on the parsed resume a request may carry.
 *
 * The parser truncates long documents well below this; the bound exists because
 * this is a trust boundary and the payload is client-supplied, not because a
 * real resume approaches it.
 */
const MAX_RESUME_CHARS = 200_000;
const MAX_JD_CHARS = 100_000;

export interface AiAnalysisInput {
  resume: ParsedResume;
  /** Raw job description text, exactly as the operator supplied it. */
  jobDescription: string;
}

/** Reject a malformed or oversized payload before any work is done. */
function validate(input: AiAnalysisInput): string | null {
  if (!input?.resume || typeof input.resume.text !== "string" || !Array.isArray(input.resume.lines)) {
    return "That resume could not be read.";
  }
  if (input.resume.text.length > MAX_RESUME_CHARS) return "That resume is too large to analyze.";
  if (typeof input.jobDescription !== "string" || !input.jobDescription.trim()) {
    return "Add a job description first.";
  }
  if (input.jobDescription.length > MAX_JD_CHARS) return "That job description is too large.";
  return null;
}

/**
 * Enrich the deterministic analysis with an AI review.
 *
 * Runs inline rather than enqueuing, matching the M7 manual summary and the
 * inbox digest: the operator asked and is watching, so a few seconds beats a
 * cron cycle with nothing on screen.
 */
export async function analyzeWithAiAction(
  input: AiAnalysisInput,
): Promise<ActionResult<{ insights: AiResumeInsights | null; note: string | null }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_RESUME_AI")) {
      return actionError({ formError: "The AI review is not enabled." });
    }

    const invalid = validate(input);
    if (invalid) return actionError({ formError: invalid });

    try {
      const { analysis, jobDescription } = analyzeResume({
        resume: input.resume,
        jobDescription: input.jobDescription,
      });

      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
      const insights = await generateInsights(
        gateway,
        { resume: input.resume, jobDescription, analysis, ownerId: userId },
        { includeEnrichment: true },
      );

      // Nothing usable is a real answer, not a failure: the deterministic
      // analysis on screen is still complete and correct.
      if (!insights) {
        return actionSuccess({
          insights: null,
          note: "The AI returned nothing usable for this resume. The match score above is unaffected.",
        });
      }

      return actionSuccess({ insights, note: null });
    } catch (error) {
      // Our own taxonomy's messages are provider-agnostic and free of request
      // content; anything else stays generic.
      const message = error instanceof AiError ? error.message : "Could not review this resume.";
      console.error("[resume ai] review failed:", error);
      return actionError({ formError: message });
    }
  });
}

/**
 * Rewrite one or more resume sections (Feature 2).
 *
 * Same shape as the review action deliberately: same gate, same validation,
 * same server-side recompute of the deterministic analysis. It differs only in
 * which service it hands the gateway to, which is what keeps a second AI
 * feature from becoming a second AI architecture.
 */
export async function rewriteResumeAction(
  input: AiAnalysisInput & { options: RewriteOptions },
): Promise<ActionResult<{ rewrite: RewriteResult }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_RESUME_AI")) {
      return actionError({ formError: "The AI review is not enabled." });
    }

    const invalid = validate(input);
    if (invalid) return actionError({ formError: invalid });

    // Closed vocabularies, re-checked server-side. The client sends these and a
    // crafted request could send anything; an unknown value would fall through
    // to a default rule silently rather than being refused.
    const { intensity, target, scope } = input.options ?? {};
    if (
      !REWRITE_INTENSITIES.includes(intensity) ||
      !REWRITE_TARGETS.includes(target) ||
      !REWRITE_SECTIONS.includes(scope)
    ) {
      return actionError({ formError: "That rewrite configuration is not valid." });
    }

    try {
      const { analysis, jobDescription } = analyzeResume({
        resume: input.resume,
        jobDescription: input.jobDescription,
      });

      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
      const rewrite = await rewriteSections(gateway, {
        resume: input.resume,
        jobDescription,
        analysis,
        ownerId: userId,
        options: { intensity, target, scope },
      });

      return actionSuccess({ rewrite });
    } catch (error) {
      const message = error instanceof AiError ? error.message : "Could not rewrite this resume.";
      console.error("[resume ai] rewrite failed:", error);
      return actionError({ formError: message });
    }
  });
}

/**
 * Draft a cover letter.
 *
 * Separate from the review because it produces outward-facing text the operator
 * will send under their own name. They ask for it explicitly, and nothing is
 * sent anywhere — the draft is returned to the page for them to copy.
 */
export async function draftCoverLetterAction(
  input: AiAnalysisInput & { options?: CoverLetterOptions },
): Promise<ActionResult<{ draft: CoverLetterDraft | null }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_RESUME_AI")) {
      return actionError({ formError: "The AI review is not enabled." });
    }

    const invalid = validate(input);
    if (invalid) return actionError({ formError: invalid });

    // Closed vocabularies re-checked server-side; free text bounded. Both cross
    // a trust boundary, and an unknown tone would fall through to a default
    // silently rather than being refused.
    const supplied = input.options ?? DEFAULT_COVER_LETTER_OPTIONS;
    if (
      !COVER_LETTER_TONES.includes(supplied.tone) ||
      !COVER_LETTER_LENGTHS.includes(supplied.length)
    ) {
      return actionError({ formError: "That cover letter configuration is not valid." });
    }
    if (
      (supplied.company?.length ?? 0) > MAX_COMPANY_CHARS ||
      (supplied.hiringManager?.length ?? 0) > MAX_HIRING_MANAGER_CHARS
    ) {
      return actionError({ formError: "Company or recipient name is too long." });
    }

    try {
      const { analysis, jobDescription } = analyzeResume({
        resume: input.resume,
        jobDescription: input.jobDescription,
      });

      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
      const draft = await draftCoverLetter(
        gateway,
        buildInsightRequest({
          resume: input.resume,
          jobDescription,
          analysis,
          ownerId: userId,
        }),
        supplied,
      );

      if (!draft) {
        return actionError({ formError: "The AI returned nothing usable. Try again." });
      }

      return actionSuccess({ draft });
    } catch (error) {
      const message = error instanceof AiError ? error.message : "Could not draft a cover letter.";
      console.error("[resume ai] cover letter failed:", error);
      return actionError({ formError: message });
    }
  });
}
