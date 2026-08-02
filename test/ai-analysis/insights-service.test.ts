import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiCapabilities, AiCompletion, AiRequest, AiTaskClass, AiUsage } from "@/types/ai";
import { AiGateway } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";
import { analyzeResume } from "@/lib/resume-analysis/ResumeAnalysisService";
import { parseJobDescription } from "@/lib/resume-analysis/JobDescriptionParser";
import { generateInsights, buildInsightRequest } from "@/lib/ai-analysis/ResumeInsightsService";
import type { ParsedResume } from "@/types/resume";

/**
 * End-to-end enrichment (Resume AI · Phase 3 · Step 2).
 *
 * Drives the real gateway against a provider that knows no vendor, exactly as
 * `test/ai/gateway.test.ts` does — so this file is also a standing check that
 * the resume feature introduced no vendor dependency.
 *
 * The load-bearing assertion is the one about scores: whatever the model
 * returns, the deterministic `ResumeAnalysis` handed in comes back byte-for-byte
 * unchanged, and the enriched result carries no score field at all.
 */

const CAPABILITIES: AiCapabilities = {
  structuredOutput: true,
  toolCalling: false,
  tokenCounting: false,
  prefixCaching: true,
  reasoningControl: true,
  streaming: false,
};

const USAGE: AiUsage = { inputTokens: 100, outputTokens: 20, cachedInputTokens: 0 };

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

const REAL_LINE = "Rebuilt the settlement pipeline, cutting reconciliation time by 70%.";

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

/**
 * A review reply mixing grounded findings with plausible inventions.
 *
 * Every invented entry here would read as analysis on screen. That is the
 * point: the test asserts the invented ones never reach the operator.
 */
const REVIEW = {
  overallSummary: "A strong payments background against a posting that also wants orchestration.",
  strengths: [
    {
      headline: "Direct payments experience",
      detail: "The posting is a payments role and the resume evidences one.",
      evidence: REAL_LINE,
      relatedSkill: "postgresql",
    },
    {
      headline: "Platform scale",
      detail: "Invented, and entirely credible-sounding.",
      evidence: "Scaled the platform to 40 million monthly active users.",
      relatedSkill: "go",
    },
  ],
  weaknesses: [
    {
      headline: "No orchestration signal",
      detail: "Kubernetes is a stated requirement and nothing evidences it.",
      evidence: "Experience with Kubernetes and Terraform",
      severity: "critical",
      relatedSkill: "kubernetes",
    },
  ],
  criticalGaps: [
    { skill: "kubernetes", impact: "Named as a requirement and not evidenced anywhere." },
    { skill: "rust", impact: "Invented — the posting never asked for it." },
  ],
  transferableSkills: [
    {
      fromSkill: "kafka",
      toRequirement: "Kubernetes",
      rationale: "Event-streaming operations overlap with orchestration work.",
      evidence: REAL_LINE,
    },
  ],
  missingKeywords: ["blockchain"],
  recommendations: [
    {
      priority: "high",
      action: "Add Kubernetes to the skills section if you have used it.",
      why: "Kubernetes appears in the job description but was not detected in your resume.",
      section: "skills",
      relatedSkill: "kubernetes",
    },
    { priority: "low", action: "Learn Terraform.", why: "", section: "", relatedSkill: "" },
  ],
  bulletImprovements: [
    {
      original: "rebuilt the settlement pipeline",
      improved: "Rebuilt the settlement pipeline, cutting reconciliation time 70%.",
      why: "Leads with the outcome.",
    },
  ],
  overallHiringProbability: 55,
  reasoning: "Strong domain fit, one unmet hard requirement.",
};

const INTERVIEW = {
  questions: [
    { question: "How would you approach adopting Kubernetes here?", kind: "gap_probe", rationale: "Unmet requirement." },
    { question: "Walk me through the settlement rebuild.", kind: "technical", rationale: "Named on the resume." },
  ],
};

const LINKEDIN = {
  headline: "Backend engineer, payments and ledger systems",
  about: "I build settlement and ledger systems.\n\nEight years, mostly in payments.",
  skillsToFeature: ["Go", "PostgreSQL", "Kubernetes"],
  notes: ["Lead the headline with payments."],
};

const REWRITE = {
  rewritten: "Backend engineer with eight years in payments and ledger systems.",
  changes: ["Led with the domain the posting names."],
};

/** Routes by prompt content, so concurrent enrichment calls cannot cross wires. */
function replyFor(request: AiRequest): string {
  const system = request.system ?? "";
  if (system.includes("DETERMINISTIC ANALYSIS")) return JSON.stringify(REVIEW);
  if (system.includes("predict interview questions")) return JSON.stringify(INTERVIEW);
  if (system.includes("LinkedIn profile copy")) return JSON.stringify(LINKEDIN);
  if (system.includes("rewrite the professional summary")) return JSON.stringify(REWRITE);
  throw new Error("StubProvider: unexpected prompt");
}

class StubProvider implements AiProvider {
  readonly name = "stub";
  readonly capabilities = CAPABILITIES;
  requests: AiRequest[] = [];

  constructor(private readonly failOn?: RegExp) {}

  resolveModel(taskClass: AiTaskClass): string {
    return `stub-${taskClass}`;
  }

  estimateCostMicros(): number {
    return 1;
  }

  async complete(request: AiRequest): Promise<AiCompletion> {
    this.requests.push(request);
    if (this.failOn && this.failOn.test(request.system ?? "")) {
      throw new Error("provider exploded");
    }
    return {
      stopReason: "completed",
      text: replyFor(request),
      toolCalls: [],
      usage: USAGE,
      model: "stub-model",
      provider: "stub",
      latencyMs: 1,
    };
  }
}

