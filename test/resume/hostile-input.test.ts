import { describe, expect, it } from "vitest";
import { validateDocument, validateSelection, formatFileSize } from "@/lib/resume/validation";
import { extractDocxText, extractTextFromDocumentXml, DocxParseError } from "@/lib/resume/parsers/docx";
import { readZipEntryText, ZipFormatError } from "@/lib/resume/parsers/zip";
import { itemsToLines } from "@/lib/resume/parsers/pdf";
import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";
import { buildDocx } from "@/lib/resume/exportDocx";
import { MAX_FILE_BYTES } from "@/types/upload";

/**
 * Hostile input (production hardening).
 *
 * Everything here is a file or a payload a real operator can produce by
 * accident — a scan, a truncated download, a CV in Japanese, a 0-byte export.
 * The bar is not "parses correctly" but "fails in a way the operator can act
 * on, and never silently produces something that costs money to analyse".
 */

function fileOf(name: string, type: string, size: number): File {
  // A real File whose byte content is irrelevant — validation reads metadata only.
  const blob = new Blob([new Uint8Array(Math.min(size, 1024))], { type });
  return Object.defineProperty(new File([blob], name, { type }), "size", { value: size });
}

describe("validation — hostile filenames and sizes", () => {
  it("rejects a zero-byte file rather than accepting an empty upload", () => {
    const outcome = validateDocument(fileOf("resume.pdf", "application/pdf", 0));
    expect(outcome.ok).toBe(false);
  });

  it("rejects an executable renamed to .pdf via its MIME", () => {
    const outcome = validateDocument(fileOf("payload.pdf", "application/x-msdownload", 1000));
    expect(outcome.ok).toBe(false);
  });

  it("rejects a double extension", () => {
    const outcome = validateDocument(fileOf("resume.pdf.exe", "application/octet-stream", 1000));
    expect(outcome.ok).toBe(false);
  });

  it("accepts a legitimate .docx with an empty MIME, which browsers commonly send", () => {
    expect(validateDocument(fileOf("cv.docx", "", 5000)).ok).toBe(true);
  });

  it("does not contradict itself one byte over the limit", () => {
    // Regression: both sides round to "10 MB", so the sentence read "That file
    // is 10 MB. The limit is 10 MB." e50f723 fixed the 10.4 MB case; this is
    // the boundary it did not reach.
    const outcome = validateDocument(fileOf("big.pdf", "application/pdf", MAX_FILE_BYTES + 1));
    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) {
      const m = outcome.rejection.message;
      expect(m).not.toBe(
        `That file is ${formatFileSize(MAX_FILE_BYTES)}. The limit is ${formatFileSize(MAX_FILE_BYTES)}.`,
      );
      expect(m).toContain("just over");
    }
  });

  it("handles a unicode filename without throwing", () => {
    expect(() => validateDocument(fileOf("履歴書.pdf", "application/pdf", 5000))).not.toThrow();
    expect(validateDocument(fileOf("履歴書.pdf", "application/pdf", 5000)).ok).toBe(true);
  });

  it("handles an extensionless file", () => {
    expect(validateDocument(fileOf("resume", "application/pdf", 5000)).ok).toBe(false);
  });

  it("rejects an empty selection rather than throwing", () => {
    expect(() => validateSelection([])).not.toThrow();
    expect(validateSelection([]).ok).toBe(false);
  });

  it("refuses a multi-file drop rather than silently taking the first", () => {
    const outcome = validateSelection([
      fileOf("a.pdf", "application/pdf", 1000),
      fileOf("b.pdf", "application/pdf", 1000),
    ]);
    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) expect(outcome.rejection.message).toContain("2 were received");
  });
});

describe("DOCX — corrupt and adversarial archives", () => {
  it("rejects bytes that are not a ZIP at all", async () => {
    const notZip = new TextEncoder().encode("this is plainly not a zip file").buffer;
    await expect(extractDocxText(notZip as ArrayBuffer)).rejects.toBeInstanceOf(Error);
  });

  it("rejects an empty buffer", async () => {
    await expect(extractDocxText(new ArrayBuffer(0))).rejects.toBeInstanceOf(Error);
  });

  it("rejects a truncated archive — first half of a real DOCX", async () => {
    const whole = buildDocx("T", [{ heading: "H", lines: ["L"] }]);
    const half = whole.slice(0, Math.floor(whole.length / 2));
    await expect(extractDocxText(half.buffer as ArrayBuffer)).rejects.toBeInstanceOf(Error);
  });

  it("returns null for a missing entry, and extractDocxText turns that into an error", async () => {
    // A real archive, correct structure, wrong contents — a .pptx or .xlsx
    // passes a ZIP check. The reader reports absence; the caller decides it is
    // fatal, so the operator is told rather than shown an empty resume.
    const archive = buildDocx("x", []);
    await expect(
      readZipEntryText(archive.buffer as ArrayBuffer, "word/nonexistent.xml"),
    ).resolves.toBeNull();
  });

  it("surfaces a DocxParseError, not a raw library error", async () => {
    const notZip = new TextEncoder().encode("nope").buffer;
    await expect(extractDocxText(notZip as ArrayBuffer)).rejects.toBeInstanceOf(DocxParseError);
  });
});

