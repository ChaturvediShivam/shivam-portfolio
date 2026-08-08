import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AiCapabilities, AiCompletion, AiRequest, AiTaskClass, AiUsage } from "@/types/ai";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { createSupabaseStub, type SupabaseStub } from "@/test/stubs/supabase";
import { AI_UNAVAILABLE_NOTE } from "@/lib/demo/analysis";

/**
 * The demo's AI half, driven through the real Server Action.
 *
 * The unit suites cover the gates and the deterministic score. What is unproven
 * until here is the seam between them: that exactly one provider call is made,
 * that every failure mode still returns the scores, and that budget and audit
 * are handled by the gateway rather than re-implemented alongside it.
 *
 * Only the three things an action cannot bring into a Node test are replaced —
 * the request headers, the service-role client, and the concrete provider.
 * Everything between them is the shipped code path.
 */

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.7"]]),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/ai/providers", () => ({
  getAiProvider: vi.fn(),
  isAiProviderConfigured: vi.fn(() => true),
}));

import { createServiceClient } from "@/lib/supabase/service";
import { getAiProvider } from "@/lib/ai/providers";
import { analyzeDemoAction } from "@/app/(marketing)/demo/actions";

const resolveClient = vi.mocked(createServiceClient);
const resolveProvider = vi.mocked(getAiProvider);

const OWNER = "00000000-0000-4000-8000-000000000000";
const CAPABILITIES: AiCapabilities = {
  structuredOutput: true,
  toolCalling: false,
  tokenCounting: true,
  prefixCaching: false,
  reasoningControl: false,
  streaming: false,
};
const USAGE: AiUsage = { inputTokens: 900, outputTokens: 220, cachedInputTokens: 0 };

class StubProvider implements AiProvider {
  readonly name = "stub";
  readonly capabilities = CAPABILITIES;
  requests: AiRequest[] = [];

  constructor(private readonly queue: (AiCompletion | Error)[]) {}

  resolveModel(taskClass: AiTaskClass): string {
    return `stub-${taskClass}`;
  }
  estimateCostMicros(): number {
    return 42;
  }
  async complete(request: AiRequest): Promise<AiCompletion> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error("StubProvider: no queued response");
    if (next instanceof Error) throw next;
    return next;
  }
  async countTokens(): Promise<number> {
    return 900;
  }
}

/**
 * A review matching the resume_review template's responseSchema exactly.
 *
 * Shape matters more than content here: the gateway returns `parsed` only when
 * the payload validates, and generateInsights returns null without it. Evidence
 * quotes a real line from the bundled resume so the grounding layer keeps the
 * claim rather than dropping it.
 */
const REVIEW = JSON.stringify({
  overallSummary:
    "A strong frontend match with a clear infrastructure gap. The React and TypeScript depth the posting asks for is present and evidenced. Cloud and container experience is absent entirely.",
  strengths: [
    {
      headline: "Deep React and TypeScript background",
      detail: "Six years of production work, with the language named in the skills section.",
      evidence: "Languages: TypeScript, JavaScript, HTML, CSS, SQL",
      relatedSkill: "typescript",
    },
  ],
  weaknesses: [
    {
      headline: "No cloud deployment experience",
      detail: "The posting requires AWS and the resume never mentions it.",
      evidence: "Tooling: Git, GitHub Actions, Vercel, Jest, Playwright, Storybook, Vite",
      severity: "critical",
      relatedSkill: "aws",
    },
  ],
  criticalGaps: [
    { skill: "aws", impact: "A required requirement with no evidence behind it." },
  ],
  transferableSkills: [
    {
      fromSkill: "ci_cd",
      toRequirement: "Deploy, monitor and operate services in AWS",
      rationale: "Pipeline ownership is adjacent to deployment, though not a substitute.",
      evidence: "Languages: TypeScript, JavaScript, HTML, CSS, SQL",
    },
  ],
  missingKeywords: [],
  recommendations: [
    {
      priority: "high",
      action: "Name any cloud or container exposure explicitly, however limited.",
      why: "AWS and Docker are required and currently unevidenced.",
      section: "skills",
      relatedSkill: "aws",
    },
  ],
  bulletImprovements: [],
  overallHiringProbability: 62,
  reasoning: "Strong on the frontend requirements, unevidenced on two required infrastructure items.",
});

