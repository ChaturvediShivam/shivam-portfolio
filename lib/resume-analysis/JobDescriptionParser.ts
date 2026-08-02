/**
 * Job description parsing (Resume AI · Phase 3).
 *
 * Turns raw posting text into `JobDescriptionAnalysis` using the same
 * deterministic approach `lib/resume/sections.ts` uses on resumes: postings are
 * written to a convention, and a lookup table reads that convention more
 * consistently than a guess would.
 *
 * The one structural judgement is required-versus-preferred. A posting signals
 * it with a heading — "Requirements", "Nice to Have", "Bonus" — so skills are
 * attributed by the block they appear under. Anything before the first
 * recognised heading counts as required: postings routinely open with "You will
 * need strong Go and Postgres" and never label it.
 *
 * Bias is toward classifying a skill as REQUIRED when the section is ambiguous.
 * Over-stating a requirement makes the score conservative; under-stating one
 * would hide a genuine gap, which is the more expensive mistake for someone
 * deciding whether to apply.
 */

import { normalizeText } from "@/lib/resume/normalize";
import { extractKeywords, significantTokens } from "./KeywordExtractor";
import { detectSkills, skillLabel } from "./SkillMatcher";
import {
  EDUCATION_LEVELS,
  type EducationLevel,
  type JobDescriptionAnalysis,
  type RequiredSkill,
  type RequirementImportance,
} from "@/types/resume-analysis";

/** Headings that open a block of essential requirements. */
const REQUIRED_HEADINGS = [
  "requirements","required","required skills","must have","must haves","must-have","must-haves",
  "what you need","what you will need","what we are looking for","qualifications",
  "minimum qualifications","basic qualifications","essential","essential skills","you have",
  "who you are","key skills","technical requirements",
];

/** Headings that open a block of desirable-but-optional requirements. */
const PREFERRED_HEADINGS = [
  "nice to have","nice-to-have","nice to haves","nice-to-have skills","preferred",
  "preferred skills","preferred qualifications","bonus","bonus points","desirable",
  "good to have","pluses","it would be great if","additionally","advantageous",
];

/** Headings that open the duties block. */
const RESPONSIBILITY_HEADINGS = [
  "responsibilities","key responsibilities","what you will do","what you'll do","the role",
  "duties","your role","day to day","about the role","in this role","you will",
];

/** Headings whose content is not about the candidate at all. */
const IGNORED_HEADINGS = [
  "about the company","about us","about","benefits","perks","what we offer","compensation",
  "salary","equal opportunity","eeo","diversity","how to apply","our mission","why join us",
];

type BlockKind = "required" | "preferred" | "responsibilities" | "ignored" | "unknown";

/**
 * Heading tables are normalized at load rather than hand-written in normalized
 * form.
 *
 * `normalizeHeading` turns hyphens into spaces, so an entry written as
 * "nice-to-have skills" could never match a line that normalizes to
 * "nice to have skills" — the table would silently never fire. Running the
 * tables through the same function that processes the input removes the whole
 * class of mismatch and lets the lists above be written the way a human would.
 */
function normalizeAll(headings: string[]): Set<string> {
  return new Set(headings.map(normalizeHeading));
}

/** Longest heading we will entertain, mirroring the resume parser's bound. */
const MAX_HEADING_CHARS = 60;

