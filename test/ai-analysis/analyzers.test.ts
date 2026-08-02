import { describe, it, expect } from "vitest";
import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";
import { analyzeResume } from "@/lib/resume-analysis/ResumeAnalysisService";
import { parseJobDescription } from "@/lib/resume-analysis/JobDescriptionParser";
import { buildGroundingContext } from "@/lib/ai-analysis/grounding";
import { analyzeStrengths, analyzeTransferableSkills } from "@/lib/ai-analysis/StrengthAnalyzer";
import { analyzeCriticalGaps, analyzeWeaknesses } from "@/lib/ai-analysis/WeaknessAnalyzer";
import {
  generateBulletImprovements,
  generateRecommendations,
  selectMissingKeywords,
} from "@/lib/ai-analysis/RecommendationGenerator";
import { buildNarrative } from "@/lib/ai-analysis/ResumeNarrative";
import type { ParsedResume } from "@/types/resume";

/**
 * Post-validation of model output (Resume AI · Phase 3 · Step 2).
 *
 * The prompt tells the model not to invent. These tests assume it did anyway,
 * which is the only assumption worth testing: a rule enforced solely by
 * instruction is a rule that holds until the model has a bad day.
 *
 * Every case below is a claim that would read as credible analysis on screen —
 * a skill the resume does not have, a gap the engine never found, a rewrite of
 * a bullet from somebody else's resume — and every one must end up in
 * `dropped` rather than in front of the operator.
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

function resume(): ParsedResume {
  const normalized = normalizeText(RESUME_LINES.join("\n"));
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

const parsed = resume();
const jd = parseJobDescription(JD);
const { analysis } = analyzeResume({ resume: parsed, jobDescription: JD });
const ctx = buildGroundingContext(parsed, jd, analysis);

const REAL_LINE = "Rebuilt the settlement pipeline, cutting reconciliation time by 70%.";

describe("analyzeStrengths", () => {
  it("keeps a strength whose evidence is a real resume line", () => {
    const { strengths, dropped } = analyzeStrengths(
      [
        {
          headline: "Direct payments experience",
          detail: "The posting is a payments role and the resume evidences one.",
          evidence: REAL_LINE,
          relatedSkill: "postgresql",
        },
      ],
      ctx,
    );

    expect(strengths).toHaveLength(1);
    expect(strengths[0].relatedSkill).toBe("postgresql");
    expect(dropped).toHaveLength(0);
  });

  it("drops a strength backed by a line the resume does not contain", () => {
    const { strengths, dropped } = analyzeStrengths(
      [
        {
          headline: "Large-scale platform ownership",
          detail: "Sounds impressive and is entirely invented.",
          evidence: "Scaled the platform to 40 million monthly active users.",
          relatedSkill: "go",
        },
      ],
      ctx,
    );

    expect(strengths).toHaveLength(0);
    expect(dropped[0]).toMatch(/not in your resume/);
  });

  it("nulls a relatedSkill the analysis never mentions rather than dropping the strength", () => {
    const { strengths } = analyzeStrengths(
      [{ headline: "h", detail: "d", evidence: REAL_LINE, relatedSkill: "cobol" }],
      ctx,
    );

    expect(strengths).toHaveLength(1);
    expect(strengths[0].relatedSkill).toBeNull();
  });
});

describe("analyzeTransferableSkills", () => {
  it("keeps a transfer that starts from a detected skill", () => {
    const { transferableSkills, dropped } = analyzeTransferableSkills(
      [
        {
          fromSkill: "kafka",
          toRequirement: "Kubernetes",
          rationale: "Event-streaming operations overlap with orchestration work.",
          evidence: REAL_LINE,
        },
      ],
      ctx,
    );

    expect(transferableSkills).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("drops a transfer whose premise the resume never claimed", () => {
    // Inventing the starting skill invents the premise and the conclusion.
    const { transferableSkills, dropped } = analyzeTransferableSkills(
      [
        {
          fromSkill: "kubernetes",
          toRequirement: "Terraform",
          rationale: "Your Kubernetes work transfers directly.",
          evidence: REAL_LINE,
        },
      ],
      ctx,
    );

    expect(transferableSkills).toHaveLength(0);
    expect(dropped[0]).toMatch(/not detected in your resume/);
  });
});

describe("analyzeWeaknesses", () => {
  it("defaults an unrecognised severity to important rather than critical", () => {
    const { weaknesses } = analyzeWeaknesses(
      [{ headline: "h", detail: "d", evidence: REAL_LINE, severity: "catastrophic" }],
      ctx,
    );

    expect(weaknesses[0].severity).toBe("important");
  });

  it("drops a weakness with no evidence", () => {
    const { weaknesses, dropped } = analyzeWeaknesses(
      [{ headline: "Weak leadership signal", detail: "d", severity: "critical" }],
      ctx,
    );

    expect(weaknesses).toHaveLength(0);
    expect(dropped).toHaveLength(1);
  });
});

describe("analyzeCriticalGaps", () => {
  it("takes the display name and posting line from the engine, not the model", () => {
    const { criticalGaps } = analyzeCriticalGaps(
      [{ skill: "kubernetes", impact: "Named as a requirement and not evidenced.", displayName: "K8s Wizardry" }],
      ctx,
    );

    expect(criticalGaps).toHaveLength(1);
    expect(criticalGaps[0].displayName).not.toBe("K8s Wizardry");
    expect(criticalGaps[0].requestedIn).toContain("Kubernetes");
  });

  it("drops a gap the deterministic engine did not report", () => {
    const { criticalGaps, dropped } = analyzeCriticalGaps(
      [{ skill: "rust", impact: "You will not be considered without Rust." }],
      ctx,
    );

    expect(criticalGaps).toHaveLength(0);
    expect(dropped[0]).toMatch(/did not report it as missing/);
  });

  it("drops a gap naming a skill the resume evidences", () => {
    // The inverse error: telling the operator they lack something they have.
    const { criticalGaps } = analyzeCriticalGaps([{ skill: "go", impact: "Missing." }], ctx);
    expect(criticalGaps).toHaveLength(0);
  });

  it("does not repeat the same gap twice", () => {
    const { criticalGaps } = analyzeCriticalGaps(
      [
        { skill: "kubernetes", impact: "First." },
        { skill: "kubernetes", impact: "Again." },
      ],
      ctx,
    );

    expect(criticalGaps).toHaveLength(1);
  });
});

describe("generateRecommendations", () => {
  it("drops advice that gives no reason", () => {
    // "You should learn Power BI" — the exact shape the spec forbids.
    const { recommendations, dropped } = generateRecommendations(
      [{ priority: "high", action: "You should learn Kubernetes." }],
      ctx,
    );

    expect(recommendations).toHaveLength(0);
    expect(dropped[0]).toMatch(/gave no reason/);
  });

  it("keeps advice that states its evidence, and orders by priority", () => {
    const { recommendations } = generateRecommendations(
      [
        { priority: "low", action: "Reorder the skills list.", why: "Go appears last.", section: "skills" },
        {
          priority: "high",
          action: "Add Kubernetes if you have used it.",
          why: "Kubernetes appears in the job description but was not detected in your resume.",
          section: "skills",
        },
      ],
      ctx,
    );

    expect(recommendations.map((r) => r.priority)).toEqual(["high", "low"]);
    expect(recommendations[0].section).toBe("skills");
  });

  it("nulls an unrecognised section rather than inventing one", () => {
    const { recommendations } = generateRecommendations(
      [{ priority: "medium", action: "a", why: "w", section: "references" }],
      ctx,
    );

    expect(recommendations[0].section).toBeNull();
  });
});

describe("generateBulletImprovements", () => {
  it("anchors a rewrite to the line as the resume actually has it", () => {
    const { bulletImprovements } = generateBulletImprovements(
      [
        {
          original: "rebuilt the settlement pipeline",
          improved: "Rebuilt the settlement pipeline, cutting reconciliation time 70% for 12k rps.",
          why: "Adds the scale the posting asks about.",
        },
      ],
      ctx,
    );

    expect(bulletImprovements[0].original).toBe(REAL_LINE);
  });

  it("drops a rewrite of a bullet from somebody else's resume", () => {
    const { bulletImprovements, dropped } = generateBulletImprovements(
      [
        {
          original: "Managed a portfolio of 30 enterprise accounts",
          improved: "Managed 30 enterprise accounts worth $4M ARR.",
          why: "Quantifies the impact.",
        },
      ],
      ctx,
    );

    expect(bulletImprovements).toHaveLength(0);
    expect(dropped[0]).toMatch(/not a line in your resume/);
  });
});

describe("selectMissingKeywords", () => {
  it("keeps only terms the engine already reported missing", () => {
    const missing = analysis.keywords.missing;
    const { missingKeywords, dropped } = selectMissingKeywords(
      [...missing.slice(0, 1), "blockchain"],
      ctx,
    );

    expect(missingKeywords).toEqual(missing.slice(0, 1));
    expect(dropped[0]).toMatch(/did not ask for it/);
  });

  it("returns nothing when the model invents the whole list", () => {
    expect(selectMissingKeywords(["blockchain", "web3"], ctx).missingKeywords).toEqual([]);
  });
});

describe("buildNarrative", () => {
  it("falls back to the deterministic score when no probability is returned", () => {
    const narrative = buildNarrative({ overallSummary: "s", reasoning: "r" }, analysis);

    expect(narrative.overallHiringProbability).toBe(analysis.overallScore);
    expect(narrative.reasoning).toMatch(/deterministic match score/);
    expect(narrative.dropped).toHaveLength(1);
  });

  it("flags a probability that merely echoes the ATS score", () => {
    const narrative = buildNarrative(
      { overallSummary: "s", reasoning: "r", overallHiringProbability: analysis.overallScore },
      analysis,
    );

    expect(narrative.overallHiringProbability).toBe(analysis.overallScore);
    expect(narrative.dropped[0]).toMatch(/restated the match score/);
  });

  it("keeps a genuinely independent judgement without complaint", () => {
    const independent = Math.min(100, analysis.overallScore + 20);
    const narrative = buildNarrative(
      { overallSummary: "s", reasoning: "r", overallHiringProbability: independent },
      analysis,
    );

    expect(narrative.overallHiringProbability).toBe(independent);
    expect(narrative.dropped).toHaveLength(0);
  });
});
