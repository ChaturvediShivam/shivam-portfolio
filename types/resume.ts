/**
 * Resume domain types (Resume AI · Step 1).
 *
 * Step 1 ships only the upload half. The analysis shapes below are declared
 * now, unused, because they are the contract the later steps have to satisfy —
 * writing them down early is what stops the upload flow being designed in a way
 * that cannot carry them.
 *
 * Nothing here is persisted yet. When storage lands, these become the row
 * shapes; that is why every id is a plain string and every timestamp an ISO
 * string, matching the conventions in `types/opportunity.ts` and friends.
 */

import type { UploadedDocument, UploadState } from "@/types/upload";

/** A resume the operator has supplied. */
export interface Resume {
  id: string;
  document: UploadedDocument;
}

/** The uploader's externally-visible state. */
export type ResumeUploadState = UploadState;

// ---------------------------------------------------------------------------
// Forward contracts — Step 2 and beyond. Declared, not implemented.
// ---------------------------------------------------------------------------

/**
 * Sections a resume is split into (Phase 2).
 *
 * A closed set plus `other`, rather than free-form headings: the analyzer needs
 * to ask "what does the skills section say" without first learning what this
 * particular resume called it. Headings that match nothing recognised become
 * `other` and keep their original text, so nothing is silently discarded.
 */
export const RESUME_SECTION_KINDS = [
  "summary",
  "skills",
  "experience",
  "education",
  "projects",
  "certifications",
  "other",
] as const;
export type ResumeSectionKind = (typeof RESUME_SECTION_KINDS)[number];

/** One detected section. */
export interface ResumeSection {
  kind: ResumeSectionKind;
  /** The heading exactly as it appeared, for display and for debugging a miss. */
  heading: string;
  /** Body lines, normalized and with the heading removed. */
  lines: string[];
  /** Index into `ParsedResume.lines` where the heading sat. */
  startLine: number;
  /** Exclusive end index into `ParsedResume.lines`. */
  endLine: number;
}

/**
 * Text extracted from a resume, plus enough provenance to debug a bad parse.
 *
 * `pageCount` and `truncated` exist because the analyzer will need to bound
 * what it sends to the gateway, exactly as `lib/ai/summarize.ts` does.
 *
 * `lines` is kept alongside `text` because section boundaries are line indices,
 * and re-splitting the text downstream would risk a different split than the one
 * the boundaries were computed against.
 */
export interface ParsedResume {
  text: string;
  lines: string[];
  sections: ResumeSection[];
  pageCount: number | null;
  truncated: boolean;
  /** Which parser produced this — opaque provenance, never branched on. */
  parser: string;
  /** Non-fatal problems worth surfacing (e.g. a scanned PDF with no text). */
  warnings: string[];
}

/** The section of a given kind, or null. First wins when a resume repeats one. */
export function sectionOfKind(
  parsed: ParsedResume,
  kind: ResumeSectionKind,
): ResumeSection | null {
  return parsed.sections.find((section) => section.kind === kind) ?? null;
}

/** Structured view of a resume, once extraction is more than raw text. */
export interface ResumeProfile {
  fullName: string | null;
  headline: string | null;
  emails: string[];
  phones: string[];
  links: string[];
  skills: string[];
  yearsExperience: number | null;
}

/**
 * The analysis shapes once declared here (`MatchSeverity`, `ResumeGap`,
 * `ResumeAnalysis`) now live in `types/resume-analysis.ts`.
 *
 * Phase 1 declared them as forward contracts for an AI-produced analysis.
 * Phase 3 changed what an analysis IS: scores, matches and gaps are computed
 * deterministically, and the model's role became enriching that result rather
 * than generating it. Keeping a second, incompatible `ResumeAnalysis` here
 * would have left two types with one name and no way to tell which a caller
 * meant.
 */
