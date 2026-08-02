/**
 * PDF text extraction (Resume AI · Phase 2).
 *
 * Uses `pdfjs-dist`, the reference implementation, rather than a hand-rolled
 * extractor. That is a deliberate dependency: PDF stores glyph codes, not text,
 * and turning them back into characters means resolving font encodings —
 * WinAnsi, MacRoman, Identity-H with an embedded CMap, subset fonts with custom
 * differences arrays. A naive content-stream reader works on the PDF you test
 * with and emits mojibake on the next one, and a resume exported from Canva,
 * LaTeX and Word will exercise all three paths.
 *
 * The worker URL is resolved with `new URL(..., import.meta.url)`, which is the
 * form webpack understands: it emits the worker as an asset and rewrites the
 * URL to its hashed output path. Anything else — a bare specifier, a public/
 * path copied by hand — is the usual source of "works in dev, 404s in
 * production".
 *
 * pdf.js v4 has no way to run without a worker. An earlier version of this file
 * set `workerSrc = ""` believing that disabled it; it does not, and the library
 * throws `No "GlobalWorkerOptions.workerSrc" specified` at the first parse. The
 * comment is left here because the empty-string idea is an easy one to have
 * twice.
 */

export class PdfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfParseError";
  }
}

export interface PdfExtraction {
  text: string;
  pageCount: number;
  /** Non-fatal observations — e.g. a page that yielded nothing. */
  warnings: string[];
}

/** Horizontal gap, in text-space units, that implies a deliberate separation. */
const COLUMN_GAP = 8;

/** Vertical movement that implies a new line rather than the same one. */
const LINE_EPSILON = 2;

export interface TextItemLike {
  str: string;
  transform?: number[];
  width?: number;
  hasEOL?: boolean;
}

/**
 * Reassemble one page's text items into lines.
 *
 * pdf.js returns positioned fragments in content-stream order, not reading
 * order, and with no line structure. Fragments are grouped by their baseline
 * (`transform[5]`) and then ordered left to right, which recovers lines for the
 * single- and two-column layouts resumes actually use.
 *
 * A gap wider than `COLUMN_GAP` becomes a tab rather than a space: on a resume
 * that gap is the space between a job title and its dates, and collapsing it
 * would join them into one token.
 */
export function itemsToLines(items: TextItemLike[]): string[] {
  const rows = new Map<number, TextItemLike[]>();

  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform?.[5] ?? 0;

    // Snap to a bucket so sub-pixel baseline drift within a line does not split it.
    const key = Math.round(y / LINE_EPSILON) * LINE_EPSILON;
    const row = rows.get(key);
    if (row) row.push(item);
    else rows.set(key, [item]);
  }

  // Descending y: PDF's origin is bottom-left, so larger y is higher on the page.
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => {
      const ordered = [...row].sort((a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0));

      let line = "";
      let cursor: number | null = null;

      for (const item of ordered) {
        const x = item.transform?.[4] ?? 0;
        if (cursor !== null) {
          const gap = x - cursor;
          if (gap > COLUMN_GAP) line += "\t";
          else if (gap > 0.5 && !line.endsWith(" ")) line += " ";
        }
        line += item.str;
        cursor = x + (item.width ?? 0);
      }

      return line;
    })
    .filter((line) => line.trim().length > 0);
}

/**
 * Extract text from a PDF.
 *
 * Runs in the browser only — `pdfjs-dist` is imported dynamically so it never
 * lands in a server bundle and never costs anything on a page that does not
 * parse a PDF.
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<PdfExtraction> {
  const pdfjs = await import("pdfjs-dist");

  // Served as a static asset from `public/`, copied there by
  // `scripts/copy-pdf-worker.mjs` on every build. Not resolved through the
  // bundler: `new URL("pdfjs-dist/...", import.meta.url)` makes webpack treat
  // the worker as source and SWC rejects it outright.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  let document;
  try {
    document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // Extraction only — nothing is rendered, so the font and canvas machinery
      // that these enable is pure cost here.
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password/i.test(message)) {
      throw new PdfParseError("That PDF is password-protected. Remove the password and try again.");
    }
    throw new PdfParseError("That file could not be read as a PDF.");
  }

  const warnings: string[] = [];
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = itemsToLines(content.items as TextItemLike[]);

      if (lines.length === 0) warnings.push(`Page ${pageNumber} contained no extractable text.`);
      pages.push(lines.join("\n"));

      // Frees the page's operator list; without it a long PDF holds every page
      // in memory at once.
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  const text = pages.join("\n");

  // The signature of a scanned resume: a valid PDF, real pages, no text layer.
  // Saying so is far more useful than returning an empty string, which the UI
  // would otherwise render as a successful parse of nothing.
  if (text.trim().length === 0) {
    warnings.push(
      "No text could be extracted — this PDF is probably a scan or an image. Text recognition is not available.",
    );
  }

  return { text, pageCount: document.numPages, warnings };
}