/** Normalize a line to the form the heading tables are written in. */
function normalizeHeading(line: string): string {
  return line
    .trim()
    .replace(/[:：.\-–—_|]+$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 &'/+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which block a line opens, or null when it opens none. */
export function headingKind(line: string): BlockKind | null {
  if (line.length > MAX_HEADING_CHARS) return null;
  const normalized = normalizeHeading(line);
  if (!normalized) return null;

  // Preferred is tested first: "preferred qualifications" would otherwise be
  // caught by nothing, and a posting using both "Qualifications" and
  // "Preferred Qualifications" must not collapse them into one block.
  if (PREFERRED_SET.has(normalized)) return "preferred";
  if (REQUIRED_SET.has(normalized)) return "required";
  if (RESPONSIBILITY_SET.has(normalized)) return "responsibilities";
  if (IGNORED_SET.has(normalized)) return "ignored";
  return null;
}

const REQUIRED_SET = normalizeAll(REQUIRED_HEADINGS);
const PREFERRED_SET = normalizeAll(PREFERRED_HEADINGS);
const RESPONSIBILITY_SET = normalizeAll(RESPONSIBILITY_HEADINGS);
const IGNORED_SET = normalizeAll(IGNORED_HEADINGS);

interface Block {
  kind: BlockKind;
  lines: string[];
}

/** Split the posting into labelled blocks. */
function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  // Everything before the first heading is treated as required — see the note
  // at the top of this file.
  let current: Block = { kind: "required", lines: [] };

  for (const line of lines) {
    const kind = headingKind(line);
    if (kind) {
      if (current.lines.length > 0) blocks.push(current);
      current = { kind, lines: [] };
      continue;
    }
    current.lines.push(line);
  }

  if (current.lines.length > 0) blocks.push(current);
  return blocks;
}

/**
 * The whole line containing a character offset.
 *
 * Evidence is shown to the operator, so it has to be a sentence they can
 * recognise from their own document. A fixed character window around the match
 * produces fragments like "123 | London, UK\nPROFESSIONAL SUMMARY\nBackend
 * engineer with eight years" — three partial lines spliced together, which
 * reads as corruption rather than as a quotation.
 */
function lineContaining(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end).trim();
}

/** Number words a posting might spell out instead of using a digit. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};

/**
 * The smallest number of years the posting asks for.
 *
 * The minimum rather than the first match: a posting saying "5+ years overall,
 * 3+ in Go" is satisfied at 3 for the specific skill and 5 overall, and taking
 * the lower figure keeps the requirement from being overstated. Ranges
 * ("3-5 years") resolve to their lower bound for the same reason.
 */
export function extractYearsRequired(text: string): { years: number | null; evidence: string | null } {
  const lower = text.toLowerCase();
  const pattern =
    /(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*(?:\+)?\s*years?|(\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b)\s*(?:\+)?\s*years?/g;

  let best: number | null = null;
  let evidence: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(lower)) !== null) {
    const value = match[1] ? Number(match[1]) : NUMBER_WORDS[match[2]];
    if (!Number.isFinite(value) || value <= 0 || value > 50) continue;
    if (best === null || value < best) {
      best = value;
      evidence = lineContaining(text, match.index);
    }
  }

  return { years: best, evidence };
}

