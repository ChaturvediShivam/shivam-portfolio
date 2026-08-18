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
  /^job (summary|details|info(rmation)?|facts|overview card)$/i,
  /^(summary|details|at a glance|quick facts|key details|job data)$/i,
  /^(position|role) (details|summary|information)$/i,
];

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
export function classifySection(heading: string | null, roleTitle?: string | null): SectionKind {
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

/** Sections too short to be content — a stray label, a button caption. */
const MIN_SECTION_CHARS = 40;

/**
 * The lead block is only an overview if it is more than a breadcrumb.
 *
 * Set at the length of a short sentence rather than a paragraph. A genuine
 * one-line overview ("We are hiring an engineer to build practical AI systems")
 * is a real description and the only one some postings have — dropping it would
 * hand back an empty field on exactly the pages that can least afford it.
 * Breadcrumbs and button captions sit well under this.
 */
const MIN_LEAD_CHARS = 55;

/**
 * The floor for the assembled result.
 *
 * Lower than the per-section floor on purpose: a posting whose entire
 * description is two short sentences still has a description, and returning
 * null there would mean retyping it by hand.
 */
const MIN_DESCRIPTION_CHARS = 40;

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
export function assembleJobDescription(
  sections: CapturedSection[],
  roleTitle?: string | null,
): AssembledDescription {
  const included: { heading: string | null; text: string }[] = [];
  const unknown: { heading: string | null; text: string }[] = [];
  const metadata: string[] = [];

  for (const section of sections) {
    const text = section.text?.trim() ?? "";
    const kind = classifySection(section.heading, roleTitle);

    if (kind === "metadata") {
      // Kept, but only as input to field extraction.
      if (text) metadata.push(section.heading ? `${section.heading}\n${text}` : text);
      continue;
    }
    if (kind === "editorial") continue;

    const isLead = section.heading === null;
    const floor = isLead ? MIN_LEAD_CHARS : MIN_SECTION_CHARS;
    // A heading with no body still carries meaning in a list of sections, but
    // only when it sits alongside real content — never on its own.
    if (text.length < floor && !(section.heading && text.length > 0)) continue;

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
