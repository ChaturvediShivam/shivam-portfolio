/**
 * Resume analysis domain (Resume AI · Phase 3).
 *
 * The deterministic half of the analyzer. Everything here is computed from the
 * parsed resume and the parsed job description by pure functions — no model is
 * involved, and none is needed to produce any field below.
 *
 * This supersedes the placeholder `ResumeAnalysis` declared in `types/resume.ts`
 * during Phase 1. The change is deliberate and is the central architectural
 * decision of this phase: the analysis is no longer something an LLM *produces*,
 * it is something an LLM later *enriches*. Scores, matches and gaps are
 * arithmetic over evidence, which makes them reproducible, free, instant, and
 * auditable — properties a generated number cannot have. The model's eventual
 * job is narrative and advice, layered on top via `Recommendation`.
 *
 * Every match carries its evidence. A score the operator cannot trace back to a
 * line of their own resume is a number they have no reason to trust.
 */

import type { ResumeSectionKind } from "@/types/resume";

// ---------------------------------------------------------------------------
// Job description
// ---------------------------------------------------------------------------

/** Whether the job description presented something as essential or desirable. */
export type RequirementImportance = "required" | "preferred";

/** Degree levels, ordered — the index is the comparison. */
export const EDUCATION_LEVELS = ["none", "certificate", "associate", "bachelor", "master", "doctorate"] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/** One skill named by the job description. */
export interface RequiredSkill {
  /** Canonical id, e.g. `postgresql`. */
  skill: string;
  /** How the job description wrote it, for display. */
  displayName: string;
  importance: RequirementImportance;
  /** The line it was found on, so a wrong extraction is diagnosable. */
  evidence: string;
}

/** Structured view of a job description, parsed deterministically. */
export interface JobDescriptionAnalysis {
  title: string | null;
  company: string | null;
  requiredSkills: RequiredSkill[];
  preferredSkills: RequiredSkill[];
  responsibilities: string[];
  education: {
    level: EducationLevel;
    /** The line the level was read from. */
    evidence: string | null;
  };
  certifications: string[];
  /** Minimum years the posting asks for, when it states one. */
  minYearsExperience: number | null;
  /** Ranked terms, most significant first. */
  keywords: string[];
  /** Non-fatal observations — e.g. no requirements section found. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * How a skill was recognised.
 *
 * Recorded rather than collapsed to a boolean because the three are not equally
 * strong: an `alias` match (k8s → kubernetes) is as good as exact, while
 * `related` is a weaker signal that the UI should present differently.
 */
export type SkillMatchKind = "exact" | "alias" | "related";

export interface SkillMatch {
  skill: string;
  displayName: string;
  importance: RequirementImportance;
  matchedVia: SkillMatchKind;
  /** The resume line the skill was found on. */
  evidence: string;
  /** Which section that line came from. */
  section: ResumeSectionKind;
}

export interface MissingSkill {
  skill: string;
  displayName: string;
  importance: RequirementImportance;
  /** The job description line that asked for it. */
  requestedIn: string;
}

/** One responsibility from the posting, and whether the resume evidences it. */
export interface MatchedRequirement {
  requirement: string;
  matched: boolean;
  /** The resume line that best supports it, when one does. */
  evidence: string | null;
  /** Proportion of the requirement's significant terms found, 0–1. */
  overlap: number;
}

export interface ExperienceMatch {
  /** Years the posting asks for, or null when it does not say. */
  requiredYears: number | null;
  /** Years evidenced by the resume, or null when none could be derived. */
  resumeYears: number | null;
  /** How the resume figure was arrived at, for the operator to sanity-check. */
  derivedFrom: "explicit_statement" | "date_ranges" | "none";
  meets: boolean | null;
  evidence: string | null;
}

export interface EducationMatch {
  requiredLevel: EducationLevel;
  resumeLevel: EducationLevel;
  meets: boolean;
  evidence: string | null;
}

export interface KeywordMatch {
  matched: string[];
  missing: string[];
  /** Proportion of the posting's keywords present in the resume, 0–1. */
  coverage: number;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const SCORE_CATEGORIES = [
  "skills",
  "experience",
  "education",
  "keywords",
  "responsibilities",
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export interface ScoreBreakdown {
  category: ScoreCategory;
  /** Share of the overall score, 0–1. The five sum to 1. */
  weight: number;
  /** This category in isolation, 0–100. */
  score: number;
  /** `score * weight`, the points contributed to the overall. */
  contribution: number;
  /** Plain sentence explaining how the score was reached. */
  detail: string;
}

/**
 * How much the inputs supported the analysis, 0–1.
 *
 * Distinct from the score. A resume can score 20 with high confidence (it
 * genuinely does not match) or score 80 with low confidence (the posting listed
 * almost nothing to match against). Reporting the two separately stops a
 * confident-looking number resting on thin evidence.
 */
export interface AnalysisConfidence {
  value: number;
  /** What limited it, when it is not 1. */
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Recommendations — INTERFACES ONLY. Produced by the AI layer in a later step.
// ---------------------------------------------------------------------------

export type RecommendationKind =
  | "add_skill"
  | "surface_skill"
  | "quantify_impact"
  | "reword_section"
  | "address_gap";

/**
 * Advice about the resume.
 *
 * Declared now, produced later. Nothing in Phase 3 emits one: every field here
 * requires judgement rather than arithmetic, which is precisely the boundary
 * between what this phase computes and what the model will add.
 */
export interface Recommendation {
  kind: RecommendationKind;
  /** One-line instruction to the operator. */
  headline: string;
  /** Why it matters, grounded in the analysis. */
  rationale: string;
  /** The section it applies to, when it applies to one. */
  section: ResumeSectionKind | null;
  /** The analysis finding that motivated it, for traceability. */
  relatedSkill: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  aiPromptVersion: string | null;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface AnalysisSummary {
  /** One factual sentence. Composed from counts, never generated. */
  headline: string;
  matchedRequiredSkills: number;
  totalRequiredSkills: number;
  matchedPreferredSkills: number;
  totalPreferredSkills: number;
  missingRequiredSkills: number;
  responsibilitiesCovered: number;
  totalResponsibilities: number;
}

export interface ResumeAnalysis {
  /** 0–100, the weighted sum of `breakdown`. */
  overallScore: number;
  breakdown: ScoreBreakdown[];
  confidence: AnalysisConfidence;

  skillMatches: SkillMatch[];
  missingSkills: MissingSkill[];
  matchedRequirements: MatchedRequirement[];
  experience: ExperienceMatch;
  education: EducationMatch;
  keywords: KeywordMatch;

  summary: AnalysisSummary;

  /**
   * Empty in Phase 3 — the field exists so the UI that renders advice is
   * written once, against a shape the AI step will fill rather than change.
   */
  recommendations: Recommendation[];

  /** Bumped when scoring changes, so an old score is never silently compared. */
  engineVersion: string;
  generatedAt: string;
}
