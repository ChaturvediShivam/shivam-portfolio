import "server-only";
import type { ResumeSectionKind } from "@/types/resume";
import { RESUME_SECTION_KINDS } from "@/types/resume";
import type { ParsedResume } from "@/types/resume";
import type { JobDescriptionAnalysis, MissingSkill, ResumeAnalysis } from "@/types/resume-analysis";
import { detectSkills, skillLabel } from "@/lib/resume-analysis/SkillMatcher";

/**
 * Grounding primitives (Resume AI · Phase 3 · Step 2).
 *
 * The prompt asks the model not to invent. This file is what makes that true
 * regardless of whether it complied.
 *
 * Every claim the model returns is checked against the deterministic result
 * before it reaches the operator: evidence must appear in the supplied text,
 * skills must be ones the parser detected or reported missing, keywords must be
 * ones the engine already found absent. Anything that fails is discarded and
 * recorded in `dropped`, which is how a drifting model becomes visible instead
 * of merely plausible.
 *
 * It lives in its own module rather than inside `ResumeInsightsService` because
 * every analyzer needs it and the service imports every analyzer — putting it
 * there would make the import graph a cycle.
 */

/** What a claim may be grounded against. Built once per analysis. */
export interface GroundingContext {
  /** Normalized resume + posting text, for verbatim evidence checks. */
  corpus: string;
  /** Canonical ids the parser detected in the resume. */
  detected: Set<string>;
  /** Skills the posting asked for and the resume lacks, by canonical id. */
  missingSkills: Map<string, MissingSkill>;
  /** Keyword terms the engine reported absent, normalized. */
  missingKeywords: Map<string, string>;
  /** Resume lines, for locating a bullet the model proposes rewriting. */
  resumeLines: string[];
}

/**
 * Shortest evidence string accepted.
 *
 * Below this a quote is not evidence — "and" or "led" appears in every resume,
 * so a substring check would pass for a claim that rests on nothing.
 */
const MIN_EVIDENCE_CHARS = 12;

/** Ceiling on a model-authored phrase, guarding pathological output. */
const MAX_TEXT_CHARS = 600;

/** Ceiling on a model-authored passage — a cover letter, an About section. */
const MAX_PROSE_CHARS = 4000;

/** Casefold, strip punctuation, collapse whitespace. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildGroundingContext(
  resume: ParsedResume,
  jd: JobDescriptionAnalysis,
  analysis: ResumeAnalysis,
): GroundingContext {
  const jdText = [
    jd.title ?? "",
    ...jd.requiredSkills.map((s) => s.evidence),
    ...jd.preferredSkills.map((s) => s.evidence),
    ...jd.responsibilities,
    ...jd.certifications,
  ].join("\n");

  return {
    corpus: normalize(`${resume.text}\n${jdText}`),
    // Every skill the parser finds anywhere in the resume, not only the ones
    // this posting asked about. A transferable skill legitimately starts from
    // something the posting never mentioned — that is the whole point of it.
    detected: new Set(detectSkills(resume.text)),
    missingSkills: new Map(analysis.missingSkills.map((m) => [m.skill, m])),
    missingKeywords: new Map(analysis.keywords.missing.map((term) => [normalize(term), term])),
    resumeLines: resume.lines,
  };
}

/** A non-empty string of bounded length, or null. */
export function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_TEXT_CHARS ? `${trimmed.slice(0, MAX_TEXT_CHARS - 1)}…` : trimmed;
}

/**
 * A multi-paragraph passage, or null.
 *
 * Unlike `text`, this keeps line breaks: a cover letter without its paragraph
 * boundaries is not a cover letter. Runs of blank lines still collapse, and the
 * ceiling is far higher because these fields are meant to be long.
 */
export function prose(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_PROSE_CHARS ? `${trimmed.slice(0, MAX_PROSE_CHARS - 1)}…` : trimmed;
}

/**
 * Does this quote actually appear in what the model was shown?
 *
 * Substring-on-normalized rather than exact equality: models reflow whitespace
 * and drop a trailing bullet character even when instructed to copy verbatim,
 * and rejecting a real quote over a stray space would discard true findings.
 * What it will not tolerate is different words, which is the failure that
 * matters.
 */
export function isQuoted(value: string, ctx: GroundingContext): boolean {
  const candidate = normalize(value);
  return candidate.length >= MIN_EVIDENCE_CHARS && ctx.corpus.includes(candidate);
}

/** The resume line a proposed rewrite refers to, or null when it invented one. */
export function findResumeLine(value: string, ctx: GroundingContext): string | null {
  const candidate = normalize(value);
  if (candidate.length < MIN_EVIDENCE_CHARS) return null;
  return ctx.resumeLines.find((line) => normalize(line).includes(candidate)) ?? null;
}

/** A canonical skill id the parser detected, or null. */
export function detectedSkill(value: unknown, ctx: GroundingContext): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return ctx.detected.has(id) ? id : null;
}

/** A skill id the engine reported missing, or null. */
export function missingSkill(value: unknown, ctx: GroundingContext): MissingSkill | null {
  if (typeof value !== "string") return null;
  return ctx.missingSkills.get(value.trim().toLowerCase()) ?? null;
}

/**
 * A skill id the analysis mentions at all, detected or missing, or null.
 *
 * Used for the optional `relatedSkill` tag, where either side is legitimate: a
 * weakness is about a missing skill, a strength about a detected one.
 */
export function knownSkill(value: unknown, ctx: GroundingContext): string | null {
  return detectedSkill(value, ctx) ?? missingSkill(value, ctx)?.skill ?? null;
}

export function sectionKind(value: unknown): ResumeSectionKind | null {
  if (typeof value !== "string") return null;
  const kind = value.trim().toLowerCase();
  return (RESUME_SECTION_KINDS as readonly string[]).includes(kind)
    ? (kind as ResumeSectionKind)
    : null;
}

/** One of a fixed set, or null. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase() as T;
  return allowed.includes(candidate) ? candidate : null;
}

/** A 0–100 integer, or null when the model returned something else. */
export function percent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/** Array-shaped model output, bounded. Anything else becomes empty. */
export function items(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

export { skillLabel };
