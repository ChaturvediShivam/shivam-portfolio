/**
 * Text normalization (Resume AI · Phase 2).
 *
 * Pure and dependency-free. Extractors hand back text that reflects how the
 * document was *laid out*, not how it reads: PDF gives soft-hyphenated line
 * breaks and ligatures, DOCX gives non-breaking spaces and smart quotes, both
 * give inconsistent bullets. Section detection then has to match headings, and
 * a heading that arrives as `S K I L L S` or `Skills` matches nothing.
 *
 * Every transform here is reversible in meaning but not in bytes — the point is
 * a canonical form the rest of the pipeline can rely on, so downstream code
 * never needs its own defensive trimming.
 */

/**
 * Characters that mean "space" but are not one.
 *
 * NBSP and the typographic spaces appear constantly in Word documents; the zero
 * width ones come from PDFs and would otherwise sit invisibly inside words and
 * break keyword matching.
 */
const SPACE_LIKE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;

/**
 * Bullet glyphs at the start of a line.
 *
 * The ASCII hyphen is included and sits last so it reads as a literal rather
 * than opening a range. It matters because `normalizeCharacters` flattens en
 * and em dashes to `-` first, so by the time a line reaches here a dash bullet
 * has already become an ASCII one.
 *
 * The trailing `\s+` is what keeps this off real content: `- Led a team` is a
 * bullet, `-5 years` and `full-stack` are not.
 */
const BULLETS = /^[\s]*[•·▪◦‣⁃∙●○*+-]\s+/;

/** Ligatures that PDF extraction commonly emits as single code points. */
const LIGATURES: [RegExp, string][] = [
  [/ﬀ/g, "ff"],
  [/ﬁ/g, "fi"],
  [/ﬂ/g, "fl"],
  [/ﬃ/g, "ffi"],
  [/ﬄ/g, "ffl"],
  [/ﬅ/g, "st"],
  [/ﬆ/g, "st"],
];

/** Smart punctuation, flattened so a search for `-` or `'` behaves. */
const PUNCTUATION: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/[–—―]/g, "-"],
  [/…/g, "..."],
];

/** Apply the character-level fixes that are safe anywhere in a document. */
export function normalizeCharacters(input: string): string {
  let text = input.normalize("NFKC");

  for (const [pattern, replacement] of LIGATURES) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of PUNCTUATION) text = text.replace(pattern, replacement);

  return text
    .replace(ZERO_WIDTH, "")
    .replace(SPACE_LIKE, " ")
    // CRLF and lone CR both become LF so line splitting has one rule.
    .replace(/\r\n?/g, "\n");
}

/**
 * Rejoin a word broken across lines by a soft hyphen.
 *
 * PDFs hyphenate at the layout width, so `engi-\nneering` is one word that
 * would otherwise be indexed as two fragments. Only applied when the hyphen
 * follows a letter and the next line starts with a lowercase letter — a line
 * ending in `full-` followed by `Stack` is a real hyphenated term, not a break.
 */
export function rejoinHyphenatedWords(input: string): string {
  return input.replace(/([A-Za-z])-\n([a-z])/g, "$1$2");
}

/** Strip a leading bullet glyph, returning the text and whether one was found. */
export function stripBullet(line: string): { text: string; bulleted: boolean } {
  const stripped = line.replace(BULLETS, "");
  return { text: stripped, bulleted: stripped !== line };
}

/**
 * Collapse a single line's internal whitespace.
 *
 * Tabs and runs of spaces come from column layouts and mean nothing once the
 * text is linear.
 */
export function normalizeLine(line: string): string {
  return line.replace(/[ \t]+/g, " ").trim();
}

/**
 * Full normalization: characters, hyphenation, then per-line whitespace.
 *
 * Blank lines are dropped rather than collapsed to one. They carry no meaning
 * once sections are detected by heading rather than by spacing, and keeping
 * them would make every downstream line index depend on the source's vertical
 * rhythm.
 */
export function normalizeText(input: string): { text: string; lines: string[] } {
  const prepared = rejoinHyphenatedWords(normalizeCharacters(input));

  const lines = prepared
    .split("\n")
    .map(normalizeLine)
    .filter((line) => line.length > 0);

  return { text: lines.join("\n"), lines };
}
