/**
 * Minimal DOCX writer (Resume AI · Feature 2).
 *
 * The mirror image of `lib/resume/parsers/zip.ts`, which reads this format. A
 * DOCX is a ZIP holding three small XML parts, and writing one needs a local
 * header, a central directory and an end-of-central-directory record — about a
 * hundred lines. `docx`, `jszip` and friends are 100-300 KB of client bundle to
 * produce a file this simple, on a page that already ships a parser.
 *
 * Entries are STORED (compression method 0), not deflated. Word, Google Docs,
 * Pages and LibreOffice all accept stored entries, and it removes the only part
 * that would need `CompressionStream` — so this runs identically in every
 * browser and in Node, and is unit-testable without a DOM.
 *
 * ponytail: STORE only, no ZIP64, no encryption. A resume is kilobytes; the
 * 4 GB and 65,535-entry ZIP limits are not reachable here. If this ever needs to
 * compress, `CompressionStream("deflate-raw")` is the upgrade path — the same
 * primitive the reader already uses.
 */

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const METHOD_STORE = 0;
/** ZIP needs a DOS timestamp; a fixed one makes output byte-identical across runs. */
const DOS_TIME = 0;
const DOS_DATE = 0x2821; // 2020-01-01

/** CRC-32, table built once. Required by the ZIP central directory. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Escape the five XML-significant characters. Resume text is arbitrary user prose. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface DocxSection {
  heading: string;
  /** Body lines. Each becomes its own paragraph, preserving bullet structure. */
  lines: string[];
}

/**
 * WordprocessingML for one paragraph.
 *
 * `xml:space="preserve"` matters: without it Word collapses leading whitespace,
 * and indented sub-bullets lose their indentation on open.
 */
function paragraph(textValue: string, opts: { bold?: boolean; size?: number } = {}): string {
  const runProps = [
    opts.bold ? "<w:b/>" : "",
    opts.size ? `<w:sz w:val="${opts.size}"/>` : "",
  ].join("");

  return (
    "<w:p>" +
    (runProps ? `<w:pPr><w:rPr>${runProps}</w:rPr></w:pPr>` : "") +
    "<w:r>" +
    (runProps ? `<w:rPr>${runProps}</w:rPr>` : "") +
    `<w:t xml:space="preserve">${escapeXml(textValue)}</w:t>` +
    "</w:r></w:p>"
  );
}

function documentXml(title: string, sections: DocxSection[]): string {
  const body = [
    paragraph(title, { bold: true, size: 32 }),
    ...sections.flatMap((section) => [
      paragraph("", {}),
      paragraph(section.heading, { bold: true, size: 26 }),
      ...section.lines.map((line) => paragraph(line)),
    ]),
  ].join("");

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}<w:sectPr/></w:body></w:document>`
  );
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>";

const RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

interface Entry {
  name: string;
  bytes: Uint8Array;
  crc: number;
  offset: number;
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

/** Build a STORED-entry ZIP from name → bytes. */
function buildZip(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const prepared = files.map((file) => {
    const bytes = encoder.encode(file.content);
    return { name: file.name, bytes, crc: crc32(bytes), offset: 0 } as Entry;
  });

  const nameBytes = prepared.map((entry) => encoder.encode(entry.name));

  const localSize = prepared.reduce(
    (sum, entry, i) => sum + 30 + nameBytes[i].length + entry.bytes.length,
    0,
  );
  const centralSize = prepared.reduce((sum, _entry, i) => sum + 46 + nameBytes[i].length, 0);

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let cursor = 0;

  // Local file headers + data.
  prepared.forEach((entry, i) => {
    entry.offset = cursor;
    writeUint32(view, cursor, LOCAL_SIGNATURE);
    view.setUint16(cursor + 4, 20, true); // version needed
    view.setUint16(cursor + 6, 0, true); // flags
    view.setUint16(cursor + 8, METHOD_STORE, true);
    view.setUint16(cursor + 10, DOS_TIME, true);
    view.setUint16(cursor + 12, DOS_DATE, true);
    writeUint32(view, cursor + 14, entry.crc);
    writeUint32(view, cursor + 18, entry.bytes.length); // compressed
    writeUint32(view, cursor + 22, entry.bytes.length); // uncompressed
    view.setUint16(cursor + 26, nameBytes[i].length, true);
    view.setUint16(cursor + 28, 0, true); // extra length
    cursor += 30;
    out.set(nameBytes[i], cursor);
    cursor += nameBytes[i].length;
    out.set(entry.bytes, cursor);
    cursor += entry.bytes.length;
  });

  const centralStart = cursor;

  // Central directory.
  prepared.forEach((entry, i) => {
    writeUint32(view, cursor, CENTRAL_SIGNATURE);
    view.setUint16(cursor + 4, 20, true); // version made by
    view.setUint16(cursor + 6, 20, true); // version needed
    view.setUint16(cursor + 8, 0, true);
    view.setUint16(cursor + 10, METHOD_STORE, true);
    view.setUint16(cursor + 12, DOS_TIME, true);
    view.setUint16(cursor + 14, DOS_DATE, true);
    writeUint32(view, cursor + 16, entry.crc);
    writeUint32(view, cursor + 20, entry.bytes.length);
    writeUint32(view, cursor + 24, entry.bytes.length);
    view.setUint16(cursor + 28, nameBytes[i].length, true);
    view.setUint16(cursor + 30, 0, true); // extra
    view.setUint16(cursor + 32, 0, true); // comment
    view.setUint16(cursor + 34, 0, true); // disk
    view.setUint16(cursor + 36, 0, true); // internal attrs
    writeUint32(view, cursor + 38, 0); // external attrs
    writeUint32(view, cursor + 42, entry.offset);
    cursor += 46;
    out.set(nameBytes[i], cursor);
    cursor += nameBytes[i].length;
  });

  // End of central directory.
  writeUint32(view, cursor, EOCD_SIGNATURE);
  view.setUint16(cursor + 4, 0, true);
  view.setUint16(cursor + 6, 0, true);
  view.setUint16(cursor + 8, prepared.length, true);
  view.setUint16(cursor + 10, prepared.length, true);
  writeUint32(view, cursor + 12, cursor - centralStart);
  writeUint32(view, cursor + 16, centralStart);
  view.setUint16(cursor + 20, 0, true);

  return out;
}

/** Build a .docx as bytes. Pure — no DOM, so it is unit-testable. */
export function buildDocx(title: string, sections: DocxSection[]): Uint8Array {
  return buildZip([
    { name: "[Content_Types].xml", content: CONTENT_TYPES_XML },
    { name: "_rels/.rels", content: RELS_XML },
    { name: "word/document.xml", content: documentXml(title, sections) },
  ]);
}

/** Trigger a browser download. Separated from `buildDocx` so that stays testable. */
export function downloadDocx(filename: string, title: string, sections: DocxSection[]): void {
  // `.buffer` is typed `ArrayBufferLike`, which admits SharedArrayBuffer and so
  // is not a `BlobPart`. The allocation here is always a plain ArrayBuffer.
  const bytes = buildDocx(title, sections);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
