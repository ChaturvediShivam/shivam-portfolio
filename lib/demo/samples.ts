import "server-only";

import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";
import { SAMPLE_RESUME_TEXT, SAMPLE_JD_TEXT } from "@/lib/demo/sampleContent";
import type { ParsedResume } from "@/types/resume";

/**
 * The bundled sample pair, as the demo's analysis path consumes it.
 *
 * The resume is run through the SAME normalizer and section detector the upload
 * path uses, rather than shipping a hand-written ParsedResume fixture. Two
 * reasons: a hand-written fixture can encode a shape the real parser would never
 * produce, and it silently rots the first time section detection changes. Here
 * the sample is exactly what an uploaded copy of the same document would become.
 *
 * `parseResume` itself is not reused because it takes an UploadedDocument and
 * needs a File and a format extractor. Everything after extraction — which is
 * all that matters for a text sample — is these two pure functions.
 */

/** Cached across requests: the input is a module constant, so it never changes. */
let cached: ParsedResume | null = null;

export function sampleResume(): ParsedResume {
  if (cached) return cached;

  const { text, lines } = normalizeText(SAMPLE_RESUME_TEXT);

  cached = {
    text,
    lines,
    sections: detectSections(lines),
    // Not extracted from a paginated document, so claiming a page count would
    // be an invention — the same reasoning the DOCX extractor applies.
    pageCount: null,
    truncated: false,
    // Opaque provenance. Marked as the bundled sample rather than borrowing
    // "pdfjs" so a support question about a demo result is answerable.
    parser: "bundled-sample",
    warnings: [],
  };

  return cached;
}

export function sampleJobDescription(): string {
  return SAMPLE_JD_TEXT;
}
