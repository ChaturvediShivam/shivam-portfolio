import { describe, it, expect } from "vitest";
import { extractDocxText, extractTextFromDocumentXml, DocxParseError } from "@/lib/resume/parsers/docx";
import { readZipEntryText, ZipFormatError } from "@/lib/resume/parsers/zip";
import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";

/**
 * DOCX extraction (Resume AI · Phase 2).
 *
 * The XML tokenizer is tested directly, so most cases need no archive. The ZIP
 * reader is then exercised against a real archive built in-test — a fixture
 * file would hide whether the central-directory walk actually works, which is
 * the part most likely to be subtly wrong.
 */

// ---------------------------------------------------------------------------
// A minimal ZIP writer, for tests only. STORE (no compression) is enough to
// exercise the reader's central-directory walk and offset arithmetic.
// ---------------------------------------------------------------------------

function crc32(bytes: Uint8Array): number {
  let table = (crc32 as { table?: number[] }).table;
  if (!table) {
    table = [];
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    (crc32 as { table?: number[] }).table = table;
  }

  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a ZIP archive containing the given entries, stored uncompressed. */
function buildZip(entries: { name: string; content: string }[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const sum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true); // STORE
    localView.setUint32(14, sum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, 0, true); // STORE
    centralView.setUint32(16, sum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out.buffer;
}

function docx(xml: string): ArrayBuffer {
  return buildZip([
    { name: "[Content_Types].xml", content: "<Types/>" },
    { name: "word/document.xml", content: xml },
  ]);
}

const wrap = (body: string) => `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`;
const para = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

// ---------------------------------------------------------------------------

describe("extractTextFromDocumentXml", () => {
  it("extracts text runs and breaks paragraphs onto their own lines", () => {
    const xml = wrap(para("Alice Mercer") + para("SKILLS"));
    expect(extractTextFromDocumentXml(xml).trim()).toBe("Alice Mercer\nSKILLS");
  });

  it("joins runs within one paragraph without inserting a break", () => {
    // Word splits a styled phrase into several runs; they are one line.
    const xml = wrap(`<w:p><w:r><w:t>Senior </w:t></w:r><w:r><w:t>Engineer</w:t></w:r></w:p>`);
    expect(extractTextFromDocumentXml(xml).trim()).toBe("Senior Engineer");
  });

  it("honours xml:space preserve on a run", () => {
    const xml = wrap(`<w:p><w:r><w:t xml:space="preserve">Go </w:t></w:r><w:r><w:t>Lang</w:t></w:r></w:p>`);
    expect(extractTextFromDocumentXml(xml).trim()).toBe("Go Lang");
  });

  it("turns an explicit break into a newline", () => {
    const xml = wrap(`<w:p><w:r><w:t>One</w:t><w:br/><w:t>Two</w:t></w:r></w:p>`);
    expect(extractTextFromDocumentXml(xml).trim()).toBe("One\nTwo");
  });

  it("turns a tab into a tab, so a role and its dates stay separate", () => {
    const xml = wrap(`<w:p><w:r><w:t>Engineer</w:t><w:tab/><w:t>2021-2024</w:t></w:r></w:p>`);
    expect(extractTextFromDocumentXml(xml)).toContain("Engineer\t2021-2024");
  });

  it("decodes XML entities, ampersand last", () => {
    const xml = wrap(para("R&amp;D &lt;lead&gt; &quot;x&quot; &#39;y&#39;"));
    expect(extractTextFromDocumentXml(xml).trim()).toBe(`R&D <lead> "x" 'y'`);
  });

  it("does not decode a doubly-encoded entity twice", () => {
    // &amp;lt; is a literal "&lt;", not a "<".
    expect(extractTextFromDocumentXml(wrap(para("&amp;lt;"))).trim()).toBe("&lt;");
  });

  it("ignores formatting elements entirely", () => {
    const xml = wrap(
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>EXPERIENCE</w:t></w:r></w:p>`,
    );
    expect(extractTextFromDocumentXml(xml).trim()).toBe("EXPERIENCE");
  });

  it("returns empty for a document with no text", () => {
    expect(extractTextFromDocumentXml(wrap("")).trim()).toBe("");
  });
});

describe("readZipEntryText", () => {
  it("reads a stored entry out of a real archive", async () => {
    const archive = buildZip([{ name: "word/document.xml", content: "<w:document/>" }]);
    expect(await readZipEntryText(archive, "word/document.xml")).toBe("<w:document/>");
  });

  it("finds the right entry among several", async () => {
    const archive = buildZip([
      { name: "a.xml", content: "AAA" },
      { name: "word/document.xml", content: "BBB" },
      { name: "z.xml", content: "CCC" },
    ]);
    expect(await readZipEntryText(archive, "word/document.xml")).toBe("BBB");
  });

  it("returns null for an entry that is not present", async () => {
    const archive = buildZip([{ name: "a.xml", content: "AAA" }]);
    expect(await readZipEntryText(archive, "word/document.xml")).toBeNull();
  });

  it("rejects something that is not a ZIP at all", async () => {
    const notZip = new TextEncoder().encode("just some text, definitely not a zip").buffer;
    await expect(readZipEntryText(notZip, "word/document.xml")).rejects.toBeInstanceOf(ZipFormatError);
  });
});

describe("readZipEntryText — deflate", () => {
  /** Build a single-entry archive whose payload is DEFLATE-compressed. */
  async function buildDeflatedZip(name: string, content: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(content);
    const sum = crc32(raw);

    const compressed = new Uint8Array(
      await new Response(
        new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw")),
      ).arrayBuffer(),
    );

    const local = new Uint8Array(30 + nameBytes.length + compressed.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true); // DEFLATE
    lv.setUint32(14, sum, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(compressed, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true); // DEFLATE
    cv.setUint32(16, sum, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, 0, true);
    central.set(nameBytes, 46);

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length, true);

    const out = new Uint8Array(local.length + central.length + eocd.length);
    out.set(local, 0);
    out.set(central, local.length);
    out.set(eocd, local.length + central.length);
    return out.buffer;
  }

  it("inflates a deflated entry — the path every real DOCX takes", async () => {
    // Long enough that deflate actually compresses rather than storing.
    const content = wrap(para("Alice Mercer").repeat(40));
    const archive = await buildDeflatedZip("word/document.xml", content);

    expect(await readZipEntryText(archive, "word/document.xml")).toBe(content);
  });

  it("extracts text from a deflated DOCX end to end", async () => {
    const xml = wrap(para("EXPERIENCE") + para("Led the migration") + para("x".repeat(500)));
    const archive = await buildDeflatedZip("word/document.xml", xml);

    const text = await extractDocxText(archive);
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Led the migration");
  });
});

describe("extractDocxText", () => {
  it("reads a whole DOCX end to end", async () => {
    const text = await extractDocxText(docx(wrap(para("Alice Mercer") + para("EDUCATION"))));
    expect(text).toContain("Alice Mercer");
    expect(text).toContain("EDUCATION");
  });

  it("reports a ZIP that is not a Word document", async () => {
    // .pptx and .xlsx are valid ZIPs and would otherwise fail confusingly later.
    const notWord = buildZip([{ name: "ppt/presentation.xml", content: "<p/>" }]);
    await expect(extractDocxText(notWord)).rejects.toBeInstanceOf(DocxParseError);
  });

  it("reports an unreadable file as a DOCX problem, not a ZIP one", async () => {
    const garbage = new TextEncoder().encode("nope").buffer;
    await expect(extractDocxText(garbage)).rejects.toBeInstanceOf(DocxParseError);
  });

  it("feeds the rest of the pipeline correctly", async () => {
    const xml = wrap(
      para("Alice Mercer") +
        para("PROFESSIONAL SUMMARY") +
        para("Backend engineer.") +
        para("TECHNICAL SKILLS") +
        para("TypeScript, Go"),
    );

    const raw = await extractDocxText(docx(xml));
    const { lines } = normalizeText(raw);
    const sections = detectSections(lines);

    expect(sections.map((s) => s.kind)).toEqual(["other", "summary", "skills"]);
    expect(sections[2].lines).toEqual(["TypeScript, Go"]);
  });
});
