import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiCapabilities, AiCompletion, AiRequest, AiTaskClass, AiUsage } from "@/types/ai";
import { AiGateway } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { registerAiTool } from "@/lib/ai/tools/registry";
import {
  AiBudgetExceededError,
  AiDisabledError,
  AiInvalidOutputError,
  AiTransientError,
} from "@/lib/ai/errors";

/**
 * The neutrality proof: every test below drives the full gateway against a
 * provider that imports no SDK and knows no vendor vocabulary. If the gateway
 * ever depended on a concrete adapter, this file could not compile.
 */

const FULL_CAPABILITIES: AiCapabilities = {
  structuredOutput: true,
  toolCalling: true,
  tokenCounting: true,
  prefixCaching: true,
  reasoningControl: true,
  streaming: false,
};

const USAGE: AiUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cachedInputTokens: 5,
  cacheCreationInputTokens: 40,
};

function completion(overrides: Partial<AiCompletion> = {}): AiCompletion {
  return {
    stopReason: "completed",
    text: '{"echo":"nonce-1","ok":true}',
    toolCalls: [],
    usage: USAGE,
    model: "stub-model",
    provider: "stub",
    latencyMs: 5,
    ...overrides,
  };
}

class StubProvider implements AiProvider {
  readonly name = "stub";
  capabilities: AiCapabilities;
  requests: AiRequest[] = [];
  private readonly queue: (AiCompletion | Error)[];

  constructor(queue: (AiCompletion | Error)[], capabilities: Partial<AiCapabilities> = {}) {
    this.queue = queue;
    this.capabilities = { ...FULL_CAPABILITIES, ...capabilities };
  }

  resolveModel(taskClass: AiTaskClass): string {
    return `stub-${taskClass}`;
  }

  estimateCostMicros(_model: string, usage: AiUsage): number {
    return usage.inputTokens + usage.outputTokens;
  }

  async complete(request: AiRequest): Promise<AiCompletion> {
    // Deep-copy so later mutation by the gateway cannot rewrite history.
    this.requests.push({ ...request, messages: [...request.messages] });
    const next = this.queue.shift();
    if (!next) throw new Error("StubProvider: no queued response");
    if (next instanceof Error) throw next;
    return next;
  }

  async countTokens(): Promise<number> {
    return 100;
  }
}

