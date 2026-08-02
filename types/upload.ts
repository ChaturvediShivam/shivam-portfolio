/**
 * Shared document-upload contracts (Resume AI · Step 1).
 *
 * Resume and job description are different domains but the same upload
 * problem, so the primitives live here once rather than being written twice
 * and drifting. `types/resume.ts` and `types/job-description.ts` build on
 * these.
 *
 * Deliberately transport-agnostic. Step 1 holds files in memory; a later step
 * will move them somewhere durable. Nothing here names a storage backend, so
 * that change is additive rather than a rewrite.
 */

/** Document formats the analyzer will be able to read. */
export const ACCEPTED_DOCUMENT_TYPES = ["pdf", "docx"] as const;
export type AcceptedDocumentType = (typeof ACCEPTED_DOCUMENT_TYPES)[number];

/** MIME types the browser may report for an accepted format. */
export const ACCEPTED_MIME_TYPES: Record<AcceptedDocumentType, readonly string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

export const ACCEPTED_EXTENSIONS: Record<AcceptedDocumentType, string> = {
  pdf: ".pdf",
  docx: ".docx",
};

/** `accept` attribute value for a file input, covering both formats. */
export const FILE_INPUT_ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Hard ceiling, enforced before a file is held at all. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Why a file was rejected.
 *
 * A closed set rather than free text so the UI can phrase each case in its own
 * words, and so a later step can report rejections without inventing new
 * vocabulary.
 */
export type UploadRejectionReason =
  | "unsupported_type"
  | "too_large"
  | "empty_file"
  | "too_many_files";

export interface UploadRejection {
  reason: UploadRejectionReason;
  /** Operator-facing sentence. Always safe to render. */
  message: string;
  /** The offending file's name, when there was one. */
  fileName?: string;
}

/**
 * A file accepted for analysis.
 *
 * Carries the browser `File` so a later step can read or transfer its bytes,
 * alongside the already-derived display fields. Keeping both means the UI never
 * re-derives what validation already worked out.
 */
export interface UploadedDocument {
  /** Stable id for React keys and, later, for correlating a parse result. */
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  type: AcceptedDocumentType;
  /** Milliseconds since epoch, for "added just now" affordances. */
  addedAt: number;
}

/**
 * Upload lifecycle.
 *
 * `transferring` and `processing` are not reachable in Step 1 — nothing leaves
 * the browser yet — but they are modelled and rendered now so the step that
 * adds a real transfer changes the state machine's *drivers*, not its shape or
 * its UI. Rendering them today also means they are never dead code paths
 * discovered for the first time in production.
 */
export type UploadState =
  | { status: "empty" }
  | { status: "validating" }
  | { status: "transferring"; progress: number | null; document: UploadedDocument }
  | { status: "processing"; document: UploadedDocument }
  | { status: "ready"; document: UploadedDocument }
  | { status: "rejected"; rejection: UploadRejection }
  | { status: "error"; message: string };

/** True when the state holds a document the caller can act on. */
export function isUploadComplete(state: UploadState): state is Extract<UploadState, { status: "ready" }> {
  return state.status === "ready";
}

/** True while the upload is doing something the operator should wait for. */
export function isUploadBusy(state: UploadState): boolean {
  return state.status === "validating" || state.status === "transferring" || state.status === "processing";
}

/** The document held by the state, if any. */
export function documentOf(state: UploadState): UploadedDocument | null {
  switch (state.status) {
    case "transferring":
    case "processing":
    case "ready":
      return state.document;
    default:
      return null;
  }
}
