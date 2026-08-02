import { describe, it, expect } from "vitest";
import { detectSections, headingKind, looksLikeUnknownHeading, normalizeHeading } from "@/lib/resume/sections";
import { normalizeText } from "@/lib/resume/normalize";
import { sectionOfKind } from "@/types/resume";
import type { ParsedResume } from "@/types/resume";

/**
 * Section detection (Resume AI · Phase 2).
 *
 * Two failure modes, and they are not equally bad. A MISSED heading merges two
 * sections and leaves every line intact. A FALSE heading splits a bullet list
 * mid-way, so the section above looks truncated and the one below looks like it
 * has a nonsense title. The tests are weighted toward the false-positive cases
 * for that reason.
 */

function parsedFrom(lines: string[]): ParsedResume {
  return {
    text: lines.join("\n"),
    lines,
    sections: detectSections(lines),
    pageCount: null,
    truncated: false,
    parser: "test",
    warnings: [],
  };
}

describe("normalizeHeading", () => {
  it("lowercases and drops trailing punctuation", () => {
    expect(normalizeHeading("SKILLS:")).toBe("skills");
    expect(normalizeHeading("Experience —")).toBe("experience");
  });

  it("rejoins a letter-spaced heading", () => {
    // Tracked-out headings arrive from PDF as individual characters.
    expect(normalizeHeading("S K I L L S")).toBe("skills");
    expect(normalizeHeading("E D U C A T I O N")).toBe("education");
  });

  it("does not rejoin a genuine two-word heading", () => {
    expect(normalizeHeading("Work Experience")).toBe("work experience");
  });
});

describe("headingKind", () => {
  const cases: [string, string][] = [
    ["SUMMARY", "summary"],
    ["Professional Summary", "summary"],
    ["Career Objective", "summary"],
    ["Skills", "skills"],
    ["TECHNICAL SKILLS", "skills"],
    ["Core Competencies", "skills"],
    ["Tech Stack", "skills"],
    ["Experience", "experience"],
    ["WORK EXPERIENCE", "experience"],
    ["Employment History", "experience"],
    ["Education", "education"],
    ["Academic Background", "education"],
    ["Projects", "projects"],
    ["Selected Projects", "projects"],
    ["Certifications", "certifications"],
    ["Licenses and Certifications", "certifications"],
  ];

  for (const [line, expected] of cases) {
    it(`classifies "${line}" as ${expected}`, () => {
      expect(headingKind(line)).toBe(expected);
    });
  }

  it("is case- and colon-insensitive", () => {
    expect(headingKind("skills:")).toBe("skills");
    expect(headingKind("  Skills  ")).toBe("skills");
  });

  it("does not treat a sentence beginning with a keyword as a heading", () => {
    // The false positive that would split a section mid-sentence.
    expect(headingKind("Experience designing distributed systems at scale")).toBeNull();
    expect(headingKind("Skills include TypeScript, Go, and Postgres")).toBeNull();
  });

  it("rejects a line that is too long to be a label", () => {
    expect(headingKind("Summary " + "x".repeat(80))).toBeNull();
  });

  it("returns null for ordinary content", () => {
    expect(headingKind("Acme Corp — Senior Engineer")).toBeNull();
    expect(headingKind("• Led a team of six")).toBeNull();
  });
});

describe("looksLikeUnknownHeading", () => {
  it("accepts a short all-caps label", () => {
    expect(looksLikeUnknownHeading("PUBLICATIONS")).toBe(true);
    expect(looksLikeUnknownHeading("Awards")).toBe(true);
  });

  it("rejects content that merely happens to be short", () => {
    expect(looksLikeUnknownHeading("• Led a team")).toBe(false);
    expect(looksLikeUnknownHeading("Built the thing.")).toBe(false);
    expect(looksLikeUnknownHeading("2021 - 2024")).toBe(false);
    expect(looksLikeUnknownHeading("me@example.com")).toBe(false);
    expect(looksLikeUnknownHeading("https://example.com")).toBe(false);
  });

  it("rejects a full sentence", () => {
    expect(looksLikeUnknownHeading("Led the migration of a large monolith")).toBe(false);
  });
});