class RefusingProvider extends StubProvider {
  async complete(request: AiRequest): Promise<AiCompletion> {
    this.requests.push(request);
    return {
      stopReason: "refused",
      text: "",
      toolCalls: [],
      usage: USAGE,
      model: "stub-model",
      provider: "stub",
      latencyMs: 1,
    };
  }
}

function fakeClient() {
  const audits: Record<string, unknown>[] = [];
  const client = {
    rpc(name: string) {
      return Promise.resolve({ data: name === "ai_reserve_budget" ? true : null, error: null });
    },
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (table === "ai_audit_log") audits.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, audits };
}

function input() {
  const parsed = resume();
  const jd = parseJobDescription(JD);
  const { analysis } = analyzeResume({ resume: parsed, jobDescription: JD });
  return { resume: parsed, jobDescription: jd, analysis, ownerId: "owner-1" };
}

beforeEach(() => {
  process.env.FEATURE_AI = "true";
});

afterEach(() => {
  delete process.env.FEATURE_AI;
});

describe("generateInsights", () => {
  it("keeps grounded findings and discards the rest", async () => {
    const provider = new StubProvider();
    const { client } = fakeClient();
    const insights = await generateInsights(new AiGateway({ provider, client }), input(), {
      includeEnrichment: true,
    });

    expect(insights).not.toBeNull();
    expect(insights!.strengths.map((s) => s.headline)).toEqual(["Direct payments experience"]);
    expect(insights!.criticalGaps.map((g) => g.skill)).toEqual(["kubernetes"]);
    expect(insights!.recommendations.map((r) => r.priority)).toEqual(["high"]);
    expect(insights!.missingKeywords).toEqual([]);
    expect(insights!.transferableSkills).toHaveLength(1);

    // Five claims failed grounding: a fabricated strength, an invented gap, an
    // invented keyword, advice with no reason, and a LinkedIn skill the resume
    // does not evidence.
    expect(insights!.dropped).toHaveLength(5);
  });

  it("never produces a score, and leaves the deterministic analysis untouched", async () => {
    const provider = new StubProvider();
    const { client } = fakeClient();
    const args = input();
    const before = JSON.stringify(args.analysis);

    const insights = await generateInsights(new AiGateway({ provider, client }), args, {
      includeEnrichment: true,
    });

    expect(JSON.stringify(args.analysis)).toBe(before);
    expect(Object.keys(insights!)).not.toContain("overallScore");
    expect(Object.keys(insights!)).not.toContain("breakdown");
    // The one number it does produce is a stated judgement, not the ATS score.
    expect(insights!.overallHiringProbability).toBe(55);
    expect(insights!.overallHiringProbability).not.toBe(args.analysis.overallScore);
  });

  it("anchors a bullet rewrite to the resume's own line", async () => {
    const provider = new StubProvider();
    const { client } = fakeClient();
    const insights = await generateInsights(new AiGateway({ provider, client }), input(), {});

    expect(insights!.bulletImprovements[0].original).toBe(REAL_LINE);
  });

  it("filters LinkedIn skills down to what the parser detected", async () => {
    const provider = new StubProvider();
    const { client } = fakeClient();
    const insights = await generateInsights(new AiGateway({ provider, client }), input(), {
      includeEnrichment: true,
    });

    expect(insights!.linkedinSuggestions!.skillsToFeature).toEqual(["Go", "PostgreSQL"]);
    expect(insights!.dropped.some((d) => /LinkedIn skill "Kubernetes"/.test(d))).toBe(true);
  });

  it("makes no enrichment calls when they were not asked for", async () => {
    const provider = new StubProvider();
    const { client } = fakeClient();
    const insights = await generateInsights(new AiGateway({ provider, client }), input(), {});

    expect(provider.requests).toHaveLength(1);
    expect(insights!.interviewQuestions).toEqual([]);
    expect(insights!.linkedinSuggestions).toBeNull();
    expect(insights!.resumeSummaryRewrite).toBeNull();
  });

  it("keeps the other panels when one enrichment call fails", async () => {
    // Losing all three side panels because LinkedIn rate-limited would be a
    // worse outcome than showing two.
    const provider = new StubProvider(/LinkedIn profile copy/);
    const { client } = fakeClient();
    const insights = await generateInsights(new AiGateway({ provider, client }), input(), {
      includeEnrichment: true,
    });

    expect(insights!.linkedinSuggestions).toBeNull();
    expect(insights!.interviewQuestions).toHaveLength(2);
    expect(insights!.resumeSummaryRewrite).not.toBeNull();
  });

  it("returns null when the model refuses, so the score still stands alone", async () => {
    const provider = new RefusingProvider();
    const { client } = fakeClient();

    expect(
      await generateInsights(new AiGateway({ provider, client }), input(), {}),
    ).toBeNull();
  });

  it("stamps provenance from the call that produced the review", async () => {
    const provider = new StubProvider();
    const { client, audits } = fakeClient();
    const insights = await generateInsights(new AiGateway({ provider, client }), input(), {});

    expect(insights!.aiProvider).toBe("stub");
    expect(insights!.aiModel).toBe("stub-model");
    expect(insights!.aiPromptVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ outcome: "success", action: "resume_review" });
  });
});

describe("buildInsightRequest", () => {
  it("carries display labels rather than canonical ids", () => {
    const request = buildInsightRequest(input());
    expect(request.detectedSkills).toContain("PostgreSQL");
    expect(request.detectedSkills).not.toContain("postgresql");
  });

  it("reads the candidate name only when the first line plainly is one", () => {
    expect(buildInsightRequest(input()).candidateName).toBe("ALICE MERCER");
  });

  it("finds the existing professional summary to rewrite", () => {
    expect(buildInsightRequest(input()).currentSummary).toContain("Backend engineer");
  });
});
