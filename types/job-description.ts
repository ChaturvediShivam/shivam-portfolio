/**
 * Job description domain types (Resume AI · Step 1).
 *
 * A job description reaches the analyzer one of two ways — pasted or uploaded —
 * and the rest of the system should not care which. `JobDescriptionInput` is a
 * discriminated union for that reason: the analyzer takes the union, and adding
 * a third source later (a URL, an opportunity already in the CRM) is a new
 * variant rather than a new parameter everywhere.
 */

import type { UploadedDocument, UploadState } from "@/types/upload";

export const JD_SOURCES = ["paste", "upload"] as const;
export type JobDescriptionSource = (typeof JD_SOURCES)[number];

/** Below this, the text is too thin to analyse against meaningfully. */
export const MIN_JD_CHARS = 120;

/** Ceiling on pasted text. Bounds what a later step sends to the gateway. */
export const MAX_JD_CHARS = 30_000;

export interface PastedJobDescription {
  source: "paste";
  text: string;
}

export interface UploadedJobDescription {
  source: "upload";
  document: UploadedDocument;
}

export type JobDescriptionInput = PastedJobDescription | UploadedJobDescription;

/** The uploader's externally-visible state, for the upload tab. */
export type JobDescriptionUploadState = UploadState;

/**
 * Whether an input carries enough to analyse.
 *
 * An uploaded document counts as ready as soon as it is held: its text is not
 * extracted until a later step, so length cannot be checked here, and blocking
 * on a check that cannot run would make the button permanently disabled.
 */
export function isJobDescriptionReady(input: JobDescriptionInput | null): boolean {
  if (!input) return false;
  if (input.source === "upload") return true;
  return input.text.trim().length >= MIN_JD_CHARS;
}

// ---------------------------------------------------------------------------
// Forward contracts — Step 2 and beyond. Declared, not implemented.
// ---------------------------------------------------------------------------

/** A job description resolved to text, whatever its source was. */
export interface ResolvedJobDescription {
  id: string;
  source: JobDescriptionSource;
  text: string;
  truncated: boolean;
  /** Set when the description came from, or was linked to, a CRM record. */
  opportunityId: string | null;
}

/** Structured view, once extraction is more than raw text. */
export interface JobRequirements {
  title: string | null;
  company: string | null;
  location: string | null;
  mustHave: string[];
  niceToHave: string[];
  responsibilities: string[];
  keywords: string[];
}