function completion(text: string): AiCompletion {
  return {
    stopReason: "completed",
    text,
    toolCalls: [],
    usage: USAGE,
    model: "stub-model",
    provider: "stub",
    latencyMs: 12,
  };
}

/** Ledger and throttle both healthy; reservations granted. */
function stubClient(overrides: Parameters<typeof createSupabaseStub>[0] = {}): SupabaseStub {
  return createSupabaseStub({
    count: { demo_usage: 0 },
    select: {
      ai_usage_counters: {
        usage_date: "2026-08-09",
        tokens_reserved: 0,
        tokens_used: 0,
        cost_micros: 0,
        request_count: 0,
      },
    },
    rpc: { ai_reserve_budget: true },
    ...overrides,
  });
}

const ENV = [
  "FEATURE_PUBLIC_DEMO",
  "FEATURE_AI",
  "FEATURE_RESUME_AI",
  "DEMO_OWNER_ID",
  "DEMO_IP_SALT",
  "AI_DEMO_DAILY_TOKEN_BUDGET",
  "AI_DAILY_TOKEN_BUDGET",
  "CLOUDFLARE_TURNSTILE_SECRET_KEY",
] as const;
let saved: Record<string, string | undefined>;

const SAMPLE_INPUT = { resumeText: null, jobDescription: null, turnstileToken: "0.tok" };

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  process.env.FEATURE_PUBLIC_DEMO = "true";
  process.env.FEATURE_AI = "true";
  process.env.FEATURE_RESUME_AI = "true";
  process.env.DEMO_OWNER_ID = OWNER;
  process.env.DEMO_IP_SALT = "test-salt";
  process.env.AI_DEMO_DAILY_TOKEN_BUDGET = "50000";
  process.env.AI_DAILY_TOKEN_BUDGET = "500000";
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "test-secret";

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }) as unknown as Response),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("exactly one provider call per analysis", () => {
  it("issues one completion, not four", async () => {
    const stub = stubClient();
    const provider = new StubProvider([completion(REVIEW)]);
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(provider);

    const result = await analyzeDemoAction(SAMPLE_INPUT);

    expect(result.ok).toBe(true);
    // The admin path requests enrichment and spends four calls. The demo asks
    // for the review only; a regression to four would quadruple the bill.
    expect(provider.requests).toHaveLength(1);
  });

  it("still returns the deterministic score alongside the review", async () => {
    const stub = stubClient();
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(new StubProvider([completion(REVIEW)]));

    const result = await analyzeDemoAction(SAMPLE_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analysis.overallScore).toBeGreaterThan(0);
    expect(result.data.analysis.breakdown).toHaveLength(5);
  });
});

describe("budget is enforced by the gateway, not re-implemented", () => {
  it("reserves before the call and commits after", async () => {
    const stub = stubClient();
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(new StubProvider([completion(REVIEW)]));

    await analyzeDemoAction(SAMPLE_INPUT);

    const names = stub.rpcCalls.map((c) => c.name);
    expect(names).toContain("ai_reserve_budget");
    expect(names).toContain("ai_commit_budget");
    expect(names.indexOf("ai_reserve_budget")).toBeLessThan(names.indexOf("ai_commit_budget"));
  });

  it("bills the dedicated demo owner, never the operator", async () => {
    const stub = stubClient();
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(new StubProvider([completion(REVIEW)]));

    await analyzeDemoAction(SAMPLE_INPUT);

    const reserve = stub.rpcCalls.find((c) => c.name === "ai_reserve_budget");
    expect(reserve?.args.p_owner_id).toBe(OWNER);
  });

  it("writes an audit row for the call", async () => {
    const stub = stubClient();
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(new StubProvider([completion(REVIEW)]));

    await analyzeDemoAction(SAMPLE_INPUT);

    expect(stub.opsFor("ai_audit_log").some((o) => o.type === "insert")).toBe(true);
  });

  it("audits a refused call too, even though no provider was reached", async () => {
    // ai_reserve_budget returning null is the refusal signal.
    const stub = stubClient({ rpc: { ai_reserve_budget: null } });
    const provider = new StubProvider([completion(REVIEW)]);
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(provider);

    const result = await analyzeDemoAction(SAMPLE_INPUT);

    expect(provider.requests, "a refused reservation must not reach the provider").toHaveLength(0);
    expect(stub.opsFor("ai_audit_log").some((o) => o.type === "insert")).toBe(true);
    // And the visitor still gets their score.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.aiNote).toBe(AI_UNAVAILABLE_NOTE);
  });
});

