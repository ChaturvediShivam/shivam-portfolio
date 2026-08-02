import "server-only";
import type { AiGateway } from "@/lib/ai/gateway";
import { AiTransientError } from "@/lib/ai/errors";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import { detectSkills, skillLabel } from "@/lib/resume-analysis/SkillMatcher";
import { sectionOfKind, type ParsedResume } from "@/types/resume";
import type { JobDescriptionAnalysis, ResumeAnalysis } from "@/types/resume-analysis";
import type {
  AiResumeInsights,
  InsightOptions,
  InsightRequest,
} from "@/lib/ai-analysis/AIAnalysisTypes";
import { buildGroundingContext } from "@/lib/ai-analysis/grounding";
import { analyzeStrengths, analyzeTransferableSkills } from "@/lib/ai-analysis/StrengthAnalyzer";
import { analyzeCriticalGaps, analyzeWeaknesses } from "@/lib/ai-analysis/WeaknessAnalyzer";
import { buildNarrative } from "@/lib/ai-analysis/ResumeNarrative";
import {
  generateBulletImprovements,
  generateRecommendations,
  selectMissingKeywords,
} from "@/lib/ai-analysis/RecommendationGenerator";
import { generateInterviewQuestions } from "@/lib/ai-analysis/InterviewQuestionGenerator";
import { optimizeLinkedIn } from "@/lib/ai-analysis/LinkedInOptimizer";
import { rewriteSummary } from "@/lib/ai-analysis/ResumeRewriteEngine";

/**
 * AI enrichment orchestrator (Resume AI · Phase 3 · Step 2).
 *
 * The one place that turns a finished deterministic analysis into an enriched
 * one. It never computes a score, never re-reads the resume file, and never
 * touches the `ResumeAnalysis` it is given: that object is carried through by
 * reference and the AI result is returned beside it.
 *
 * Shape of the work:
 *
 *   1. One `resume_review` call, whose reply is passed through the analyzers.
 *      Everything ungrounded is discarded there and recorded in `dropped`.
 *   2. Three enrichment calls — interview, LinkedIn, rewrite — issued together
 *      and settled independently, so a failure in one costs only that panel.
 *
 * The cover letter is not here. It is outward-facing text the operator sends
 * under their own name, so it stays an explicit separate action.
 */

const TEMPLATE_ID = "resume_review";

/**
 * Input ceilings.
 *
 * Generous relative to a resume (most are two pages) and tight relative to the
 * model's context, which is the right trade: truncating a resume loses the
 * evidence the grounding checks depend on, while an unbounded prompt is an
 * unbounded bill.
 */
const MAX_RESUME_CHARS = 14000;
const MAX_JD_CHARS = 8000;

/** Bounded lists in the prompt. Past this the model stops reading anyway. */
const MAX_LISTED_SKILLS = 40;
const MAX_LISTED_RESPONSIBILITIES = 15;
const MAX_LISTED_KEYWORDS = 25;

const TRUNCATION_NOTE =
  "\n(The resume was shortened for length. Judge only what is shown above.)";

interface ReviewOutput {
  overallSummary: unknown;
  strengths: unknown;
  weaknesses: unknown;
  criticalGaps: unknown;
  transferableSkills: unknown;
  missingKeywords: unknown;
  recommendations: unknown;
  bulletImprovements: unknown;
  overallHiringProbability: unknown;
  reasoning: unknown;
}

export interface InsightInput {
  resume: ParsedResume;
  jobDescription: JobDescriptionAnalysis;
  analysis: ResumeAnalysis;
  ownerId: string;
}

function clip(value: string, limit: number): { text: string; truncated: boolean } {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return { text: trimmed, truncated: false };
  return { text: `${trimmed.slice(0, limit - 1)}…`, truncated: true };
}

/**
 * The candidate's name, if the first line plainly is one.
 *
 * Only used to address a cover letter. A wrong guess would put a stranger's
 * name on the operator's letter, so anything ambiguous — an address line, a
 * heading, a contact block — yields null and the letter says "the candidate".
 */
