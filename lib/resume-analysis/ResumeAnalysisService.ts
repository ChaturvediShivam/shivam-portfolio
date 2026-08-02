/**
 * Analysis orchestration (Resume AI · Phase 3).
 *
 * The single entry point: a parsed resume and raw posting text in, a
 * `ResumeAnalysis` out. Parsing, matching and scoring are separate modules;
 * this composes them and owns nothing but the order.
 *
 * Synchronous and pure by design. There is no I/O, no model, and no clock
 * dependency beyond the timestamp — so the same inputs always produce the same
 * analysis, and the whole thing runs in the browser in a millisecond. That
 * property is what makes the later AI step cheap: the model will be handed a
 * computed analysis to explain, rather than a resume to score.
 */

import type { ParsedResume } from "@/types/resume";
import type { AnalysisSummary, ResumeAnalysis } from "@/types/resume-analysis";
import { parseJobDescription } from "./JobDescriptionParser";
import {
  compareEducation,
  compareExperience,
  compareKeywords,
  compareResponsibilities,
  compareSkills,
} from "./MatchingEngine";
import {
  computeConfidence,
  ENGINE_VERSION,
  overallScore,
  scoreEducation,
  scoreExperience,
  scoreKeywords,
  scoreResponsibilities,
  scoreSkills,
} from "./ScoreCalculator";

/**
 * A factual one-liner.
 *
 * Composed from counts, never phrased loosely. "Strong match" would be a
 * judgement this phase has no basis to make, and the moment it appears the
 * operator stops reading the numbers underneath it.
 */
function buildSummary(analysis: Omit<ResumeAnalysis, "summary">): AnalysisSummary {
  const required = analysis.skillMatches.filter((match) => match.importance === "required");
  const preferred = analysis.skillMatches.filter((match) => match.importance === "preferred");
  const missingRequired = analysis.missingSkills.filter((skill) => skill.importance === "required");

  const totalRequired = required.length + missingRequired.length;
  const totalPreferred =
    preferred.length + analysis.missingSkills.filter((skill) => skill.importance === "preferred").length;

  const covered = analysis.matchedRequirements.filter((requirement) => requirement.matched).length;

  const headline =
    totalRequired === 0
      ? `Scored ${analysis.overallScore} out of 100. The posting named no specific required skills.`
      : `Scored ${analysis.overallScore} out of 100, matching ${required.length} of ${totalRequired} required skills.`;

  return {
    headline,
    matchedRequiredSkills: required.length,
    totalRequiredSkills: totalRequired,
    matchedPreferredSkills: preferred.length,
    totalPreferredSkills: totalPreferred,
    missingRequiredSkills: missingRequired.length,
    responsibilitiesCovered: covered,
    totalResponsibilities: analysis.matchedRequirements.length,
  };
}

export interface AnalyzeInput {
  resume: ParsedResume;
  /** Raw job description text, exactly as the operator supplied it. */
  jobDescription: string;
}

export interface AnalysisResult {
  analysis: ResumeAnalysis;
  /** The structured posting, exposed so the UI can show what was understood. */
  jobDescription: ReturnType<typeof parseJobDescription>;
}

/**
 * Run the full deterministic analysis.
 *
 * Recommendations come back empty: producing them needs judgement rather than
 * arithmetic, which is the boundary between this phase and the AI step. The
 * field exists so the UI that renders advice is written once.
 */
export function analyzeResume(input: AnalyzeInput): AnalysisResult {
  const jd = parseJobDescription(input.jobDescription);
  const { resume } = input;

  const { matches, missing } = compareSkills(resume, jd);
  const matchedRequirements = compareResponsibilities(resume, jd);
  const experience = compareExperience(resume, jd);
  const education = compareEducation(resume, jd);
  const keywords = compareKeywords(resume, jd);

  const breakdown = [
    scoreSkills(matches, missing, jd),
    scoreExperience(experience),
    scoreEducation(education),
    scoreKeywords(keywords),
    scoreResponsibilities(matchedRequirements),
  ];

  const partial: Omit<ResumeAnalysis, "summary"> = {
    overallScore: overallScore(breakdown),
    breakdown,
    confidence: computeConfidence(jd, experience, matchedRequirements, resume.lines.length),
    skillMatches: matches,
    missingSkills: missing,
    matchedRequirements,
    experience,
    education,
    keywords,
    recommendations: [],
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
  };

  return {
    analysis: { ...partial, summary: buildSummary(partial) },
    jobDescription: jd,
  };
}