describe("DOCX XML — malformed and non-English content", () => {
  it("returns empty rather than throwing on unclosed tags", () => {
    expect(() => extractTextFromDocumentXml("<w:document><w:body><w:p><w:t>hi")).not.toThrow();
  });

  it("returns empty for XML with no text runs", () => {
    expect(extractTextFromDocumentXml("<w:document><w:body/></w:document>").trim()).toBe("");
  });

  it("preserves CJK text", () => {
    const xml = "<w:document><w:body><w:p><w:t>山田太郎 職務経歴書</w:t></w:p></w:body></w:document>";
    expect(extractTextFromDocumentXml(xml)).toContain("山田太郎");
  });

  it("preserves right-to-left Arabic text", () => {
    const xml = "<w:document><w:body><w:p><w:t>السيرة الذاتية</w:t></w:p></w:body></w:document>";
    expect(extractTextFromDocumentXml(xml)).toContain("السيرة الذاتية");
  });

  it("preserves accented Latin and decodes entities", () => {
    const xml =
      "<w:document><w:body><w:p><w:t>José Müller &amp; Co &lt;lead&gt;</w:t></w:p></w:body></w:document>";
    const out = extractTextFromDocumentXml(xml);
    expect(out).toContain("José Müller");
    expect(out).toContain("& Co <lead>");
  });

  it("survives a deeply nested document without stack overflow", () => {
    const nested = "<w:p>".repeat(5000) + "<w:t>deep</w:t>" + "</w:p>".repeat(5000);
    expect(() =>
      extractTextFromDocumentXml(`<w:document><w:body>${nested}</w:body></w:document>`),
    ).not.toThrow();
  });
});

describe("PDF line assembly — degenerate item streams", () => {
  it("returns no lines for no items", () => {
    expect(itemsToLines([])).toEqual([]);
  });

  it("ignores items with empty strings", () => {
    expect(itemsToLines([{ str: "" }, { str: "   " }, { str: "" }])).toEqual([]);
  });

  it("survives items with missing transforms", () => {
    expect(() => itemsToLines([{ str: "a" }, { str: "b" }])).not.toThrow();
  });

  it("survives NaN and Infinity in a transform", () => {
    // A malformed PDF can produce these; sorting on them must not hang or throw.
    expect(() =>
      itemsToLines([
        { str: "a", transform: [1, 0, 0, 1, NaN, NaN] },
        { str: "b", transform: [1, 0, 0, 1, Infinity, -Infinity] },
        { str: "c", transform: [1, 0, 0, 1, 0, 0] },
      ]),
    ).not.toThrow();
  });

  it("handles a very large item count without blowing up", () => {
    const items = Array.from({ length: 20_000 }, (_, i) => ({
      str: `w${i}`,
      transform: [1, 0, 0, 1, (i % 50) * 10, Math.floor(i / 50) * -12],
      width: 8,
    }));
    const lines = itemsToLines(items);
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe("normalize and sections — hostile text", () => {
  it("handles empty input", () => {
    const { text, lines } = normalizeText("");
    expect(text).toBe("");
    expect(lines).toEqual([]);
  });

  it("handles whitespace-only input", () => {
    expect(normalizeText("   \n\n \t \n  ").lines).toEqual([]);
  });

  it("strips control characters rather than emitting them", () => {
    const { text } = normalizeText("Name  Surname");
    expect(text).not.toMatch(/[ -]/);
  });

  it("does not mangle CJK or emoji", () => {
    const { text } = normalizeText("山田太郎\nSenior Engineer 🚀");
    expect(text).toContain("山田太郎");
  });

  it("detects sections on an empty document without throwing", () => {
    expect(() => detectSections([])).not.toThrow();
    expect(detectSections([])).toEqual([]);
  });

  it("does not treat a comma-separated skills line as a heading", () => {
    // Regression: the title-case branch once accepted any capitalised line and
    // emptied the section above it.
    const sections = detectSections(["TypeScript, Go, PostgreSQL, Kafka"]);
    expect(sections.every((s) => s.kind === "other")).toBe(true);
  });

  it("survives a single enormous line", () => {
    const huge = "word ".repeat(100_000);
    expect(() => detectSections(normalizeText(huge).lines)).not.toThrow();
  });
});