describe("every AI failure degrades to the deterministic score", () => {
  async function expectDegraded(stub: SupabaseStub, provider: AiProvider) {
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(provider);

    const result = await analyzeDemoAction(SAMPLE_INPUT);

    expect(result.ok, "the request must still succeed").toBe(true);
    if (!result.ok) return null;
    expect(result.data.analysis.overallScore).toBeGreaterThan(0);
    expect(result.data.aiInsights).toBeNull();
    expect(result.data.aiNote).toBe(AI_UNAVAILABLE_NOTE);
    return result.data;
  }

  it("when the daily demo ceiling is already spent", async () => {
    const stub = stubClient({
      select: {
        ai_usage_counters: {
          usage_date: "2026-08-09",
          tokens_reserved: 50_000,
          tokens_used: 50_000,
          cost_micros: 0,
          request_count: 9,
        },
      },
    });
    const provider = new StubProvider([completion(REVIEW)]);
    await expectDegraded(stub, provider);
    // Skipped before the gateway: no reservation, no provider call, no spend.
    expect(provider.requests).toHaveLength(0);
    expect(stub.rpcCalls.map((c) => c.name)).not.toContain("ai_reserve_budget");
  });

  it("when the provider is down", async () => {
    await expectDegraded(stubClient(), new StubProvider([new Error("upstream 503")]));
  });

  it("when the model returns nothing gradeable", async () => {
    await expectDegraded(stubClient(), new StubProvider([completion("not json at all")]));
  });

  it("when FEATURE_AI is off", async () => {
    process.env.FEATURE_AI = "false";
    const provider = new StubProvider([completion(REVIEW)]);
    await expectDegraded(stubClient(), provider);
    expect(provider.requests).toHaveLength(0);
  });

  it("when FEATURE_RESUME_AI is off", async () => {
    process.env.FEATURE_RESUME_AI = "false";
    const provider = new StubProvider([completion(REVIEW)]);
    await expectDegraded(stubClient(), provider);
    expect(provider.requests).toHaveLength(0);
  });

  it("never leaks a provider error to the visitor", async () => {
    const stub = stubClient();
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(
      new StubProvider([new Error("401 invalid x-api-key sk-ant-secret123")]),
    );

    const result = await analyzeDemoAction(SAMPLE_INPUT);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("sk-ant-secret123");
    expect(serialized).not.toContain("x-api-key");
    expect(serialized).not.toContain("401");
  });
});

describe("the successful path", () => {
  it("returns grounded insights and no note", async () => {
    const stub = stubClient();
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(new StubProvider([completion(REVIEW)]));

    const result = await analyzeDemoAction(SAMPLE_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.aiInsights).not.toBeNull();
    expect(result.data.aiNote).toBeNull();
    expect(result.data.aiInsights!.aiModel).toBe("stub-model");
  });

  it("meters the visitor only once the analysis succeeded", async () => {
    const stub = stubClient();
    resolveClient.mockReturnValue(stub.client);
    resolveProvider.mockReturnValue(new StubProvider([completion(REVIEW)]));

    await analyzeDemoAction(SAMPLE_INPUT);

    expect(stub.opsFor("demo_usage").some((o) => o.type === "insert")).toBe(true);
  });
});

describe("gates still apply ahead of any spend", () => {
  it("makes no provider call when the flag is off", async () => {
    process.env.FEATURE_PUBLIC_DEMO = "false";
    const provider = new StubProvider([completion(REVIEW)]);
    resolveClient.mockReturnValue(stubClient().client);
    resolveProvider.mockReturnValue(provider);

    const result = await analyzeDemoAction(SAMPLE_INPUT);

    expect(result.ok).toBe(false);
    expect(provider.requests).toHaveLength(0);
  });

  it("makes no provider call for invalid input", async () => {
    const provider = new StubProvider([completion(REVIEW)]);
    resolveClient.mockReturnValue(stubClient().client);
    resolveProvider.mockReturnValue(provider);

    const result = await analyzeDemoAction({
      resumeText: "too short",
      jobDescription: "x",
      turnstileToken: "0.tok",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_input");
    expect(provider.requests).toHaveLength(0);
  });
});
