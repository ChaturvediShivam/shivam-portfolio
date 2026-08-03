import { describe, expect, it } from "vitest";
import { changeRatio, diffWords, tokenize } from "@/lib/resume/diff";
import { buildDocx, escapeXml } from "@/lib/resume/exportDocx";
import { extractDocxText } from "@/lib/resume/parsers/docx";
import { readZipEntryText } from "@/lib/resume/parsers/zip";

describe("tokenize", () => {
  it("keeps whitespace so joining reproduces the input exactly", () => {
    const input = "Led  the\nmigration of 40 services";
    expect(tokenize(input).join("")).toBe(input);
  });

  it("returns an empty list for an empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("diffWords", () => {
  it("marks every token equal when nothing changed", () => {
    const tokens = diffWords("Managed large datasets", "Managed large datasets");
    expect(tokens.every((t) => t.op === "equal")).toBe(true);
    expect(changeRatio(tokens)).toBe(0);
  });

  it("treats re-spacing and case as unchanged", () => {
    // A differ that flagged these would mark noise as edits and train the
    // operator to stop reading the highlights.
    const tokens = diffWords("Managed  LARGE datasets", "managed large   datasets");
    expect(tokens.every((t) => t.op === "equal")).toBe(true);
  });

  it("isolates an inserted word rather than replacing the whole line", () => {
    const tokens = diffWords("Managed datasets", "Managed large datasets");
    expect(tokens.filter((t) => t.op === "insert").map((t) => t.value.trim())).toEqual(["large"]);
    expect(tokens.filter((t) => t.op === "delete")).toHaveLength(0);
  });

  it("isolates a deleted word", () => {
    const tokens = diffWords("Managed large datasets", "Managed datasets");
    expect(tokens.filter((t) => t.op === "delete").map((t) => t.value.trim())).toEqual(["large"]);
  });

  it("reconstructs the original by skipping inserts", () => {
    const original = "Built reports for the team";
    const rewritten = "Built and shipped dashboards for the team";
    const tokens = diffWords(original, rewritten);
    const rebuilt = tokens
      .filter((t) => t.op !== "insert")
      .map((t) => t.value)
      .join("");
    expect(rebuilt.trim().toLowerCase()).toBe(original.trim().toLowerCase());
  });

  it("reconstructs the rewrite by skipping deletes", () => {
    const original = "Built reports for the team";
    const rewritten = "Built and shipped dashboards for the team";
    const tokens = diffWords(original, rewritten);
    const rebuilt = tokens
      .filter((t) => t.op !== "delete")
      .map((t) => t.value)
      .join("");
    expect(rebuilt).toBe(rewritten);
  });

  it("handles an empty original as pure insertion", () => {
    const tokens = diffWords("", "brand new line");
    expect(tokens.every((t) => t.op === "insert")).toBe(true);
  });

  it("falls back to whole-block replace past the token cap", () => {
    // Guards the O(n·m) table. The result must still be honest — it says the
    // block changed without claiming token precision it declined to compute.
    const big = "word ".repeat(2100);
    const tokens = diffWords(big, "short");
    expect(tokens).toHaveLength(2);
    expect(tokens[0].op).toBe("delete");
    expect(tokens[1].op).toBe("insert");
  });
});

describe("escapeXml", () => {
  it("escapes all five XML-significant characters", () => {
    expect(escapeXml(`R&D <"tag"> 'x'`)).toBe("R&amp;D &lt;&quot;tag&quot;&gt; &apos;x&apos;");
  });
});

describe("buildDocx", () => {
  const sections = [
    { heading: "Professional Summary", lines: ["Research analyst with 3+ years."] },
    { heading: "Experience", lines: ["• Built dashboards", "• Managed <large> datasets & reports"] },
  ];

  it("produces a ZIP the project's own reader can open", async () => {
    // Round trip through lib/resume/parsers/zip.ts — the reader that already
    // ships. If this passes, Word can open it for the same reasons.
    const bytes = buildDocx("Jane Doe", sections);
    const xml = await readZipEntryText(bytes.buffer as ArrayBuffer, "word/document.xml");
    expect(xml).toContain("<w:document");
    expect(xml).toContain("Professional Summary");
  });

  it("round-trips through the DOCX text extractor with content intact", async () => {
    const bytes = buildDocx("Jane Doe", sections);
    const text = await extractDocxText(bytes.buffer as ArrayBuffer);
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Research analyst with 3+ years.");
    expect(text).toContain("Built dashboards");
  });

  it("escapes XML metacharacters so they survive as literal text", async () => {
    // "Managed <large> datasets & reports" would produce invalid XML unescaped,
    // and the file would fail to open rather than fail visibly here.
    const bytes = buildDocx("Jane Doe", sections);
    const text = await extractDocxText(bytes.buffer as ArrayBuffer);
    expect(text).toContain("Managed <large> datasets & reports");
  });

  it("writes the three parts a DOCX requires", async () => {
    const bytes = buildDocx("T", [{ heading: "H", lines: ["L"] }]);
    const buffer = bytes.buffer as ArrayBuffer;
    await expect(readZipEntryText(buffer, "[Content_Types].xml")).resolves.toContain("Types");
    await expect(readZipEntryText(buffer, "_rels/.rels")).resolves.toContain("Relationships");
    await expect(readZipEntryText(buffer, "word/document.xml")).resolves.toContain("w:body");
  });

  it("is deterministic — same input, byte-identical output", () => {
    // Fixed DOS timestamps. A changing mtime would make every download differ
    // and defeat any future content-hash caching.
    expect(buildDocx("T", sections)).toEqual(buildDocx("T", sections));
  });
});
