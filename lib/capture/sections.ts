import "server-only";
import type { CapturedSection } from "@/types/capture";

/**
 * Section classification and job-description assembly.
 *
 * A job page is not one document. It is the employer's posting, wrapped in
 * whatever the job board adds around it — its own editorial commentary, a
 * metadata card, navigation, recommendations. Concatenating all of it into
 * `job_description` produces a field that is technically complete and
 * practically useless: the thing read months later to prepare for an interview
 * would be half somebody else's writing about the job rather than the job.
 *
 * So each heading-delimited section is classified, and only the employer's own
 * content is assembled. Board metadata is kept, but routed to field extraction
 * rather than into the description. Editorial is dropped.
 *
 * Matching is on heading TEXT, not on any site's markup, because that is the
 * only thing job boards actually have in common. "What you'll do" and
 * "Responsibilities" mean the same thing everywhere; the class names holding
 * them differ on every site and change without warning.
 */

export type SectionKind = "employer" | "editorial" | "metadata" | "unknown";

/**
 * Board editorial — commentary the site wrote ABOUT the job.
 *
 * Checked FIRST, and the ordering is load-bearing. "Remote Readiness Overview"
 * contains "overview" and "Application Guide" contains "application", both of
 * which are employer-section words. The more specific pattern has to win, or a
 * board's own analysis gets filed as the employer's job description.
 */
const EDITORIAL_PATTERNS: RegExp[] = [
  /\beditorial\b/i,
  /\banalysis\b/i,
  /\bgrowth opportunit/i,
  /\bapplication guide\b/i,
  /\breadiness\b/i,
  /\b(similar|related|recommended|other|more)\s+(jobs|roles|positions|openings)\b/i,
  /\byou might also\b/i,
  /\bwritten by\b/i,
  /\bshare (this|the) (job|role|posting)\b/i,
  /\b(career|job search|interview)\s+(advice|tips|guide)\b/i,
  /\bwhy (use|choose|join)\s+(us|our)\b.*\b(platform|site|board)\b/i,
  /\bnewsletter\b|\bsubscribe\b/i,
  /\bdisclaimer\b/i,
  /\bhow we (rank|score|rate)\b/i,
];

/**
 * Board metadata — a labelled summary card. Real information, but stated as
 * fields rather than prose, so it belongs in the structured columns and not in
 * the description. "Job Summary" on the page that prompted this work is exactly
 * this: Company / Bjak / Experience / Mid-Level / Employment / Full-time.
 */
const METADATA_PATTERNS: RegExp[] = [
  /^job (details|info(rmation)?|facts|overview card)$/i,
  /^(details|at a glance|quick facts|key details|job data)$/i,
  /^(position|role) (details|information)$/i,
];

/**
 * Headings that name either a field card or a real section, depending entirely
 * on what is underneath them.
 *
 * "Job Summary" is the case that forces this. On one site it is the board's
 * generated card — Company / Bjak / Employment / Full-time — and belongs in the
 * structured columns. On another it is the employer's own opening paragraph and
 * belongs in the description. The words are identical; only the body differs,
 * so the body is what decides.
 */
const AMBIGUOUS_PATTERNS: RegExp[] = [/^(job |position |role )?summary$/i, /^overview$/i];

/** Field labels a generated card almost always contains. */
const CARD_LABELS =
  /^(company|employer|employment|job type|experience|seniority|level|location|work type|workplace|salary|compensation|posted|date posted|industry|category|categories|deadline|apply by)$/i;

/**
 * Does this body read as a field card rather than as prose?
 *
 * Three signals, any of which is decisive:
 *   - the extractor counted mostly leaf cells (a grid or card layout)
 *   - several lines are bare field labels
 *   - the lines are uniformly short and none of them is a sentence
 *
 * Prose has sentences. A card has labels and values. The distinction survives
 * across sites because it is about the shape of the content, not its markup.
 */
export function looksLikeFieldCard(section: CapturedSection): boolean {
  const text = section.text?.trim() ?? "";
  if (!text) return false;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;

  if ((section.cells ?? 0) >= 4 && (section.cells ?? 0) >= (section.blocks ?? 0) * 0.7) return true;

  const labelLines = lines.filter((l) => CARD_LABELS.test(l.replace(/[:\s]+$/, ""))).length;
  if (labelLines >= 2) return true;

  // No sentence anywhere, everything short: a list of values, not a narrative.
  const hasSentence = lines.some((l) => l.length > 80 || /[a-z]{3,}[.!?]( |$)/.test(l));
  return !hasSentence && lines.length >= 4 && lines.every((l) => l.length <= 40);
}

