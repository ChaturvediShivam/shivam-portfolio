import { describe, it, expect } from "vitest";
import { itemsToLines, type TextItemLike } from "@/lib/resume/parsers/pdf";
import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";

/**
 * PDF line assembly (Resume AI · Phase 2).
 *
 * `itemsToLines` is the only PDF logic this project owns — everything below it
 * is pdf.js. It is tested directly because it is where the interesting mistakes
 * live: pdf.js hands back positioned fragments in content-stream order with no
 * line structure, and reassembling them wrongly produces text that looks
 * plausible and is scrambled.
 *
 * Coordinates follow PDF convention: `transform` is a 6-element matrix whose
 * last two entries are x and y, and the origin is bottom-left — so a LARGER y
 * is HIGHER on the page.
 */

function item(str: string, x: number, y: number, width = str.length * 5): TextItemLike {
  return { str, transform: [12, 0, 0, 12, x, y], width };
}

describe("itemsToLines", () => {
  it("groups fragments sharing a baseline into one line", () => {
    const lines = itemsToLines([item("Senior ", 72, 700, 40), item("Engineer", 112, 700, 45)]);
    expect(lines).toEqual(["Senior Engineer"]);
  });

  it("orders lines top to bottom, not in content-stream order", () => {
    // Deliberately supplied bottom-up, as a generator may well emit them.
    const lines = itemsToLines([item("Third", 72, 660), item("First", 72, 700), item("Second", 72, 680)]);
    expect(lines).toEqual(["First", "Second", "Third"]);
  });

  it("orders fragments left to right within a line", () => {
    // Widths chosen so the fragments sit adjacent: "hello" spans 72-102 and
    // "world" starts at 105, a 3-unit gap that is one space, not a column break.
    const lines = itemsToLines([item("world", 105, 700, 30), item("hello", 72, 700, 30)]);
    expect(lines).toEqual(["hello world"]);
  });

  it("tolerates sub-pixel baseline drift within one line", () => {
    // Superscripts and kerning shift the baseline slightly; the line must hold.
    const lines = itemsToLines([item("Acme", 72, 700, 25), item("Corp", 98, 700.7, 25)]);
    expect(lines).toEqual(["Acme Corp"]);
  });

  it("separates a wide gap with a tab, not a space", () => {
    // The gap between a job title and its right-aligned dates. Collapsing it to
    // a space would join them into one token.
    const lines = itemsToLines([item("Senior Engineer", 72, 700, 80), item("2021-2024", 400, 700, 50)]);
    expect(lines[0]).toBe("Senior Engineer\t2021-2024");
  });

  it("does not insert a space between adjacent fragments", () => {
    // Fonts split words mid-token; a space here would break "TypeScript".
    const lines = itemsToLines([item("Type", 72, 700, 20), item("Script", 92, 700, 30)]);
    expect(lines).toEqual(["TypeScript"]);
  });

  it("drops fragments with no text and lines that are only whitespace", () => {
    const lines = itemsToLines([item("", 72, 700), item("   ", 72, 680), item("Real", 72, 660)]);
    expect(lines).toEqual(["Real"]);
  });

  it("returns nothing for a page with no items", () => {
    expect(itemsToLines([])).toEqual([]);
  });

  it("handles items with no transform without throwing", () => {
    const lines = itemsToLines([{ str: "Orphan" }]);
    expect(lines).toEqual(["Orphan"]);
  });

  it("reassembles a two-column header into readable lines", () => {
    const lines = itemsToLines([
      item("Alice Mercer", 72, 720, 70),
      item("alice@example.com", 400, 720, 90),
      item("Backend Engineer", 72, 700, 85),
      item("+1 555 0100", 400, 700, 60),
    ]);

    expect(lines).toEqual(["Alice Mercer\talice@example.com", "Backend Engineer\t+1 555 0100"]);
  });

  it("feeds the rest of the pipeline correctly", () => {
    const lines = itemsToLines([
      item("Alice Mercer", 72, 720, 70),
      item("TECHNICAL SKILLS", 72, 690, 95),
      item("TypeScript, Go", 72, 670, 75),
      item("EDUCATION", 72, 640, 60),
      item("BSc Computer Science", 72, 620, 110),
    ]);

    const normalized = normalizeText(lines.join("\n"));
    const sections = detectSections(normalized.lines);

    expect(sections.map((s) => s.kind)).toEqual(["other", "skills", "education"]);
    expect(sections[1].lines).toEqual(["TypeScript, Go"]);
  });
});
