/**
 * Deterministic scoring (Resume AI · Phase 3).
 *
 * Pure arithmetic over the matching results. The same inputs always produce the
 * same score, and every category explains itself in a sentence the operator can
 * check against their own resume.
 *
 * Two principles the numbers follow:
 *
 *   1. REQUIRED SKILLS DOMINATE THE SKILLS SCORE. A resume matching every
 *      nice-to-have and no must-have has not matched the job. Required skills
 *      therefore carry the large majority of the category, and preferred ones
 *      top it up.
 *
 *   2. A CATEGORY THE POSTING DID NOT SPECIFY IS NOT A FAILURE. If a posting
 *      names no degree, scoring education as 0 would punish the candidate for
 *      the employer's silence. Unspecified categories score full marks and say
 *      so in their detail, and the missing signal is charged to CONFIDENCE
 *      instead — which is what confidence is for.
 */

import type {
  AnalysisConfidence,
  EducationMatch,
  ExperienceMatch,
  JobDescriptionAnalysis,
  KeywordMatch,
  MatchedRequirement,
  MissingSkill,
  ScoreBreakdown,
  ScoreCategory,
  SkillMatch,
} from "@/types/resume-analysis";

/** Category weights. Must sum to 1. */
export const WEIGHTS: Record<ScoreCategory, number> = {
  skills: 0.35,
  experience: 0.3,
  education: 0.1,
  keywords: 0.15,
  responsibilities: 0.1,
};

/** Share of the skills score carried by required skills. */
const REQUIRED_SHARE = 0.8;

/** A `related` match is real evidence but weaker than naming the skill. */
const RELATED_CREDIT = 0.6;

/** Bumped whenever weights or formulas change. */
export const ENGINE_VERSION = "1.0.0";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pct(value: number): number {
  return Math.round(value * 100);
}

/**
 * Skills, weighted toward what the posting called essential.
 *
 * Each side is scored independently and blended, so a candidate cannot offset a
 * missing must-have by matching many nice-to-haves.
 */
export function scoreSkills(
  matches: SkillMatch[],
  missing: MissingSkill[],
  jd: JobDescriptionAnalysis,
): ScoreBreakdown {
  const credit = (list: SkillMatch[]) =>
    list.reduce((sum, match) => sum + (match.matchedVia === "related" ? RELATED_CREDIT : 1), 0);

  const requiredTotal = jd.requiredSkills.length;
  const preferredTotal = jd.preferredSkills.length;

  const requiredCredit = credit(matches.filter((m) => m.importance === "required"));
  const preferredCredit = credit(matches.filter((m) => m.importance === "preferred"));

  // Nothing named at all: the posting gives skills no basis to be scored on, so
  // this category abstains rather than inventing a verdict.
  if (requiredTotal === 0 && preferredTotal === 0) {
    return {
      category: "skills",
      weight: WEIGHTS.skills,
      score: 100,
      contribution: 100 * WEIGHTS.skills,
      detail: "The posting named no specific skills, so this category could not distinguish.",
    };
  }

  const requiredRatio = requiredTotal === 0 ? null : requiredCredit / requiredTotal;
  const preferredRatio = preferredTotal === 0 ? null : preferredCredit / preferredTotal;

  let ratio: number;
  if (requiredRatio === null) ratio = preferredRatio ?? 0;
  else if (preferredRatio === null) ratio = requiredRatio;
  else ratio = requiredRatio * REQUIRED_SHARE + preferredRatio * (1 - REQUIRED_SHARE);

  const score = clamp(ratio * 100);
  const missingRequired = missing.filter((m) => m.importance === "required").length;

  const detail =
    requiredTotal === 0
      ? `Matched ${matches.length} of ${preferredTotal} preferred skills.`
      : `Matched ${requiredTotal - missingRequired} of ${requiredTotal} required skills` +
        (preferredTotal > 0
          ? `, and ${matches.filter((m) => m.importance === "preferred").length} of ${preferredTotal} preferred.`
          : ".");

  return { category: "skills", weight: WEIGHTS.skills, score, contribution: score * WEIGHTS.skills, detail };
}

/**
 * Experience against the posting's stated minimum.
 *
 * Falling short scores proportionally rather than zero — six years against a
 * seven-year ask is a near miss, and a cliff edge there would misrepresent it.
 * Exceeding the ask earns full marks and no more; there is no bonus for being
 * over-qualified because the posting expressed no preference for it.
 */