/** Records rpc + insert traffic so budget and audit behaviour can be asserted. */
function fakeClient(options: { reserve?: boolean } = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const audits: Record<string, unknown>[] = [];

  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === "ai_reserve_budget") {
        return Promise.resolve({ data: options.reserve === false ? null : true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
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

  return { client, rpcCalls, audits };
}

const INPUT = { templateId: "self_test", variables: { nonce: "nonce-1" }, ownerId: "owner-1" };

beforeEach(() => {
  process.env.FEATURE_AI = "true";
});

afterEach(() => {
  delete process.env.FEATURE_AI;
  vi.restoreAllMocks();
});

describe("feature gating", () => {
  it("is fully inert when the flag is off — the provider is never called", async () => {
    delete process.env.FEATURE_AI;
    const provider = new StubProvider([completion()]);
    const { client, rpcCalls } = fakeClient();

    await expect(new AiGateway({ provider, client }).complete(INPUT)).rejects.toThrow(AiDisabledError);
    expect(provider.requests).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("happy path", () => {
  it("returns validated structured output and audits a success", async () => {
    const provider = new StubProvider([completion()]);
    const { client, audits } = fakeClient();

    const result = await new AiGateway({ provider, client }).complete<{ echo: string; ok: boolean }>(INPUT);

    expect(result.stopReason).toBe("completed");
    expect(result.parsed).toEqual({ echo: "nonce-1", ok: true });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      outcome: "success",
      ai_provider: "stub",
      ai_prompt_version: "1.0.0",
      // Cache writes are full-rate input with no column of their own, so they
      // fold into input_tokens: 100 uncached + 40 written to cache.
      input_tokens: 140,
      output_tokens: 20,
      cached_input_tokens: 5,
      owner_id: "owner-1",
    });
  });

  it("reserves before the call and reconciles after it", async () => {
    const provider = new StubProvider([completion()]);
    const { client, rpcCalls } = fakeClient();

    await new AiGateway({ provider, client }).complete(INPUT);

    expect(rpcCalls.map((call) => call.name)).toEqual(["ai_reserve_budget", "ai_commit_budget"]);
    expect(rpcCalls[0].args.p_tokens).toBeGreaterThan(0);
    // Actual = input + output; the estimate is replaced, not added to.
    // Every billable token, not just the uncached ones: 100 + 20 + 5 + 40.
    // This asserted 120 before the accounting fix, which let the daily ceiling
    // be overspent by the size of the cached prefix on every call.
    expect(rpcCalls[1].args.p_actual).toBe(165);
  });

  it("stamps the prompt version that produced the result", async () => {
    const provider = new StubProvider([completion()]);
    const { client, audits } = fakeClient();
    await new AiGateway({ provider, client }).complete({ ...INPUT, templateVersion: "1.0.0" });
    expect(audits[0].ai_prompt_version).toBe("1.0.0");
  });
});

describe("non-success stop reasons", () => {
  it("surfaces a refusal without throwing and without parsing", async () => {
    const provider = new StubProvider([completion({ stopReason: "refused", text: "" })]);
    const { client, audits } = fakeClient();

    const result = await new AiGateway({ provider, client }).complete(INPUT);

    expect(result.stopReason).toBe("refused");
    expect(result.parsed).toBeUndefined();
    expect(audits[0].outcome).toBe("refused");
  });

  it("surfaces truncation distinctly, so a partial is never treated as complete", async () => {
    const provider = new StubProvider([completion({ stopReason: "truncated", text: '{"echo":"nonc' })]);
    const { client, audits } = fakeClient();

    const result = await new AiGateway({ provider, client }).complete(INPUT);

    expect(result.stopReason).toBe("truncated");
    expect(result.parsed).toBeUndefined();
    expect(audits[0].outcome).toBe("truncated");
  });
});

describe("failure handling", () => {
  it("rejects output that does not satisfy the schema", async () => {
    const provider = new StubProvider([completion({ text: '{"echo":"nonce-1"}' })]);
    const { client, audits } = fakeClient();

    await expect(new AiGateway({ provider, client }).complete(INPUT)).rejects.toThrow(AiInvalidOutputError);
    expect(audits[0]).toMatchObject({ outcome: "error", error_code: "invalid_output" });
  });

  it("propagates a transient provider error and records it", async () => {
    const provider = new StubProvider([new AiTransientError("rate limited")]);
    const { client, audits } = fakeClient();

    await expect(new AiGateway({ provider, client }).complete(INPUT)).rejects.toThrow(AiTransientError);
    expect(audits[0]).toMatchObject({ outcome: "error", error_code: "transient" });
  });

  it("refuses when over budget, audits it, and never calls the provider", async () => {
    const provider = new StubProvider([completion()]);
    const { client, audits } = fakeClient({ reserve: false });

    await expect(new AiGateway({ provider, client }).complete(INPUT)).rejects.toThrow(AiBudgetExceededError);
    expect(provider.requests).toHaveLength(0);
    expect(audits[0]).toMatchObject({ outcome: "error", error_code: "budget_exceeded" });
  });

  it("releases the reservation even when the call fails", async () => {
    const provider = new StubProvider([new AiTransientError("boom")]);
    const { client, rpcCalls } = fakeClient();

    await expect(new AiGateway({ provider, client }).complete(INPUT)).rejects.toThrow(AiTransientError);

    const commit = rpcCalls.find((call) => call.name === "ai_commit_budget");
    expect(commit?.args.p_actual).toBe(0);
  });
});

describe("provider capability degradation", () => {
  it("moves the JSON contract into the prompt when native structured output is absent", async () => {
    const provider = new StubProvider([completion()], { structuredOutput: false });
    const { client } = fakeClient();

    const result = await new AiGateway({ provider, client }).complete(INPUT);

    expect(provider.requests[0].responseSchema).toBeUndefined();
    expect(provider.requests[0].system).toContain("single JSON object");
    // Validation is unchanged — the contract still holds.
    expect(result.parsed).toEqual({ echo: "nonce-1", ok: true });
  });

  it("falls back to a conservative estimate when token counting is unavailable", async () => {
    const provider = new StubProvider([completion()], { tokenCounting: false });
    const { client, rpcCalls } = fakeClient();

    await new AiGateway({ provider, client }).complete(INPUT);

    // The estimate must at least cover the reserved output ceiling.
    expect(rpcCalls[0].args.p_tokens).toBeGreaterThanOrEqual(1024);
  });

  it("does not offer tools to a provider that cannot call them", async () => {
    const provider = new StubProvider([completion()], { toolCalling: false });
    const { client } = fakeClient();

    await new AiGateway({ provider, client }).complete({ ...INPUT, enableTools: true });

    expect(provider.requests[0].tools).toBeUndefined();
  });
});

describe("bounded tool rounds", () => {
  const echoTool = {
    name: "gateway_test_echo",
    description: "Echoes its argument. Test-only read tool.",
    consequence: "read" as const,
    schema: { type: "object", properties: { value: { type: "string" } }, additionalProperties: false },
    async execute(args: Record<string, unknown>) {
      return { value: args.value };
    },
  };

  it("executes a requested read tool and asks the provider again with the result", async () => {
    registerAiTool(echoTool);

    const provider = new StubProvider([
      completion({
        stopReason: "tool_call",
        text: "",
        toolCalls: [{ id: "t1", name: "gateway_test_echo", arguments: { value: "hi" } }],
      }),
      completion(),
    ]);
    const { client } = fakeClient();

    const result = await new AiGateway({ provider, client }).complete({ ...INPUT, enableTools: true });

    expect(provider.requests).toHaveLength(2);
    const toolTurn = provider.requests[1].messages.find((message) => message.role === "tool");
    expect(toolTurn?.content).toContain("hi");
    expect(result.parsed).toEqual({ echo: "nonce-1", ok: true });
  });

  it("stops at the round ceiling instead of looping — M6 is not an agent loop", async () => {
    registerAiTool(echoTool);

    const toolCall = completion({
      stopReason: "tool_call",
      text: "",
      toolCalls: [{ id: "t1", name: "gateway_test_echo", arguments: { value: "hi" } }],
    });
    const provider = new StubProvider([toolCall, toolCall, toolCall, toolCall, completion()]);
    const { client } = fakeClient();

    const result = await new AiGateway({ provider, client }).complete({
      ...INPUT,
      enableTools: true,
      maxToolRounds: 99,
    });

    // Ceiling is 3 rounds, so at most 4 provider calls.
    expect(provider.requests.length).toBeLessThanOrEqual(4);
    expect(result.stopReason).toBe("tool_call");
  });

  it("accumulates usage across rounds rather than reporting only the last call", async () => {
    registerAiTool(echoTool);

    const provider = new StubProvider([
      completion({
        stopReason: "tool_call",
        text: "",
        toolCalls: [{ id: "t1", name: "gateway_test_echo", arguments: { value: "hi" } }],
      }),
      completion(),
    ]);
    const { client, audits } = fakeClient();

    await new AiGateway({ provider, client }).complete({ ...INPUT, enableTools: true });

    expect(audits[0]).toMatchObject({ input_tokens: 280, output_tokens: 40 });
  });

  it("returns a tool error to the model instead of aborting the turn", async () => {
    registerAiTool({
      ...echoTool,
      name: "gateway_test_boom",
      async execute() {
        throw new Error("tool exploded");
      },
    });

    const provider = new StubProvider([
      completion({
        stopReason: "tool_call",
        text: "",
        toolCalls: [{ id: "t1", name: "gateway_test_boom", arguments: {} }],
      }),
      completion(),
    ]);
    const { client } = fakeClient();

    const result = await new AiGateway({ provider, client }).complete({ ...INPUT, enableTools: true });

    const toolTurn = provider.requests[1].messages.find((message) => message.role === "tool");
    expect(toolTurn?.content).toContain("tool exploded");
    expect(result.parsed).toEqual({ echo: "nonce-1", ok: true });
  });
});
