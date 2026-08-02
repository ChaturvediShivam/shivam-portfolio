/**
 * DOCX text extraction (Resume AI · Phase 2).
 *
 * A DOCX is WordprocessingML inside a ZIP. Only `word/document.xml` is read —
 * headers, footers, footnotes and comments are deliberately skipped, because on
 * a resume they hold page numbers and template boilerplate, not content.
 *
 * The XML is walked with a tokenizer rather than DOMParser, for two reasons:
 * DOMParser does not exist in Node, so a DOM-based extractor could not be unit
 * tested; and only four element types matter here, which is well short of
 * needing a parser.
 *
 * What each element means, and why it is handled:
 *   <w:t>    a run of literal text. The payload.
 *   <w:p>    a paragraph — the only reliable line boundary in the format.
 *   <w:br>   an explicit line break inside a paragraph.
 *   <w:tab>  a tab, which in resumes separates a role from its dates and must
 *            not silently concatenate them into one word.
 *
 * Everything else — formatting, revision marks, bookmarks — is skipped. A run's
 * text is identical whether or not it was bold, and bold is exactly the signal
 * the layout used for headings, which is why `sections.ts` has to infer them
 * from wording instead.
 */

import { readZipEntryText, ZipFormatError } from "./zip";

const DOCUMENT_ENTRY = "word/document.xml";

export class DocxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxParseError";
  }
}

/** Decode the five XML entities that appear in WordprocessingML text. */
function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    // Ampersand last, or a doubly-encoded entity would decode twice.
    .replace(/&amp;/g, "&");
}

/**
 * Extract plain text from `word/document.xml`.
 *
 * Exported for tests: it is the whole of the format-specific logic, and testing
 * it directly means the DOCX cases need no ZIP fixture.
 */
export function extractTextFromDocumentXml(xml: string): string {
  const pieces: string[] = [];
  // Matches an opening/standalone tag or a <w:t> element with its content.
  const tokenPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<(\/?)(w:p|w:br|w:tab)(?:\s[^>]*?)?\/?>/g;

  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(xml)) !== null) {
    const [, textContent, closing, element] = match;

    if (textContent !== undefined) {
      pieces.push(decodeXmlEntities(textContent));
      continue;
    }

    if (element === "w:tab") {
      pieces.push("\t");
      continue;
    }

    if (element === "w:br") {
      pieces.push("\n");
      continue;
    }

    // A paragraph boundary is emitted on the CLOSING tag. Emitting on the
    // opening one would put the break before the first paragraph and leave the
    // last one unterminated.
    if (element === "w:p" && closing === "/") {
      pieces.push("\n");
    }
  }

  return pieces.join("");
}

/** Read a DOCX file and return its raw text, unnormalized. */
export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  let xml: string | null;

  try {
    xml = await readZipEntryText(buffer, DOCUMENT_ENTRY);
  } catch (error) {
    if (error instanceof ZipFormatError) {
      throw new DocxParseError("That file is not a readable DOCX.");
    }
    throw error;
  }

  if (xml === null) {
    // A valid ZIP without this entry is some other Office format — .pptx and
    // .xlsx both pass a ZIP check and would otherwise fail confusingly later.
    throw new DocxParseError("That file is a ZIP archive but not a Word document.");
  }

  return extractTextFromDocumentXml(xml);
}
