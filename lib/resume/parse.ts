/**
 * Parse orchestration (Resume AI · Phase 2).
 *
 * One entry point: a validated document in, a `ParsedResume` out. Format
 * dispatch, normalization and section detection are separate modules; this
 * composes them and owns the error vocabulary.
 *
 * Deliberately not `server-only` and deliberately taking an `ArrayBuffer`
 * rather than a `File`: Phase 2 runs entirely in the browser, but nothing here
 * depends on the browser, so the same function will serve the server-side
 * re-parse that a later phase needs for a stored document.
 *
 * This satisfies the `DocumentParser` seam declared in `lib/resume/placeholder.ts`
 * — the registry below is the "one implementation per format plus a registry
 * that picks by type" that file describes.
 */

import { detectSections } from "@/lib/resume/sections";
import { normalizeText } from "@/lib/resume/normalize";
import { extractDocxText, DocxParseError } from "@/lib/resume/parsers/docx";
import { extractPdfText, PdfParseError } from "@/lib/resume/parsers/pdf";
import type { AcceptedDocumentType, UploadedDocument } from "@/types/upload";
import type { ParsedResume } from "@/types/resume";

/** Raised for every failure a caller is expected to show the operator. */
export class ResumeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeParseError";
  }
}

/**
 * Text ceiling.
 *
 * Bounds memory and, more importantly, bounds what a later phase can send to
 * the gateway. Applied here rather than at the call site so no caller can skip
 * it — the same reasoning as `MAX_SOURCE_CHARS` in `lib/ai/summarize.ts`.
 */
export const MAX_RESUME_CHARS = 40_000;

interface RawExtraction {
  text: string;
  pageCount: number | null;
  warnings: string[];
  parser: string;
}

/** One extractor per accepted format. The registry the seam describes. */
const EXTRACTORS: Record<AcceptedDocumentType, (buffer: ArrayBuffer) => Promise<RawExtraction>> = {
  async pdf(buffer) {
    const result = await extractPdfText(buffer);
    return {
      text: result.text,
      pageCount: result.pageCount,
      warnings: result.warnings,
      parser: "pdfjs",
    };
  },

  async docx(buffer) {
    const text = await extractDocxText(buffer);
    return {
      text,
      // DOCX has no fixed pagination — page breaks are computed at render time
      // by the word processor, so there is no page count to report and claiming
      // one would be an invention.
      pageCount: null,
      warnings: [],
      parser: "docx-xml",
    };
  },
};

/**
 * Parse a validated document into text and sections.
 *
 * Every extractor failure is re-thrown as a `ResumeParseError` carrying a
 * sentence the operator can act on. Anything unrecognised becomes a generic
 * message rather than leaking a library's internals into the UI — the same
 * contract the AI error taxonomy follows.
 */
export async function parseResume(document: UploadedDocument): Promise<ParsedResume> {
  const buffer = await document.file.arrayBuffer();

  let raw: RawExtraction;
  try {
    raw = await EXTRACTORS[document.type](buffer);
  } catch (error) {
    if (error instanceof PdfParseError || error instanceof DocxParseError) {
      throw new ResumeParseError(error.message);
    }
    console.error("[resume parse] extractor failed:", error);
    throw new ResumeParseError("That file could not be read. Try exporting it again.");
  }

  const warnings = [...raw.warnings];

  const truncated = raw.text.length > MAX_RESUME_CHARS;
  if (truncated) {
    warnings.push(
      `Only the first ${MAX_RESUME_CHARS.toLocaleString()} characters were kept — the rest was ignored.`,
    );
  }

  const { text, lines } = normalizeText(
    truncated ? raw.text.slice(0, MAX_RESUME_CHARS) : raw.text,
  );

  const sections = detectSections(lines);

  // A resume with no recognised heading still parses — the text is intact and
  // sits in the preamble section — but the analyzer will be working blind, so
  // it is worth saying.
  if (lines.length > 0 && !sections.some((section) => section.kind !== "other")) {
    warnings.push("No standard sections were recognised. The text was still extracted in full.");
  }

  return {
    text,
    lines,
    sections,
    pageCount: raw.pageCount,
    truncated,
    parser: raw.parser,
    warnings,
  };
}