export function scoreExperience(experience: ExperienceMatch): ScoreBreakdown {
  const { requiredYears, resumeYears } = experience;

  if (requiredYears === null) {
    return {
      category: "experience",
      weight: WEIGHTS.experience,
      score: 100,
      contribution: 100 * WEIGHTS.experience,
      detail: "The posting did not state a minimum number of years.",
    };
  }

  if (resumeYears === null) {
    // The posting asked and the resume does not answer. Scored at half rather
    // than zero: the years are probably there and simply not stated in a form
    // this parser recognises, and confidence records the uncertainty.
    return {
      category: "experience",
      weight: WEIGHTS.experience,
      score: 50,
      contribution: 50 * WEIGHTS.experience,
      detail: `The posting asks for ${requiredYears}+ years, but no total could be read from the resume.`,
    };
  }

  const score = clamp(Math.min(1, resumeYears / requiredYears) * 100);
  const detail =
    resumeYears >= requiredYears
      ? `${resumeYears} years evidenced against ${requiredYears} required.`
      : `${resumeYears} years evidenced, ${requiredYears} required — short by ${requiredYears - resumeYears}.`;

  return { category: "experience", weight: WEIGHTS.experience, score, contribution: score * WEIGHTS.experience, detail };
}

/** Education, as a level comparison. */
export function scoreEducation(education: EducationMatch): ScoreBreakdown {
  if (education.requiredLevel === "none") {
    return {
      category: "education",
      weight: WEIGHTS.education,
      score: 100,
      contribution: 100 * WEIGHTS.education,
      detail: "The posting did not state an education requirement.",
    };
  }

  const score = education.meets ? 100 : 40;
  const detail = education.meets
    ? `Resume evidences ${education.resumeLevel} level against a ${education.requiredLevel} requirement.`
    : `The posting asks for ${education.requiredLevel} level; the resume evidences ${education.resumeLevel}.`;

  return { category: "education", weight: WEIGHTS.education, score, contribution: score * WEIGHTS.education, detail };
}

/** Keyword coverage, straight through. */
export function scoreKeywords(keywords: KeywordMatch): ScoreBreakdown {
  const total = keywords.matched.length + keywords.missing.length;

  if (total === 0) {
    return {
      category: "keywords",
      weight: WEIGHTS.keywords,
      score: 100,
      contribution: 100 * WEIGHTS.keywords,
      detail: "No keywords could be extracted from the posting.",
    };
  }

  const score = clamp(keywords.coverage * 100);
  return {
    category: "keywords",
    weight: WEIGHTS.keywords,
    score,
    contribution: score * WEIGHTS.keywords,
    detail: `The resume uses ${keywords.matched.length} of the posting's ${total} significant terms (${pct(keywords.coverage)}%).`,
  };
}

/** Responsibility coverage. */
export function scoreResponsibilities(requirements: MatchedRequirement[]): ScoreBreakdown {
  if (requirements.length === 0) {
    return {
      category: "responsibilities",
      weight: WEIGHTS.responsibilities,
      score: 100,
      contribution: 100 * WEIGHTS.responsibilities,
      detail: "No responsibilities section was recognised in the posting.",
    };
  }

  const covered = requirements.filter((requirement) => requirement.matched).length;
  const score = clamp((covered / requirements.length) * 100);

  return {
    category: "responsibilities",
    weight: WEIGHTS.responsibilities,
    score,
    contribution: score * WEIGHTS.responsibilities,
    detail: `The resume evidences ${covered} of ${requirements.length} listed responsibilities.`,
  };
}

/**
 * How well the inputs supported the analysis.
 *
 * Every abstaining category costs confidence. This is where "the posting told
 * us nothing" is recorded, so that a full-marks category from silence never
 * reads as a genuine match.
 */
export function computeConfidence(
  jd: JobDescriptionAnalysis,
  experience: ExperienceMatch,
  requirements: MatchedRequirement[],
  resumeLineCount: number,
): AnalysisConfidence {
  const reasons: string[] = [];
  let value = 1;

  if (jd.requiredSkills.length === 0) {
    value -= 0.3;
    reasons.push("The posting named no recognisable required skills.");
  } else if (jd.requiredSkills.length < 3) {
    value -= 0.1;
    reasons.push("The posting named very few required skills.");
  }

  if (requirements.length === 0) {
    value -= 0.15;
    reasons.push("No responsibilities were listed to compare against.");
  }

  if (jd.minYearsExperience !== null && experience.resumeYears === null) {
    value -= 0.2;
    reasons.push("The resume states no total years of experience.");
  }

  if (experience.derivedFrom === "date_ranges") {
    value -= 0.1;
    reasons.push("Years of experience were inferred from dates rather than stated.");
  }

  if (resumeLineCount < 10) {
    value -= 0.2;
    reasons.push("The resume produced very little text to analyse.");
  }

  return { value: Math.max(0, Math.round(value * 100) / 100), reasons };
}

/** Weighted total of the five categories, 0–100. */
export function overallScore(breakdown: ScoreBreakdown[]): number {
  return clamp(breakdown.reduce((sum, entry) => sum + entry.contribution, 0));
}