/**
 * Employer content — the posting itself.
 *
 * Deliberately generous. A section wrongly called employer content costs a
 * paragraph of noise in a long field; a section wrongly excluded loses part of
 * the description, which is the thing this whole feature exists to capture.
 */
const EMPLOYER_PATTERNS: RegExp[] = [
  /\b(overview|introduction|summary of the role)\b/i,
  /\babout (the|this) (role|job|position|opportunity)\b/i,
  /^(the )?role$/i,
  /\bjob (description|purpose|scope)\b/i,
  /\bresponsibilit/i,
  /\bduties\b/i,
  /\bwhat you(?:'|’)?ll (do|be doing|own|work on)\b/i,
  /\bwhat you will (do|be doing)\b/i,
  /\byour (impact|mission|role|day)\b/i,
  /\brequirement/i,
  /\bqualificat/i,
  /\bwhat we(?:'|’)?re looking for\b/i,
  /\bwho you are\b/i,
  /\b(required|preferred|technical|core|key)\s+skills\b/i,
  /\bskills\b/i,
  /\bnice[- ]to[- ]have\b/i,
  /\bbonus (points|skills)\b/i,
  /\bpluses\b/i,
  /\bexperience\b/i,
  /\beducation\b/i,
  /\babout (the company|us)\b/i,
  /\bwho we are\b/i,
  /\bour (team|company|mission)\b/i,
  /\bbenefits\b|\bperks\b/i,
  /\bcompensation\b|\bsalary\b|\bpay\b/i,
  /\bhow to apply\b/i,
  /\bapplication process\b/i,
  /\bwork (arrangement|setup|location)\b/i,
  /\bhiring process\b|\binterview process\b/i,
  /\btech stack\b|\btools\b/i,
];

/**
 * Classify one section by its heading.
 *
 * A null heading is the lead block — the text before the first heading, which on
 * almost every posting is the role overview. It is employer content by position:
 * a board's commentary is never the first thing above the first heading.
 */
export function classifySection(
  section: CapturedSection | string | null,
  roleTitle?: string | null,
): SectionKind {
  // Accepts a bare heading so callers that only have one — and the tests that
  // exercise heading matching in isolation — need not fabricate a section.
  // Written as an explicit guard rather than a ternary: this project compiles
  // with `strict: false`, where narrowing a union by `typeof` does not hold
  // across both branches.
  const isSection = (value: unknown): value is CapturedSection =>
    typeof value === "object" && value !== null;
  const node: CapturedSection = isSection(section)
    ? section
    : { heading: section as string | null, level: 2, text: "" };
  const heading = node.heading;

  if (heading === null) return "employer";

  const text = heading.replace(/\s+/g, " ").trim();
  if (!text) return "unknown";

  // A section headed with the role's own name is the posting's opening, and its
  // body is the overview. Seen on the live page that prompted this: the <h1>
  // "Applied AI Engineer" heads the paragraph describing the job. Without this
  // it matches no employer keyword, classifies as unknown, and the single most
  // important paragraph on the page is dropped.
  if (roleTitle) {
    const role = roleTitle.replace(/\s+/g, " ").trim().toLowerCase();
    if (role.length >= 3 && text.toLowerCase() === role) return "employer";
  }

  for (const pattern of EDITORIAL_PATTERNS) if (pattern.test(text)) return "editorial";
  for (const pattern of METADATA_PATTERNS) if (pattern.test(text)) return "metadata";

  // Decided by what is underneath, not by the words in the heading.
  if (AMBIGUOUS_PATTERNS.some((pattern) => pattern.test(text))) {
    return looksLikeFieldCard(node) ? "metadata" : "employer";
  }

  for (const pattern of EMPLOYER_PATTERNS) if (pattern.test(text)) return "employer";

  return "unknown";
}

export interface AssembledDescription {
  /** The employer's posting, in document order. Null when the page had none. */
  description: string | null;
  /** Headings included, for the notice shown to the person reviewing. */
  includedHeadings: string[];
  /** Board metadata text, for field extraction. Never enters the description. */
  metadataText: string;
  /** True when nothing was recognised and unknown sections were used instead. */
  usedFallback: boolean;
}

/**
 * Length floors, kept as low as they can be while still excluding non-content.
 *
 * A floor is a way to lose a real description, so these exist only to reject
 * things that are definitely not prose: a bare company name in the lead block
 * ("BJAK", four characters, seen on the live page), a button caption, a stray
 * label. Anything that could be a sentence gets through.
 *
 * A named section is subject to no floor at all. If an employer wrote a heading
 * and put one line under it, that line is their description and it is kept.
 */
const MIN_LEAD_CHARS = 25;
const MIN_DESCRIPTION_CHARS = 1;

/**
 * Assemble the employer's job description from classified sections.
 *
 * Document order is preserved rather than imposing a canonical section order.
 * The employer chose to put responsibilities before requirements, or the other
 * way round, and reordering their posting changes how it reads for no benefit.
 *
 * When no employer section is recognised at all, unknown sections are used
 * instead. That is the deliberate trade for an unusual page: a description with
 * some extra content in it beats an empty one, because an empty one means
 * copying the posting by hand — the exact work this exists to remove.
 */
/**
 * Does the section at `index` head a group whose members carry the content?
 *
 * True when the next section is deeper and has a body. That is the shape of a
 * parent heading — a grouping label with the substance underneath it — and it
 * is worth keeping for the same reason the employer wrote it.
 */
function hasNestedContent(sections: CapturedSection[], index: number): boolean {
  const parent = sections[index];
  if (!parent?.heading) return false;
  const next = sections[index + 1];
  return Boolean(next && next.level > parent.level && next.text?.trim());
}

export function assembleJobDescription(
  sections: CapturedSection[],
  roleTitle?: string | null,
): AssembledDescription {
  const included: { heading: string | null; text: string }[] = [];
  const unknown: { heading: string | null; text: string }[] = [];
  const metadata: string[] = [];

  for (const [index, section] of sections.entries()) {
    const text = section.text?.trim() ?? "";
    const kind = classifySection(section, roleTitle);

    if (kind === "metadata") {
      // Kept, but only as input to field extraction.
      if (text) metadata.push(section.heading ? `${section.heading}\n${text}` : text);
      continue;
    }
    if (kind === "editorial") continue;

    // The lead block is the only one with a floor: it catches breadcrumbs and
    // bare company names. A heading means an author put it there deliberately.
    if (section.heading === null && text.length < MIN_LEAD_CHARS) continue;

    // A heading with an empty body is kept when it is a PARENT of sections that
    // follow it — "Skills & Requirements" above "Required Skills" and
    // "Nice-to-Have Skills" on the live page. Dropping it flattens the
    // employer's own grouping and loses information the page carried.
    if (!text && !hasNestedContent(sections, index)) continue;

    if (kind === "employer") included.push({ heading: section.heading, text });
    else unknown.push({ heading: section.heading, text });
  }

  const usedFallback = included.length === 0 && unknown.length > 0;
  const chosen = usedFallback ? unknown : included;

  const description = chosen
    .map(({ heading, text }) => (heading ? `${heading}\n${text}` : text))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    description: description.length >= MIN_DESCRIPTION_CHARS ? description : null,
    includedHeadings: chosen.map((s) => s.heading).filter((h): h is string => Boolean(h)),
    metadataText: metadata.join("\n"),
    usedFallback,
  };
}

/**
 * Cut raw page text at the first board-editorial heading.
 *
 * The last-resort path: a page whose structure the extractor could not read at
 * all, where the only thing left is the flat text. Without this cut that text
 * carries the board's commentary straight into the description — which is the
 * contamination the section pipeline exists to prevent, arriving through the
 * back door.
 *
 * Cutting at the first editorial heading works because boards append their
 * sections AFTER the employer's posting, not before it. Nothing is reordered
 * and nothing is summarised; the tail is simply dropped.
 */
export function trimAtEditorialBoundary(text: string): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    // Only short lines are considered: an editorial phrase inside a paragraph
    // is prose, the same phrase alone on a line is a heading.
    if (!line || line.length > 60) continue;
    if (EDITORIAL_PATTERNS.some((pattern) => pattern.test(line))) {
      return lines.slice(0, i).join("\n").trim();
    }
  }
  return text.trim();
}
