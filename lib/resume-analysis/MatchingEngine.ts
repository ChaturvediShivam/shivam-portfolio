/**
 * Resume-to-posting matching (Resume AI · Phase 3).
 *
 * Pure functions over a `ParsedResume` and a `JobDescriptionAnalysis`. Every
 * result carries the evidence it was derived from, because the operator's next
 * question after any verdict is "where did you get that?" — and a match they
 * cannot check is a match they cannot act on.
 */

import { sectionOfKind, type ParsedResume, type ResumeSectionKind } from "@/types/resume";
import { coverageOf, significantTokens } from "./KeywordExtractor";
import { detectSkills, relate, skillLabel } from "./SkillMatcher";
import { educationRank, extractEducationLevel, extractYearsRequired } from "./JobDescriptionParser";
import type {
  EducationMatch,
  ExperienceMatch,
  JobDescriptionAnalysis,
  KeywordMatch,
  MatchedRequirement,
  MissingSkill,
  RequiredSkill,
  SkillMatch,
} from "@/types/resume-analysis";

/**
 * Proportion of a requirement's terms that must appear for it to count.
 *
 * Set at a half rather than higher because a resume restates a duty in its own
 * words — "owned reliability" against "you will be responsible for the
 * reliability of our services" shares the concept and little of the phrasing.
 * Demanding more would report almost every duty as unmet.
 */
const REQUIREMENT_OVERLAP_THRESHOLD = 0.5;

/** The section a line belongs to, for attributing evidence. */
function sectionForLine(parsed: ParsedResume, line: string): ResumeSectionKind {
  for (const section of parsed.sections) {
    if (section.lines.includes(line)) return section.kind;
  }
  return "other";
}

/** Compare one required skill against the resume. */
function matchSkill(
  required: RequiredSkill,
  resumeSkills: Set<string>,
  parsed: ParsedResume,
): SkillMatch | MissingSkill {
  const relation = relate(required.skill, resumeSkills);

  if (relation === "none") {
    return {
      skill: required.skill,
      displayName: required.displayName,
      importance: required.importance,
      requestedIn: required.evidence,
    };
  }

  const evidenceLine = parsed.lines.find((line) => detectSkills(line).includes(required.skill));

  // A `related` match has no line naming the skill directly — the evidence is
  // the line naming the skill that implies it.
  const impliedLine =
    evidenceLine ??
    parsed.lines.find((line) => {
      const found = detectSkills(line);
      return found.some((id) => relate(required.skill, new Set([id])) === "related");
    });

  return {
    skill: required.skill,
    displayName: required.displayName,
    importance: required.importance,
    matchedVia: relation === "exact" ? "exact" : "related",
    evidence: impliedLine ?? "",
    section: impliedLine ? sectionForLine(parsed, impliedLine) : "other",
  };
}

function isMatch(value: SkillMatch | MissingSkill): value is SkillMatch {
  return "matchedVia" in value;
}

export interface SkillComparison {
  matches: SkillMatch[];
  missing: MissingSkill[];
}

/** Compare every named skill, required and preferred, against the resume. */
export function compareSkills(parsed: ParsedResume, jd: JobDescriptionAnalysis): SkillComparison {
  const resumeSkills = new Set(detectSkills(parsed.text));
  const matches: SkillMatch[] = [];
  const missing: MissingSkill[] = [];

  for (const required of [...jd.requiredSkills, ...jd.preferredSkills]) {
    const result = matchSkill(required, resumeSkills, parsed);
    if (isMatch(result)) matches.push(result);
    else missing.push(result);
  }

  // Required first, then alphabetically — a stable order the UI can rely on.
  const byImportance = (a: { importance: string; displayName: string }, b: typeof a) =>
    (a.importance === b.importance ? 0 : a.importance === "required" ? -1 : 1) ||
    a.displayName.localeCompare(b.displayName);

  return { matches: matches.sort(byImportance), missing: missing.sort(byImportance) };
}

/**
 * Check each responsibility against the resume.
 *
 * Term overlap rather than semantics: the significant tokens of the duty are
 * looked for across the resume, and the best-covering line becomes the
 * evidence. This under-reports paraphrases, which is the honest direction —
 * claiming a duty is covered when nothing in the resume says so would be worse.
 */