function candidateNameOf(resume: ParsedResume): string | null {
  const first = resume.lines.find((line) => line.trim().length > 0)?.trim();
  if (!first || first.length > 60) return null;
  if (/[@\d|]/.test(first)) return null;
  const words = first.split(/\s+/);
  return words.length >= 2 && words.length <= 5 ? first : null;
}

/** Assemble the bounded material every prompt renders from. */
export function buildInsightRequest(input: InsightInput): InsightRequest {
  const { resume, jobDescription: jd, analysis } = input;
  const summarySection = sectionOfKind(resume, "summary");

  return {
    ownerId: input.ownerId,
    resumeText: clip(resume.text, MAX_RESUME_CHARS).text,
    jobDescriptionText: clip(
      [
        ...jd.responsibilities,
        ...jd.requiredSkills.map((s) => s.evidence),
        ...jd.preferredSkills.map((s) => s.evidence),
      ].join("\n"),
      MAX_JD_CHARS,
    ).text,
    jobTitle: jd.title ?? "the advertised role",
    company: jd.company,
    candidateName: candidateNameOf(resume),
    currentSummary: summarySection ? clip(summarySection.lines.join(" "), 2000).text || null : null,
    detectedSkills: detectSkills(resume.text).slice(0, MAX_LISTED_SKILLS).map(skillLabel),
    missingSkills: analysis.missingSkills.slice(0, MAX_LISTED_SKILLS).map((s) => s.displayName),
    matchedSkills: analysis.skillMatches.slice(0, MAX_LISTED_SKILLS).map((s) => s.displayName),
    responsibilities: jd.responsibilities.slice(0, MAX_LISTED_RESPONSIBILITIES),
    jobKeywords: jd.keywords.slice(0, MAX_LISTED_KEYWORDS),
  };
}

/**
 * Run the primary call once more on a transient failure.
 *
 * Only transient: a refusal, a budget stop or a schema violation will fail the
 * same way twice, and retrying them would double the spend to reach the same
 * answer. The enrichment calls are not retried at all — they are optional, and
 * three more requests to fill in a side panel is not a trade worth making.
 */
async function completeReview(
  gateway: AiGateway,
  request: InsightRequest,
  variables: Record<string, unknown>,
) {
  const call = () =>
    gateway.complete<ReviewOutput>({
      templateId: TEMPLATE_ID,
      ownerId: request.ownerId,
      actor: "user",
      action: "resume_review",
      entityType: "resume",
      variables,
    });

  try {
    return await call();
  } catch (error) {
    if (!(error instanceof AiTransientError)) throw error;
    return await call();
  }
}

/**
 * Enrich a deterministic analysis.
 *
 * Returns null when the model produced nothing usable — a refusal or a
 * truncated reply. The caller still has a complete, correct analysis to show;
 * enrichment degrades, the product does not.
 */
