import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSupabaseStub } from "@/test/stubs/supabase";
import {
  runDeterministicAnalysis,
  validateDemoInput,
  resumeFromText,
} from "@/lib/demo/analysis";
import { sampleResume, sampleJobDescription } from "@/lib/demo/samples";
import { DEMO_MAX_JD_CHARS, DEMO_MAX_RESUME_CHARS } from "@/lib/demo/config";
import { MIN_RESUME_CHARS } from "@/lib/resume/parse";

/**
 * Guards the demo's deterministic analysis path.
 *
 * The property this step exists to establish is negative: nothing here calls a
 * provider. That is what lets the demo keep scoring when the budget is gone, so
 * it is asserted directly rather than assumed — the AI modules are mocked to
 * throw, and every test below still passes.
 *
 * The second property is that the client is not trusted. Sections decide which
 * lines the scorer reads as skills, so a caller that could supply them could aim
 * the analysis; the wire carries text only and the structure is re-derived here.
 */

// If anything in this path reaches for a provider, these turn a silent cost into
// a failing test.
vi.mock("@/lib/ai/providers", () => ({
  getAiProvider: () => {
    throw new Error("the deterministic path must not touch a provider");
  },
  isAiProviderConfigured: () => {
    throw new Error("the deterministic path must not touch a provider");
  },
}));

const REAL_RESUME = sampleResume().text;
const REAL_JD = sampleJobDescription();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateDemoInput", () => {
  it("accepts the sample selection on both sides", () => {
    expect(validateDemoInput({ resumeText: null, jobDescription: null })).toBeNull();
  });

  it("accepts real text within bounds", () => {
    expect(validateDemoInput({ resumeText: REAL_RESUME, jobDescription: REAL_JD })).toBeNull();
  });

  it("rejects a resume below the scanned-PDF floor", () => {
    const rejection = validateDemoInput({ resumeText: "too short", jobDescription: REAL_JD });
    expect(rejection?.field).toBe("resume");
    expect(rejection?.message).toMatch(/scan/i);
  });

  it("rejects an oversized resume", () => {
    const rejection = validateDemoInput({
      resumeText: "x".repeat(DEMO_MAX_RESUME_CHARS + 1),
      jobDescription: REAL_JD,
    });
    expect(rejection?.field).toBe("resume");
  });

  it("rejects an empty or whitespace-only job description", () => {
    for (const jd of ["", "   ", "\n\t"]) {
      expect(validateDemoInput({ resumeText: REAL_RESUME, jobDescription: jd })?.field).toBe(
        "jobDescription",
      );
    }
  });

  it("rejects an oversized job description", () => {
    const rejection = validateDemoInput({
      resumeText: REAL_RESUME,
      jobDescription: "x".repeat(DEMO_MAX_JD_CHARS + 1),
    });
    expect(rejection?.field).toBe("jobDescription");
  });

  it("enforces the demo's ceilings, not the authenticated action's", () => {
    // The admin action allows 200k/100k. A payload between the two must be
    // rejected here, or the demo inherits limits sized for a trusted operator.
    expect(
      validateDemoInput({ resumeText: "x".repeat(150_000), jobDescription: REAL_JD }),
    ).not.toBeNull();
    expect(
      validateDemoInput({ resumeText: REAL_RESUME, jobDescription: "x".repeat(60_000) }),
    ).not.toBeNull();
  });

  it("rejects a non-string payload", () => {
    expect(
      validateDemoInput({ resumeText: 42 as unknown as string, jobDescription: REAL_JD }),
    ).not.toBeNull();
  });

  it("bounds MIN_RESUME_CHARS as the floor it claims to be", () => {
    const justUnder = "a ".repeat(Math.floor(MIN_RESUME_CHARS / 2) - 5);
    expect(validateDemoInput({ resumeText: justUnder, jobDescription: REAL_JD })).not.toBeNull();
  });
});