export function compareResponsibilities(
  parsed: ParsedResume,
  jd: JobDescriptionAnalysis,
): MatchedRequirement[] {
  return jd.responsibilities.map((requirement) => {
    const terms = [...new Set(significantTokens(requirement))];

    if (terms.length === 0) {
      return { requirement, matched: false, evidence: null, overlap: 0 };
    }

    let bestOverlap = 0;
    let bestLine: string | null = null;

    for (const line of parsed.lines) {
      const lineTokens = new Set(significantTokens(line));
      if (lineTokens.size === 0) continue;

      const hits = terms.filter((term) => lineTokens.has(term)).length;
      const overlap = hits / terms.length;

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestLine = line;
      }
    }

    const matched = bestOverlap >= REQUIREMENT_OVERLAP_THRESHOLD;
    return {
      requirement,
      matched,
      evidence: matched ? bestLine : null,
      overlap: Math.round(bestOverlap * 100) / 100,
    };
  });
}

/** Month spans in a resume date range, e.g. `2021-2024` or `Jan 2021 - Present`. */
const DATE_RANGE =
  /\b(19|20)\d{2}\b\s*(?:-|–|—|to)\s*(?:\b(19|20)\d{2}\b|present|current|now)/gi;

/**
 * Years of experience the resume evidences.
 *
 * Two sources, preferring an explicit claim over inference. A resume saying
 * "eight years building payment systems" is stating a fact about itself;
 * summing date ranges is a reconstruction that double-counts overlapping roles
 * and misses work the candidate chose not to date. The explicit statement is
 * therefore trusted first, and the derivation is reported either way so the
 * operator can see which was used.
 */
export function compareExperience(
  parsed: ParsedResume,
  jd: JobDescriptionAnalysis,
): ExperienceMatch {
  const stated = extractYearsRequired(parsed.text);

  let resumeYears: number | null = null;
  let derivedFrom: ExperienceMatch["derivedFrom"] = "none";
  let evidence: string | null = null;

  if (stated.years !== null) {
    resumeYears = stated.years;
    derivedFrom = "explicit_statement";
    evidence = stated.evidence;
  } else {
    const experienceSection = sectionOfKind(parsed, "experience");
    const haystack = (experienceSection?.lines ?? parsed.lines).join("\n");

    let earliest: number | null = null;
    let latest: number | null = null;
    let match: RegExpExecArray | null;
    const pattern = new RegExp(DATE_RANGE);

    while ((match = pattern.exec(haystack)) !== null) {
      const years = match[0].match(/(19|20)\d{2}/g)?.map(Number) ?? [];
      const endsNow = /present|current|now/i.test(match[0]);
      const end = endsNow ? new Date().getFullYear() : Math.max(...years);

      for (const year of years) earliest = earliest === null ? year : Math.min(earliest, year);
      latest = latest === null ? end : Math.max(latest, end);
      if (!evidence) evidence = match[0];
    }

    if (earliest !== null && latest !== null && latest >= earliest) {
      // Span from first role to last, not the sum of roles — overlapping and
      // concurrent positions would otherwise inflate the total.
      resumeYears = latest - earliest;
      derivedFrom = "date_ranges";
    }
  }

  const requiredYears = jd.minYearsExperience;
  const meets =
    requiredYears === null ? null : resumeYears === null ? null : resumeYears >= requiredYears;

  return { requiredYears, resumeYears, derivedFrom, meets, evidence };
}

/** Compare the highest degree the resume evidences against the posting's. */
export function compareEducation(parsed: ParsedResume, jd: JobDescriptionAnalysis): EducationMatch {
  const educationSection = sectionOfKind(parsed, "education");
  const source = educationSection ? educationSection.lines.join("\n") : parsed.text;
  const found = extractEducationLevel(source);

  return {
    requiredLevel: jd.education.level,
    resumeLevel: found.level,
    // No stated requirement is satisfied by anything, including nothing.
    meets: educationRank(found.level) >= educationRank(jd.education.level),
    evidence: found.evidence,
  };
}

/** Proportion of the posting's keywords the resume uses. */
export function compareKeywords(parsed: ParsedResume, jd: JobDescriptionAnalysis): KeywordMatch {
  const { matched, missing } = coverageOf(jd.keywords, parsed.text);
  const total = jd.keywords.length;

  return {
    matched,
    missing,
    coverage: total === 0 ? 0 : Math.round((matched.length / total) * 100) / 100,
  };
}

/** Convenience for the UI: a skill's display name from its canonical id. */
export { skillLabel };
