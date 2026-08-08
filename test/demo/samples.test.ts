import { describe, it, expect } from "vitest";
import { sampleResume, sampleJobDescription } from "@/lib/demo/samples";
import { SAMPLE_DELIBERATE_GAPS } from "@/lib/demo/sampleContent";
import { analyzeResume } from "@/lib/resume-analysis/ResumeAnalysisService";
import { MIN_RESUME_CHARS } from "@/lib/resume/parse";
import { DEMO_MAX_RESUME_CHARS, DEMO_MAX_JD_CHARS } from "@/lib/demo/config";
import { RESUME_SECTION_KINDS } from "@/types/resume";

/**
 * Guards the bundled demo pair.
 *
 * The score band is the assertion that matters. A sample scoring near 100 makes
 * the demo useless — no gaps, no recommendations, nothing for the AI review to
 * say — and a sample scoring low makes the product look broken. This test is
 * what stops an innocuous edit to the sample text from quietly landing outside
 * that band.
 */

/** The band the sample must land in, per the demo's product requirement. */
const MIN_SCORE = 75;
const MAX_SCORE = 85;

describe("sample resume", () => {
  it("parses into a valid ParsedResume through the real parser functions", () => {
    const parsed = sampleResume();

    expect(typeof parsed.text).toBe("string");
    expect(Array.isArray(parsed.lines)).toBe(true);
    expect(Array.isArray(parsed.sections)).toBe(true);
    expect(parsed.truncated).toBe(false);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.parser).toBe("bundled-sample");

    for (const section of parsed.sections) {
      expect(RESUME_SECTION_KINDS).toContain(section.kind);
      expect(section.startLine).toBeLessThan(section.endLine);
    }
  });

  it("clears the scanned-PDF floor and stays under the demo ceiling", () => {
    const parsed = sampleResume();
    expect(parsed.text.length).toBeGreaterThan(MIN_RESUME_CHARS);
    expect(parsed.text.length).toBeLessThan(DEMO_MAX_RESUME_CHARS);
  });

  it("detects the sections the analysis depends on", () => {
    const kinds = sampleResume().sections.map((s) => s.kind);
    for (const required of ["summary", "skills", "experience", "education"] as const) {
      expect(kinds, `"${required}" must be detected`).toContain(required);
    }
  });

  it("is memoized", () => {
    expect(sampleResume()).toBe(sampleResume());
  });

  it("contains no real contact details", () => {
    const text = sampleResume().text.toLowerCase();
    // Reserved-for-fiction domain and phone block only.
    expect(text).toContain("example.com");
    expect(text).not.toContain("shivam");
    expect(text).not.toContain("chaturvedi");
    expect(text).not.toMatch(/@(gmail|outlook|yahoo|icloud)\.com/);
  });
});

describe("sample job description", () => {
  it("is non-empty and within the demo ceiling", () => {
    const jd = sampleJobDescription();
    expect(jd.trim().length).toBeGreaterThan(200);
    expect(jd.length).toBeLessThan(DEMO_MAX_JD_CHARS);
  });
});

describe("the pair demonstrates the platform rather than perfection", () => {
  const result = () =>
    analyzeResume({ resume: sampleResume(), jobDescription: sampleJobDescription() });

  it(`scores between ${MIN_SCORE} and ${MAX_SCORE}`, () => {
    const { analysis } = result();
    expect(analysis.overallScore).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(analysis.overallScore).toBeLessThanOrEqual(MAX_SCORE);
  });

  it("produces real strengths AND real gaps", () => {
    const { analysis } = result();
    expect(analysis.skillMatches.length, "needs matches to show strength").toBeGreaterThan(4);
    expect(analysis.missingSkills.length, "needs gaps to have advice worth giving").toBeGreaterThan(1);
  });

  it("leaves the deliberate infrastructure gaps open", () => {
    const { analysis } = result();
    const missing = new Set(analysis.missingSkills.map((s) => s.skill));
    const stillOpen = SAMPLE_DELIBERATE_GAPS.filter((gap) => missing.has(gap));
    // Not all six need to surface — the posting marks some as preferred — but a
    // sample that closed every one of them would score near 100 and demo nothing.
    expect(stillOpen.length, `deliberate gaps closed: ${SAMPLE_DELIBERATE_GAPS}`).toBeGreaterThan(1);
  });

  it("scores every category, none of them zero", () => {
    const { analysis } = result();
    expect(analysis.breakdown.length).toBe(5);
    for (const entry of analysis.breakdown) {
      expect(entry.score, `${entry.category} scored 0 — the sample looks broken`).toBeGreaterThan(0);
    }
  });
});
