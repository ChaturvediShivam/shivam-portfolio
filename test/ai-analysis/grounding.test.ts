import { describe, it, expect } from "vitest";
import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";
import { analyzeResume } from "@/lib/resume-analysis/ResumeAnalysisService";
import { parseJobDescription } from "@/lib/resume-analysis/JobDescriptionParser";
import {
  buildGroundingContext,
  detectedSkill,
  findResumeLine,
  isQuoted,
  missingSkill,
  percent,
  prose,
  text,
} from "@/lib/ai-analysis/grounding";
import type { ParsedResume } from "@/types/resume";

/**
 * Grounding primitives (Resume AI · Phase 3 · Step 2).
 *
 * These are the functions that stand between a model's claim and the operator
 * reading it as fact. Every test below is a specific way a plausible-sounding
 * invention could otherwise get through.
 */

const RESUME_LINES = [
  "ALICE MERCER",
  "PROFESSIONAL SUMMARY",
  "Backend engineer with eight years building payment and ledger systems.",
  "TECHNICAL SKILLS",
  "TypeScript, Go, PostgreSQL, Kafka",
  "WORK EXPERIENCE",
  "Rebuilt the settlement pipeline, cutting reconciliation time by 70%.",
];

const JD = [
  "Senior Backend Engineer",
  "Requirements:",
  "Strong Go and PostgreSQL",
  "Experience with Kubernetes and Terraform",
  "Responsibilities:",
  "Own the reliability of our payment services",
].join("\n");

function resume(lines: string[] = RESUME_LINES): ParsedResume {
  const normalized = normalizeText(lines.join("\n"));
  return {
    text: normalized.text,
    lines: normalized.lines,
    sections: detectSections(normalized.lines),
    pageCount: 1,
    truncated: false,
    parser: "test",
    warnings: [],
  };
}

function context() {
  const parsed = resume();
  const jd = parseJobDescription(JD);
  const { analysis } = analyzeResume({ resume: parsed, jobDescription: JD });
  return buildGroundingContext(parsed, jd, analysis);
}

describe("isQuoted", () => {
  it("accepts a line the resume actually contains", () => {
    expect(isQuoted("Rebuilt the settlement pipeline", context())).toBe(true);
  });

  it("accepts a quote whose whitespace and punctuation drifted", () => {
    // Models reflow text even when told to copy verbatim. Rejecting a real
    // quote over a stray space would discard true findings.
    expect(isQuoted("rebuilt  the settlement  pipeline,", context())).toBe(true);
  });

  it("rejects a fluent invention", () => {
    // The canonical failure: a sentence that reads exactly like a resume line
    // and appears nowhere in this resume.
    expect(isQuoted("Scaled the platform to 40 million users", context())).toBe(false);
  });

  it("rejects a quote too short to mean anything", () => {
    // "led a" matches half the resumes ever written; a substring check alone
    // would treat it as evidence.
    expect(isQuoted("systems", context())).toBe(false);
  });

  it("accepts a line from the job description, not only the resume", () => {
    expect(isQuoted("Own the reliability of our payment services", context())).toBe(true);
  });
});

describe("detectedSkill", () => {
  it("accepts a skill the parser found", () => {
    expect(detectedSkill("postgresql", context())).toBe("postgresql");
  });

  it("rejects a skill the resume never claims", () => {
    // The premise of an invented transferable skill.
    expect(detectedSkill("kubernetes", context())).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(detectedSkill(42, context())).toBeNull();
  });
});

describe("missingSkill", () => {
  it("returns the deterministic record, not the model's restatement", () => {
    const found = missingSkill("kubernetes", context());
    expect(found?.skill).toBe("kubernetes");
    expect(found?.requestedIn).toContain("Kubernetes");
  });

  it("rejects a skill the resume does evidence", () => {
    // Describing a present skill as a gap is the inverse error and just as bad.
    expect(missingSkill("go", context())).toBeNull();
  });
});

describe("findResumeLine", () => {
  it("returns the line as the resume has it, not as the model retyped it", () => {
    const found = findResumeLine("rebuilt the settlement pipeline", context());
    expect(found).toBe("Rebuilt the settlement pipeline, cutting reconciliation time by 70%.");
  });

  it("returns null for a bullet the resume does not contain", () => {
    expect(findResumeLine("Managed a portfolio of 30 enterprise accounts", context())).toBeNull();
  });
});

describe("text and prose", () => {
  it("rejects empty and non-string values", () => {
    expect(text("   ")).toBeNull();
    expect(text(null)).toBeNull();
    expect(prose(7)).toBeNull();
  });

  it("collapses newlines in a phrase but keeps paragraphs in a passage", () => {
    expect(text("one\ntwo")).toBe("one two");
    expect(prose("one\n\ntwo")).toBe("one\n\ntwo");
  });

  it("bounds a runaway phrase", () => {
    expect(text("x".repeat(5000))!.length).toBeLessThanOrEqual(600);
  });
});

describe("percent", () => {
  it("clamps to 0-100 and rounds", () => {
    expect(percent(72.4)).toBe(72);
    expect(percent(140)).toBe(100);
    expect(percent(-5)).toBe(0);
  });

  it("rejects anything that is not a finite number", () => {
    expect(percent("80%")).toBeNull();
    expect(percent(Number.NaN)).toBeNull();
  });
});
