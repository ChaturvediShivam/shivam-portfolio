/**
 * Section detection (Resume AI · Phase 2).
 *
 * Deterministic and dependency-free — no model is involved, by requirement and
 * by preference: a resume's structure is a formatting convention, and a lookup
 * table gets it right more consistently than a probabilistic guess, for free
 * and instantly.
 *
 * The whole problem is deciding which lines are headings. Resumes are laid out
 * for humans, so a heading is signalled visually — bold, larger, alone on its
 * line — and every one of those signals is gone by the time the text is
 * extracted. What survives is: headings are short, they sit alone, they use a
 * small vocabulary, and they do not read as sentences. Those are the tests
 * below.
 *
 * The bias is deliberately toward *missing* a heading rather than inventing
 * one. A missed heading merges two sections and leaves the text intact; a false
 * heading splits a bullet list mid-way and makes the content look truncated.
 */

import type { ResumeSection, ResumeSectionKind } from "@/types/resume";

/**
 * Heading vocabulary, most specific first within each kind.
 *
 * Matched against the normalized heading text, so entries are lowercase and
 * punctuation-free. Order across kinds matters where vocabularies overlap:
 * "technical skills" must be tested before "technical" would ever reach
 * experience.
 */
const SECTION_KEYWORDS: [ResumeSectionKind, string[]][] = [
  [
    "summary",
    [
      "professional summary",
      "career summary",
      "executive summary",
      "career objective",
      "professional profile",
      "summary of qualifications",
      "summary",
      "objective",
      "profile",
      "about me",
      "about",
      "overview",
    ],
  ],
  [
    "skills",
    [
      "technical skills",
      "core competencies",
      "core skills",
      "key skills",
      "areas of expertise",
      "technologies",
      "tech stack",
      "technical proficiencies",
      "competencies",
      "skills",
      "expertise",
      "tools",
    ],
  ],
  [
    "experience",
    [
      "professional experience",
      "work experience",
      "employment history",
      "work history",
      "career history",
      "relevant experience",
      "industry experience",
      "experience",
      "employment",
  ],
  ],
  [
    "education",
    [
      "education and training",
      "academic background",
      "academic qualifications",
      "educational background",
      "education",
      "academics",
      "qualifications",
    ],
  ],
  [
    "projects",
    [
      "selected projects",
      "personal projects",
      "side projects",
      "key projects",
      "notable projects",
      "projects",
      "portfolio",
    ],
  ],
  [
    "certifications",
    [
      "certifications and licenses",
      "licenses and certifications",
      "certifications",
      "certificates",
      "accreditations",
      "licenses",
      "courses",
      "training",
    ],
  ],
];

/** Longest heading we will entertain. Beyond this it is prose. */
const MAX_HEADING_CHARS = 60;

/** Words beyond which a short line is a sentence, not a label. */
const MAX_HEADING_WORDS = 6;

/**
 * Reduce a line to the form the vocabulary is written in.
 *
 * Trailing colons, surrounding punctuation and letter-spacing (`S K I L L S`,
 * which PDF extraction produces from tracked-out headings) all disappear.
 */
export function normalizeHeading(line: string): string {
  let text = line.trim().replace(/[:：.\-–—_|]+$/g, "").trim();

  // Letter-spaced heading: every "word" is a single character. Rejoin before
  // matching, or `S K I L L S` never equals `skills`.
  const words = text.split(/\s+/);
  if (words.length > 2 && words.every((word) => word.length === 1)) {
    text = words.join("");
  }

  return text
    .toLowerCase()
    .replace(/[^a-z0-9 &/+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The section kind a line names, or null when it names none.
 *
 * Exact match only. A `startsWith` test would classify
 * "Experience designing distributed systems" as a heading, which is the exact
 * false positive that splits a section mid-sentence.
 */
export function headingKind(line: string): ResumeSectionKind | null {
  if (line.length > MAX_HEADING_CHARS) return null;

  const normalized = normalizeHeading(line);
  if (!normalized) return null;
  if (normalized.split(" ").length > MAX_HEADING_WORDS) return null;

  for (const [kind, keywords] of SECTION_KEYWORDS) {
    if (keywords.includes(normalized)) return kind;
  }

  return null;
}

/**
 * Whether a line looks like a heading whose words we do not recognise.
 *
 * Used to close the previous section rather than to open a named one: a resume
 * with "PUBLICATIONS" between Experience and Education should not have those
 * publications swallowed into Experience. Requires strong visual evidence —
 * all-caps or title-case, short, no terminal punctuation — because this is the
 * rule most likely to fire on something that is not a heading.
 */
export function looksLikeUnknownHeading(line: string): boolean {
  const trimmed = line.trim().replace(/:$/, "");
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_CHARS) return false;

  const words = trimmed.split(/\s+/);
  if (words.length > MAX_HEADING_WORDS) return false;

  // Sentences and list items are not headings.
  if (/[.,;]$/.test(trimmed)) return false;
  if (/^[•·▪◦‣⁃∙●○*+-]/.test(trimmed)) return false;
  // A line with contact details or dates is content, however short.
  if (/@|https?:|\d{4}/.test(trimmed)) return false;

  // A comma means an enumeration, which is content. This single test is what
  // keeps "TypeScript, Go, PostgreSQL, Kafka" out — a line that is short, has no
  // terminal punctuation, and capitalises every word, yet is plainly a skills
  // list rather than a heading.
  if (trimmed.includes(",")) return false;

  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;

  // ALL CAPS is strong evidence and is accepted at any word count.
  if (letters === letters.toUpperCase()) return true;

  // Title case is weak evidence: most content lines on a resume start with a
  // capital too. It is accepted only for a single substantial word — "Awards",
  // "Publications" — which is the shape an unlisted heading actually takes.
  // Requiring four letters keeps out abbreviations that open a content line,
  // "BSc Computer Science" being the one that motivated the bound.
  return words.length === 1 && letters.length >= 4 && /^[A-Z]/.test(trimmed);
}

/**
 * Split normalized lines into sections.
 *
 * Anything before the first recognised heading is the resume's header block —
 * name, contact details, sometimes an unlabelled summary. It is emitted as an
 * `other` section with an empty heading rather than dropped, because a resume
 * whose summary carries no heading is common and losing it would be silent.
 */
export function detectSections(lines: string[]): ResumeSection[] {
  const sections: ResumeSection[] = [];

  // Heading index → kind, computed first so boundaries are known before any
  // section is built.
  const headings: { index: number; kind: ResumeSectionKind; text: string }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const kind = headingKind(line);

    if (kind) {
      headings.push({ index, kind, text: line.trim() });
      continue;
    }

    // An unrecognised heading only counts once a real section has started.
    // Before that, everything is the header block and splitting it would turn a
    // name into a section title.
    if (headings.length > 0 && looksLikeUnknownHeading(line)) {
      headings.push({ index, kind: "other", text: line.trim() });
    }
  }

  const preambleEnd = headings.length > 0 ? headings[0].index : lines.length;
  if (preambleEnd > 0) {
    sections.push({
      kind: "other",
      heading: "",
      lines: lines.slice(0, preambleEnd),
      startLine: 0,
      endLine: preambleEnd,
    });
  }

  headings.forEach((heading, position) => {
    const end = position + 1 < headings.length ? headings[position + 1].index : lines.length;
    sections.push({
      kind: heading.kind,
      heading: heading.text,
      lines: lines.slice(heading.index + 1, end),
      startLine: heading.index,
      endLine: end,
    });
  });

  return sections;
}