export async function generateInsights(
  gateway: AiGateway,
  input: InsightInput,
  options: InsightOptions = {},
): Promise<AiResumeInsights | null> {
  const { resume, jobDescription: jd, analysis } = input;
  const request = buildInsightRequest(input);
  const ctx = buildGroundingContext(resume, jd, analysis);
  const clipped = clip(resume.text, MAX_RESUME_CHARS);

  const completion = await completeReview(gateway, request, {
    overallScore: analysis.overallScore,
    confidence: `${Math.round(analysis.confidence.value * 100)}%`,
    categoryScores: analysis.breakdown
      .map((entry) => `${entry.category} ${entry.score}/100`)
      .join(", "),
    detectedSkills: request.detectedSkills.join(", ") || "none detected",
    missingSkills: request.missingSkills.join(", ") || "none",
    missingKeywords: analysis.keywords.missing.join(", ") || "none",
    experienceSummary: describeExperience(analysis),
    educationSummary: describeEducation(analysis),
    responsibilitySummary: `${analysis.summary.responsibilitiesCovered} of ${analysis.summary.totalResponsibilities} covered`,
    jobTitle: request.jobTitle,
    jobDescription: request.jobDescriptionText,
    resume: clipped.text,
    truncationNote: clipped.truncated ? TRUNCATION_NOTE : "",
  });

  if (completion.stopReason !== "completed" || !completion.parsed) return null;

  const output = completion.parsed;
  const strengths = analyzeStrengths(output.strengths, ctx);
  const transferable = analyzeTransferableSkills(output.transferableSkills, ctx);
  const weaknesses = analyzeWeaknesses(output.weaknesses, ctx);
  const gaps = analyzeCriticalGaps(output.criticalGaps, ctx);
  const recommendations = generateRecommendations(output.recommendations, ctx);
  const bullets = generateBulletImprovements(output.bulletImprovements, ctx);
  const keywords = selectMissingKeywords(output.missingKeywords, ctx);
  const narrative = buildNarrative(output, analysis);

  const enrichment = options.includeEnrichment
    ? await runEnrichment(gateway, request)
    : { interviewQuestions: [], linkedin: { suggestions: null, dropped: [] }, rewrite: null };

  return {
    overallSummary: narrative.overallSummary,
    strengths: strengths.strengths,
    weaknesses: weaknesses.weaknesses,
    criticalGaps: gaps.criticalGaps,
    transferableSkills: transferable.transferableSkills,
    missingKeywords: keywords.missingKeywords,
    recommendations: recommendations.recommendations,
    bulletImprovements: bullets.bulletImprovements,
    interviewQuestions: enrichment.interviewQuestions,
    linkedinSuggestions: enrichment.linkedin.suggestions,
    resumeSummaryRewrite: enrichment.rewrite,
    overallHiringProbability: narrative.overallHiringProbability,
    reasoning: narrative.reasoning,

    aiProvider: completion.provider,
    aiModel: completion.model,
    aiPromptVersion: getPromptTemplate(TEMPLATE_ID).version,
    generatedAt: new Date().toISOString(),
    dropped: [
      ...narrative.dropped,
      ...strengths.dropped,
      ...weaknesses.dropped,
      ...gaps.dropped,
      ...transferable.dropped,
      ...keywords.dropped,
      ...recommendations.dropped,
      ...bullets.dropped,
      ...enrichment.linkedin.dropped,
    ],
  };
}

/**
 * The three optional calls, issued together and settled independently.
 *
 * `allSettled` rather than `all`: these are three separate panels, and losing
 * all three because the LinkedIn call hit a rate limit would be a worse outcome
 * than showing two. Failures are logged rather than surfaced — the operator
 * asked for an analysis, and an error banner about a side panel they did not
 * ask about is noise.
 */
async function runEnrichment(gateway: AiGateway, request: InsightRequest) {
  const [questions, linkedin, rewrite] = await Promise.allSettled([
    generateInterviewQuestions(gateway, request),
    optimizeLinkedIn(gateway, request),
    rewriteSummary(gateway, request),
  ]);

  for (const result of [questions, linkedin, rewrite]) {
    if (result.status === "rejected") {
      console.error("[resume ai] enrichment call failed:", result.reason);
    }
  }

  return {
    interviewQuestions: questions.status === "fulfilled" ? questions.value : [],
    linkedin:
      linkedin.status === "fulfilled" ? linkedin.value : { suggestions: null, dropped: [] },
    rewrite: rewrite.status === "fulfilled" ? rewrite.value : null,
  };
}

function describeExperience(analysis: ResumeAnalysis): string {
  const { requiredYears, resumeYears, meets } = analysis.experience;
  if (requiredYears === null) return "the posting states no minimum";
  if (resumeYears === null) return `${requiredYears}+ years asked for; none derivable from the resume`;
  return `${requiredYears}+ years asked for, ${resumeYears} evidenced (${meets ? "meets" : "short"})`;
}

function describeEducation(analysis: ResumeAnalysis): string {
  const { requiredLevel, resumeLevel, meets } = analysis.education;
  if (requiredLevel === "none") return "the posting states no requirement";
  return `${requiredLevel} asked for, ${resumeLevel} evidenced (${meets ? "meets" : "short"})`;
}