const DEGREE_PATTERNS: [EducationLevel, RegExp][] = [
  ["doctorate", /\b(ph\.?d|doctorate|doctoral)\b/i],
  ["master", /\b(m\.?sc|m\.?s\b|master'?s?|mba|m\.?eng|m\.?a\b)\b/i],
  ["bachelor", /\b(b\.?sc|b\.?s\b|bachelor'?s?|b\.?eng|b\.?a\b|undergraduate degree)\b/i],
  ["associate", /\b(associate'?s? degree|a\.?a\b|a\.?s\b)\b/i],
  ["certificate", /\b(certificate|diploma|bootcamp)\b/i],
];

/** Highest degree level named in the text. */
export function extractEducationLevel(text: string): { level: EducationLevel; evidence: string | null } {
  for (const [level, pattern] of DEGREE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { level, evidence: lineContaining(text, match.index) };
  }
  return { level: "none", evidence: null };
}

const CERTIFICATION_PATTERN =
  /\b((?:aws|azure|gcp|google cloud|cisco|comptia|pmp|scrum|kubernetes|oracle|salesforce)[^.,;\n]{0,60}?(?:certified|certification|certificate)[^.,;\n]{0,40}|certified[^.,;\n]{0,60})/gi;

/** Certification names the posting mentions, deduplicated. */
export function extractCertifications(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(CERTIFICATION_PATTERN);

  while ((match = pattern.exec(text)) !== null) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value.length >= 6 && value.length <= 90) found.add(value);
  }

  return [...found];
}

/**
 * The posting's job title.
 *
 * Read from the first line only. Postings put the title there essentially
 * always, and scanning further reliably picks up a sentence containing a role
 * word instead — worse than reporting nothing.
 */
export function extractTitle(lines: string[]): string | null {
  const first = lines[0]?.trim();
  if (!first || first.length > 90) return null;
  if (/[.!?]$/.test(first)) return null;
  return first;
}

/** A company named by an explicit "at X" / "Company: X" construction. */
export function extractCompany(lines: string[]): string | null {
  for (const line of lines.slice(0, 8)) {
    const explicit = /^(?:company|employer|organisation|organization)\s*[:\-]\s*(.+)$/i.exec(line.trim());
    if (explicit) return explicit[1].trim().slice(0, 80) || null;
  }

  for (const line of lines.slice(0, 4)) {
    const at = /\bat\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/.exec(line);
    if (at) return at[1].trim();
  }

  return null;
}

/** Build the skill list for one importance level, with evidence. */
function skillsFromBlocks(blocks: Block[], kind: BlockKind, importance: RequirementImportance): RequiredSkill[] {
  const collected = new Map<string, RequiredSkill>();

  for (const block of blocks) {
    if (block.kind !== kind) continue;
    for (const line of block.lines) {
      for (const id of detectSkills(line)) {
        if (!collected.has(id)) {
          collected.set(id, { skill: id, displayName: skillLabel(id), importance, evidence: line });
        }
      }
    }
  }

  return [...collected.values()];
}

/** Lines that read as duties rather than prose. */
function responsibilitiesFromBlocks(blocks: Block[]): string[] {
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.kind !== "responsibilities") continue;
    for (const line of block.lines) {
      const cleaned = line.replace(/^[-•*\d.)\s]+/, "").trim();
      // Too short to carry a duty, or so long it is a paragraph of context.
      if (cleaned.length < 15 || cleaned.length > 220) continue;
      lines.push(cleaned);
    }
  }

  return lines;
}

/** Parse raw job description text into its structured form. */
export function parseJobDescription(raw: string): JobDescriptionAnalysis {
  const { text, lines } = normalizeText(raw);
  const warnings: string[] = [];

  const blocks = toBlocks(lines);

  const requiredSkills = skillsFromBlocks(blocks, "required", "required");
  const preferredSkills = skillsFromBlocks(blocks, "preferred", "preferred");

  // A skill named in both blocks is required — the stronger claim wins, and
  // listing it twice would double-count it in scoring.
  const requiredIds = new Set(requiredSkills.map((skill) => skill.skill));
  const preferredOnly = preferredSkills.filter((skill) => !requiredIds.has(skill.skill));

  const responsibilities = responsibilitiesFromBlocks(blocks);

  // Education, certifications and years are read from the candidate-facing
  // blocks only. A benefits section mentioning "certification budget" or an
  // about-us paragraph saying "ten years in business" would otherwise be read
  // as requirements.
  const candidateText = blocks
    .filter((block) => block.kind !== "ignored")
    .flatMap((block) => block.lines)
    .join("\n");

  const years = extractYearsRequired(candidateText);
  const education = extractEducationLevel(candidateText);

  if (requiredSkills.length === 0) {
    warnings.push("No recognised skills were found in the requirements. Scoring will lean on keywords.");
  }
  if (responsibilities.length === 0) {
    warnings.push("No responsibilities section was recognised.");
  }

  return {
    title: extractTitle(lines),
    company: extractCompany(lines),
    requiredSkills,
    preferredSkills: preferredOnly,
    responsibilities,
    education: { level: education.level, evidence: education.evidence },
    certifications: extractCertifications(candidateText),
    minYearsExperience: years.years,
    keywords: extractKeywords(candidateText, 25).map((keyword) => keyword.term),
    warnings,
  };
}

/** Ordering helper so callers never compare education levels by string. */
export function educationRank(level: EducationLevel): number {
  return EDUCATION_LEVELS.indexOf(level);
}

/** Exported for tests: the significant-token view the matcher uses. */
export { significantTokens };
export { normalizeText as normalizeJobDescription };