describe("detectSections", () => {
  const RESUME = [
    "Alice Mercer",
    "alice@example.com | +1 555 0100",
    "SUMMARY",
    "Backend engineer with eight years building payment systems.",
    "TECHNICAL SKILLS",
    "TypeScript, Go, PostgreSQL, Kafka",
    "WORK EXPERIENCE",
    "Acme Corp - Senior Engineer",
    "Led the migration to event sourcing",
    "EDUCATION",
    "BSc Computer Science, University of Leeds",
    "CERTIFICATIONS",
    "AWS Solutions Architect",
  ];

  it("splits a conventional resume into its sections", () => {
    const sections = detectSections(RESUME);
    expect(sections.map((s) => s.kind)).toEqual([
      "other",
      "summary",
      "skills",
      "experience",
      "education",
      "certifications",
    ]);
  });

  it("keeps the header block instead of discarding it", () => {
    // Name and contact details precede every heading and must survive.
    const [preamble] = detectSections(RESUME);
    expect(preamble.heading).toBe("");
    expect(preamble.lines).toEqual(["Alice Mercer", "alice@example.com | +1 555 0100"]);
  });

  it("assigns each section only its own lines", () => {
    const parsed = parsedFrom(RESUME);
    expect(sectionOfKind(parsed, "skills")?.lines).toEqual(["TypeScript, Go, PostgreSQL, Kafka"]);
    expect(sectionOfKind(parsed, "experience")?.lines).toEqual([
      "Acme Corp - Senior Engineer",
      "Led the migration to event sourcing",
    ]);
  });

  it("records the original heading text for display", () => {
    const parsed = parsedFrom(RESUME);
    expect(sectionOfKind(parsed, "skills")?.heading).toBe("TECHNICAL SKILLS");
  });

  it("reports boundaries as indices into the same line array", () => {
    const parsed = parsedFrom(RESUME);
    const experience = sectionOfKind(parsed, "experience");
    expect(experience).not.toBeNull();
    if (!experience) return;
    expect(parsed.lines[experience.startLine]).toBe("WORK EXPERIENCE");
    expect(parsed.lines.slice(experience.startLine + 1, experience.endLine)).toEqual(experience.lines);
  });

  it("closes a section on an unrecognised heading rather than swallowing it", () => {
    const lines = ["EXPERIENCE", "Did things", "PUBLICATIONS", "A paper", "EDUCATION", "A degree"];
    const sections = detectSections(lines);
    expect(sections.map((s) => s.kind)).toEqual(["experience", "other", "education"]);
    expect(sections[1].heading).toBe("PUBLICATIONS");
    expect(sections[0].lines).toEqual(["Did things"]);
  });

  it("does not split a bullet list on a line that resembles a heading", () => {
    const lines = ["EXPERIENCE", "• Led a team", "• Shipped the thing", "• Owned reliability"];
    const sections = detectSections(lines);
    expect(sections).toHaveLength(1);
    expect(sections[0].lines).toHaveLength(3);
  });

  it("handles a resume with no headings at all", () => {
    const lines = ["Alice Mercer", "Backend engineer", "Worked at Acme"];
    const sections = detectSections(lines);
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe("other");
    expect(sections[0].lines).toEqual(lines);
  });

  it("handles an empty document", () => {
    expect(detectSections([])).toEqual([]);
  });

  it("does not treat the operator's name as a heading", () => {
    // "Alice Mercer" is title-case and short — the unknown-heading rule would
    // fire on it if it ran before the first real section.
    const sections = detectSections(["Alice Mercer", "SKILLS", "Go"]);
    expect(sections[0].kind).toBe("other");
    expect(sections[0].heading).toBe("");
    expect(sections[0].lines).toEqual(["Alice Mercer"]);
  });

  it("survives a full pipeline from messy extracted text", () => {
    const raw = "Alice Mercer\r\n\r\nS K I L L S\r\n• Type​Script\r\n\r\nEDUCATION\r\nBSc";
    const { lines } = normalizeText(raw);
    const sections = detectSections(lines);

    expect(sections.map((s) => s.kind)).toEqual(["other", "skills", "education"]);
    // The bullet glyph survives normalization on purpose — it is real list
    // structure. `stripBullet` is for consumers that want it removed.
    expect(sections[1].lines).toEqual(["• TypeScript"]);
  });
});
