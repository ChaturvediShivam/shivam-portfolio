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
 * Text extracted from a resume, plus enough provenance to debug a bad parse.
 *
 * `pageCount` and `truncated` exist because the analyzer will need to bound
 * what it sends to the gateway, exactly as `lib/ai/summarize.ts` does.
 */
export interface ParsedResume {
  text: string;
  pageCount: number | null;
  truncated: boolean;
  /** Which parser produced this — opaque provenance, never branched on. */
  parser: string;
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

export type MatchSeverity = "critical" | "important" | "nice_to_have";

/** One requirement the resume does not evidence. */
export interface ResumeGap {
  requirement: string;
  severity: MatchSeverity;
  /** What the operator could add or emphasise. */
  suggestion: string;
}

/**
 * The analysis result.
 *
 * Carries the same `ai_*` provenance every AI-written record in this codebase
 * carries, so a stored analysis is reproducible and auditable on the day it is
 * persisted rather than needing a migration to become so.
 */
export interface ResumeAnalysis {
  id: string;
  resumeId: string;
  jobDescriptionId: string;
  /** 0–100. Deliberately not called "ATS score" in the type — see docs. */
  matchScore: number;
  strengths: string[];
  gaps: ResumeGap[];
  keywordsMatched: string[];
  keywordsMissing: string[];
  summary: string;
  aiProvider: string | null;
  aiModel: string | null;
  aiPromptVersion: string | null;
  aiConfidence: number | null;
  createdAt: string;
}
