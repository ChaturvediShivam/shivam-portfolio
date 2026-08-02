import { describe, it, expect } from "vitest";
import {
  normalizeCharacters,
  normalizeLine,
  normalizeText,
  rejoinHyphenatedWords,
  stripBullet,
} from "@/lib/resume/normalize";

/**
 * Text normalization (Resume AI · Phase 2).
 *
 * Every case here is something a real extractor emits. The failure mode being
 * guarded against is silent: an invisible zero-width space inside "JavaScript"
 * does not look wrong in a preview panel, but it makes every keyword match miss.
 */

describe("normalizeCharacters", () => {
  it("replaces non-breaking and typographic spaces with a plain space", () => {
    expect(normalizeCharacters("Senior Engineer")).toBe("Senior Engineer");
    expect(normalizeCharacters("A B C")).toBe("A B C");
  });

  it("strips zero-width characters that would break keyword matching", () => {
    expect(normalizeCharacters("Java​Script")).toBe("JavaScript");
    expect(normalizeCharacters("﻿Skills")).toBe("Skills");
  });

  it("expands the ligatures PDF extraction emits", () => {
    expect(normalizeCharacters("eﬃcient")).toBe("efficient");
    expect(normalizeCharacters("ﬁnance and ﬂow")).toBe("finance and flow");
  });

  it("flattens smart punctuation", () => {
    expect(normalizeCharacters("“Lead” — don’t")).toBe('"Lead" - don\'t');
    expect(normalizeCharacters("wait…")).toBe("wait...");
  });

  it("normalizes CRLF and lone CR to LF", () => {
    expect(normalizeCharacters("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("rejoinHyphenatedWords", () => {
  it("rejoins a word split across lines by layout hyphenation", () => {
    expect(rejoinHyphenatedWords("engi-\nneering")).toBe("engineering");
  });

  it("leaves a genuine hyphenated term alone", () => {
    // The next line starting uppercase means the hyphen was real, not a break.
    expect(rejoinHyphenatedWords("full-\nStack")).toBe("full-\nStack");
  });

  it("leaves a hyphen not at a line end alone", () => {
    expect(rejoinHyphenatedWords("well-known")).toBe("well-known");
  });
});

describe("stripBullet", () => {
  it("removes the common bullet glyphs and reports that it did", () => {
    for (const bullet of ["•", "·", "▪", "◦", "‣", "∙", "-", "*"]) {
      expect(stripBullet(`${bullet} Led a team`)).toEqual({ text: "Led a team", bulleted: true });
    }
  });

  it("leaves an unbulleted line untouched", () => {
    expect(stripBullet("Led a team")).toEqual({ text: "Led a team", bulleted: false });
  });

  it("does not strip a hyphen that is part of a word", () => {
    expect(stripBullet("full-stack developer").bulleted).toBe(false);
  });
});

describe("normalizeLine", () => {
  it("collapses tabs and runs of spaces, and trims", () => {
    expect(normalizeLine("  Senior\t\tEngineer   ")).toBe("Senior Engineer");
  });
});

describe("normalizeText", () => {
  it("returns text and lines that agree with each other", () => {
    const { text, lines } = normalizeText("Alice\n\nSKILLS\n  TypeScript  ");
    expect(lines).toEqual(["Alice", "SKILLS", "TypeScript"]);
    expect(text).toBe("Alice\nSKILLS\nTypeScript");
  });

  it("drops blank lines so line indices do not depend on vertical spacing", () => {
    // Section boundaries are line indices; if blank lines survived, the same
    // resume exported with looser spacing would produce different indices.
    const { lines } = normalizeText("A\n\n\n\nB");
    expect(lines).toEqual(["A", "B"]);
  });

  it("handles an empty document without throwing", () => {
    expect(normalizeText("")).toEqual({ text: "", lines: [] });
    expect(normalizeText("   \n\t\n  ")).toEqual({ text: "", lines: [] });
  });

  it("applies character fixes before splitting", () => {
    const { lines } = normalizeText("Java​Script\r\nPy thon");
    expect(lines).toEqual(["JavaScript", "Py thon"]);
  });
});
