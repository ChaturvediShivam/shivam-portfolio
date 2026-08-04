/**
 * AI enrichment domain (Resume AI · Phase 3 · Step 2).
 *
 * The types the model may produce — and, just as importantly, the types it may
 * NOT. There is no score anywhere in this file. `ResumeAnalysis` from
 * `types/resume-analysis.ts` holds every number, is computed deterministically,
 * and is carried through `UnifiedAnalysis` unchanged.
 *
 * That separation is structural rather than a convention: the model's output
 * shape has no field it could write a score into, so "the AI must never
 * calculate ATS scores" is enforced by the type system instead of by a prompt
 * instruction the model might drift from.
 *
 * `hiringProbability` is the one number the model does produce, and it is
 * deliberately not called a score. It is a stated judgement about outcome, kept
 * in a different object from the ATS figure so the two can never be conflated
 * or averaged.
 */

import type { ResumeSectionKind } from "@/types/resume";
import type { ResumeAnalysis } from "@/types/resume-analysis";

/** How strongly the deterministic evidence supports an observation. */
export type InsightSeverity = "critical" | "important" | "minor";

/**
 * A claim the model makes, tied to something the parser actually found.
 *
 * `evidence` is not optional. Every insight must quote the resume or posting
 * line it rests on, which is what makes an unfounded claim detectable rather
 * than merely discouraged.
 */
export interface Insight {
  /** One clause, executive register. */
  headline: string;
  /** Why it matters, in one or two sentences. */
  detail: string;
  /** The resume or job-description line this rests on. */
  evidence: string;
}

export interface Strength extends Insight {
  /** Canonical skill id when the strength is about a specific skill. */
  relatedSkill: string | null;
}

export interface Weakness extends Insight {
  severity: InsightSeverity;
  relatedSkill: string | null;
}

/** A required capability the resume does not evidence. */
export interface CriticalGap {
  /** Canonical skill id, always one the deterministic engine reported missing. */
  skill: string;
  displayName: string;
  /** The job-description line that asked for it. */
  requestedIn: string;
  /** What the absence means for this application. */
  impact: string;
}

/**
 * Existing experience that partly covers a gap.
 *
 * The most useful thing the model adds over the deterministic engine, which can
 * only report a skill as present or absent. `fromSkill` must be a skill the
 * parser detected — otherwise the transfer is invented.
 */
export interface TransferableSkill {
  fromSkill: string;
  toRequirement: string;
  rationale: string;
  evidence: string;
}

export type RecommendationPriority = "high" | "medium" | "low";

/**
 * An action the operator can take.
 *
 * `why` is required and separate from `action` because a recommendation without
 * its reason is an instruction to obey rather than a judgement to evaluate —
 * "You should learn Power BI" instead of "Power BI appears in the job
 * description but was not detected in your resume."
 */
export interface AiRecommendation {
  priority: RecommendationPriority;
  action: string;
  why: string;
  section: ResumeSectionKind | null;
  relatedSkill: string | null;
}

/** A concrete rewrite of one resume line. */
export interface BulletImprovement {
  /** The line exactly as it appears in the resume. */
  original: string;
  improved: string;
  why: string;
}

/**
 * Question categories (v2.0.0 of `resume_interview_questions`).
 *
 * `resume_based` is the old `gap_probe` renamed: it is still the question an
 * interviewer asks about something the resume does not evidence, which remains
 * the most useful prediction the deterministic engine enables.
 */
export const INTERVIEW_CATEGORIES = [
  "technical",
  "behavioural",
  "experience",
  "resume_based",
  "hr",
] as const;
export type InterviewQuestionCategory = (typeof INTERVIEW_CATEGORIES)[number];

/** Seniority the question is pitched at. Not a difficulty rating of the answer. */
export const INTERVIEW_DIFFICULTIES = ["junior", "mid", "senior"] as const;
export type InterviewDifficulty = (typeof INTERVIEW_DIFFICULTIES)[number];

export interface InterviewQuestion {
  question: string;
  category: InterviewQuestionCategory;
  difficulty: InterviewDifficulty;
  /** Why this posting and this resume make the question likely. */
  rationale: string;
}

export interface LinkedInSuggestions {
  headline: string;
  about: string;
  /** Skills worth listing, all drawn from what the parser detected. */
  skillsToFeature: string[];
  notes: string[];
}

/** The model's rewritten professional summary, plus what changed and why. */
export interface ResumeSummaryRewrite {
  original: string | null;
  rewritten: string;
  changes: string[];
}

/**
 * Everything the model contributes.
 *
 * Note what is absent: no score, no match percentage, no keyword coverage.
 * Those exist once, in the deterministic result.
 */
export interface AiResumeInsights {
  overallSummary: string;
  strengths: Strength[];
  weaknesses: Weakness[];
  criticalGaps: CriticalGap[];
  transferableSkills: TransferableSkill[];
  /** Always a subset of the deterministic engine's missing terms. */
  missingKeywords: string[];
  recommendations: AiRecommendation[];
  bulletImprovements: BulletImprovement[];
  interviewQuestions: InterviewQuestion[];
  linkedinSuggestions: LinkedInSuggestions | null;
  resumeSummaryRewrite: ResumeSummaryRewrite | null;
  /** 0–100. A judgement about outcome, NOT the ATS score. */
  overallHiringProbability: number;
  /** How the model reached that judgement. */
  reasoning: string;

  /** Provenance, matching every other AI-written record in this codebase. */
  aiProvider: string;
  aiModel: string;
  aiPromptVersion: string;
  generatedAt: string;
  /** Claims dropped because they were not grounded in deterministic evidence. */
  dropped: string[];
}

/**
 * What the UI renders.
 *
 * The deterministic analysis is carried by reference and untouched. If the AI
 * call fails, `ai` is null and the page still shows a complete, correct score —
 * enrichment degrades, the product does not.
 */
export interface UnifiedAnalysis {
  deterministic: ResumeAnalysis;
  ai: AiResumeInsights | null;
}

/** Which enrichment calls to make. Each is a separate billed request. */
export interface InsightOptions {
  /** Interview questions, LinkedIn copy and the summary rewrite. */
  includeEnrichment?: boolean;
}

/**
 * Everything the enrichment calls need, assembled once from the deterministic
 * result so each generator renders its prompt from the same bounded material.
 *
 * Skill lists carry display labels rather than canonical ids: the model writes
 * copy the operator will paste into a profile, and `ci_cd` is not a phrase
 * anyone puts on a resume.
 */
export interface InsightRequest {
  ownerId: string;
  /** Resume text, already bounded by the service. */
  resumeText: string;
  /** Job description text, already bounded by the service. */
  jobDescriptionText: string;
  jobTitle: string;
  company: string | null;
  candidateName: string | null;
  /** The resume's existing professional summary, when it has one. */
  currentSummary: string | null;
  detectedSkills: string[];
  missingSkills: string[];
  /** Detected skills this posting actually asked for. */
  matchedSkills: string[];
  responsibilities: string[];
  jobKeywords: string[];
}