describe("resumeFromText — the client supplies text, never structure", () => {
  it("re-derives sections through the real detector", () => {
    const parsed = resumeFromText(REAL_RESUME);
    const kinds = parsed.sections.map((s) => s.kind);
    expect(kinds).toContain("skills");
    expect(kinds).toContain("experience");
  });

  it("marks provenance as client-supplied text rather than a format parser", () => {
    expect(resumeFromText(REAL_RESUME).parser).toBe("demo-client-text");
  });

  it("normalizes before detecting, so layout artefacts do not reach the scorer", () => {
    // A non-breaking space and a smart bullet, as a PDF would produce them.
    const parsed = resumeFromText(`SKILLS \n• TypeScript\n${REAL_RESUME}`);
    expect(parsed.text).not.toContain(" ");
  });

  it("produces the same shape the upload path would", () => {
    const parsed = resumeFromText(REAL_RESUME);
    expect(Object.keys(parsed).sort()).toEqual(
      ["lines", "pageCount", "parser", "sections", "text", "truncated", "warnings"].sort(),
    );
  });
});

describe("runDeterministicAnalysis", () => {
  it("scores the bundled pair without any input", () => {
    const data = runDeterministicAnalysis({ resumeText: null, jobDescription: null });

    expect(data.usedSampleResume).toBe(true);
    expect(data.usedSampleJobDescription).toBe(true);
    expect(data.analysis.overallScore).toBeGreaterThan(0);
    expect(data.analysis.breakdown).toHaveLength(5);
  });

  it("scores supplied text", () => {
    const data = runDeterministicAnalysis({ resumeText: REAL_RESUME, jobDescription: REAL_JD });

    expect(data.usedSampleResume).toBe(false);
    expect(data.usedSampleJobDescription).toBe(false);
    expect(data.analysis.skillMatches.length).toBeGreaterThan(0);
    expect(data.analysis.missingSkills.length).toBeGreaterThan(0);
  });

  it("mixes a real resume against the sample posting", () => {
    const data = runDeterministicAnalysis({ resumeText: REAL_RESUME, jobDescription: null });
    expect(data.usedSampleResume).toBe(false);
    expect(data.usedSampleJobDescription).toBe(true);
  });

  it("returns the parsed posting so the UI can show what was understood", () => {
    const data = runDeterministicAnalysis({ resumeText: null, jobDescription: null });
    expect(data.posting).toBeDefined();
  });

  it("attempts no AI: insights are null and no note is set", () => {
    const data = runDeterministicAnalysis({ resumeText: null, jobDescription: null });
    expect(data.aiInsights).toBeNull();
    // Null rather than the unavailable note: nothing was skipped here, T9 owns
    // the distinction between "not attempted" and "attempted and unaffordable".
    expect(data.aiNote).toBeNull();
  });

  it("is deterministic — the same input scores identically every time", () => {
    const a = runDeterministicAnalysis({ resumeText: REAL_RESUME, jobDescription: REAL_JD });
    const b = runDeterministicAnalysis({ resumeText: REAL_RESUME, jobDescription: REAL_JD });
    expect(a.analysis.overallScore).toBe(b.analysis.overallScore);
  });
});

describe("client-supplied scores are impossible to inject", () => {
  it("ignores any score-shaped fields smuggled onto the input", () => {
    const hostile = {
      resumeText: REAL_RESUME,
      jobDescription: REAL_JD,
      // None of these exist on DemoAnalysisInput; if the implementation ever
      // spread its input into the result they would surface.
      overallScore: 100,
      analysis: { overallScore: 100 },
      sections: [{ kind: "skills", lines: ["Kubernetes", "Terraform", "AWS"] }],
    } as never;

    const data = runDeterministicAnalysis(hostile);
    const honest = runDeterministicAnalysis({ resumeText: REAL_RESUME, jobDescription: REAL_JD });

    expect(data.analysis.overallScore).toBe(honest.analysis.overallScore);
    expect(data.analysis.overallScore).not.toBe(100);
  });

  it("cannot be made to claim a skill the resume never mentions", () => {
    // Forged sections would be the lever; the wire has no place to put them.
    const data = runDeterministicAnalysis({ resumeText: REAL_RESUME, jobDescription: REAL_JD });
    const matched = data.analysis.skillMatches.map((m) => m.skill);
    expect(matched).not.toContain("kubernetes");
    expect(matched).not.toContain("terraform");
  });
});

describe("no database work happens in the analysis itself", () => {
  it("issues no query — scoring is arithmetic over text", () => {
    const stub = createSupabaseStub();
    runDeterministicAnalysis({ resumeText: REAL_RESUME, jobDescription: REAL_JD });
    expect(stub.operations).toHaveLength(0);
  });
});
