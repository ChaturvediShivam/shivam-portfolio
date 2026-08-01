import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiCapabilities, AiCompletion, AiRequest, AiStreamEvent, AiTaskClass, AiUsage } from "@/types/ai";
import { AiGateway, type AiGatewayEvent } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { StreamAssembler, type RawStreamEvent } from "@/lib/ai/providers/anthropic/mapper";
import { registerAiTool } from "@/lib/ai/tools/registry";
import { AiTransientError } from "@/lib/ai/errors";

/**
 * Streaming contract (Phase 3 · M8).
 *
 * Two halves, tested apart because they fail apart: the vendor stream reducer
 * (frame assembly) and the gateway's streaming agent loop (policy). The loop is
 * driven by a provider that knows no vendor vocabulary, which is the same
 * neutrality proof `gateway.test.ts` makes for the non-streaming path.
 */

const CAPABILITIES: AiCapabilities = {
  structuredOutput: true,
  toolCalling: true,
  tokenCounting: false,
  prefixCaching: true,
  reasoningControl: true,
  streaming: true,
};

const USAGE: AiUsage = { inputTokens: 10, outputTokens: 4, cachedInputTokens: 0 };

function completion(overrides: Partial<AiCompletion> = {}): AiCompletion {
  return {
    stopReason: "completed",
    text: "",
    toolCalls: [],
    usage: USAGE,
    model: "stub-model",
    provider: "stub",
    latencyMs: 1,
    ...overrides,
  };
}

/** Scripts a sequence of streamed turns; each turn is a list of deltas + a completion. */
class StubStreamProvider implements AiProvider {
  readonly name = "stub";
  capabilities: AiCapabilities;
  requests: AiRequest[] = [];
  private readonly turns: { deltas: string[]; completion: AiCompletion }[];

  constructor(
    turns: { deltas: string[]; completion: AiCompletion }[],
    capabilities: Partial<AiCapabilities> = {},
  ) {
    this.turns = turns;
    this.capabilities = { ...CAPABILITIES, ...capabilities };
  }

  resolveModel(_taskClass: AiTaskClass): string {
    return "stub-model";
  }

  estimateCostMicros(): number {
    return 0;
  }

  async complete(request: AiRequest): Promise<AiCompletion> {
    this.requests.push(structuredClone(request));
    const turn = this.turns.shift();
    if (!turn) throw new Error("No scripted turn left.");
    return { ...turn.completion, text: turn.deltas.join("") };
  }

  async *stream(request: AiRequest): AsyncIterable<AiStreamEvent> {
    this.requests.push(structuredClone(request));
    const turn = this.turns.shift();
    if (!turn) throw new Error("No scripted turn left.");
    for (const text of turn.deltas) yield { type: "text_delta", text };
    yield { type: "completed", completion: { ...turn.completion, text: turn.deltas.join("") } };
  }
}

/** A provider that streams deltas but never terminates the stream. */
class TruncatedStreamProvider extends StubStreamProvider {
  async *stream(): AsyncIterable<AiStreamEvent> {
    yield { type: "text_delta", text: "half an ans" };
  }
}

/**
 * Minimal Supabase double: budget reservations are granted and audit inserts
 * succeed. Mirrors `fakeClient` in gateway.test.ts, kept local so the streaming
 * suite fails for streaming reasons only.
 */
function stubClient(): SupabaseClient {
  return {
    rpc(name: string) {
      return Promise.resolve({ data: name === "ai_reserve_budget" ? true : null, error: null });
    },
    from() {
      return { insert: () => Promise.resolve({ error: null }) };
    },
  } as unknown as SupabaseClient;
}

async function collect(stream: AsyncIterable<AiGatewayEvent>): Promise<AiGatewayEvent[]> {
  const events: AiGatewayEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function textOf(events: AiGatewayEvent[]): string {
  return events
    .filter((event): event is Extract<AiGatewayEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.text)
    .join("");
}

describe("StreamAssembler", () => {
  it("emits only visible text, never thinking or tool fragments", () => {
    const assembler = new StreamAssembler();
    const emitted: string[] = [];

    const frames: RawStreamEvent[] = [
      { type: "message_start", message: { model: "m", usage: { input_tokens: 7 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", text: "hmm" } },
      { type: "content_block_start", index: 1, content_block: { type: "text" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello " } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "there" } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } },
    ];

    for (const frame of frames) {
      const text = assembler.push(frame);
      if (text) emitted.push(text);
    }

    expect(emitted.join("")).toBe("Hello there");

    const result = assembler.finish({ provider: "p", model: "fallback", latencyMs: 2 });
    expect(result.text).toBe("Hello there");
    expect(result.stopReason).toBe("completed");
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3, cachedInputTokens: 0 });
    expect(result.model).toBe("m");
  });

  it("assembles a tool call from JSON fragments only once its block closes", () => {
    const assembler = new StreamAssembler();

    assembler.push({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "search_crm" } });
    assembler.push({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"que' } });
    assembler.push({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'ry":"acme"}' } });

    // Nothing is exposed while the fragments are still partial JSON.
    expect(assembler.finish({ provider: "p", model: "m", latencyMs: 0 }).toolCalls).toHaveLength(0);

    assembler.push({ type: "content_block_stop", index: 0 });

    const calls = assembler.finish({ provider: "p", model: "m", latencyMs: 0 }).toolCalls;
    expect(calls).toEqual([{ id: "t1", name: "search_crm", arguments: { query: "acme" } }]);
  });

  it("treats unparseable tool arguments as empty rather than trusting them", () => {
    const assembler = new StreamAssembler();
    assembler.push({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "x" } });
    assembler.push({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{not json" } });
    assembler.push({ type: "content_block_stop", index: 0 });

    expect(assembler.finish({ provider: "p", model: "m", latencyMs: 0 }).toolCalls[0].arguments).toEqual({});
  });

  it("maps a truncated turn without mistaking it for success", () => {
    const assembler = new StreamAssembler();
    assembler.push({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "cut" } });
    assembler.push({ type: "message_delta", delta: { stop_reason: "max_tokens" } });

    expect(assembler.finish({ provider: "p", model: "m", latencyMs: 0 }).stopReason).toBe("truncated");
  });
});

describe("AiGateway.stream", () => {
  beforeEach(() => {
    process.env.FEATURE_AI = "true";
  });

  afterEach(() => {
    delete process.env.FEATURE_AI;
    vi.restoreAllMocks();
  });

  it("re-emits text deltas in order and ends with the completion", async () => {
    const provider = new StubStreamProvider([{ deltas: ["Ac", "me is ", "at offer."], completion: completion() }]);
    const gateway = new AiGateway({ provider, client: stubClient() });

    const events = await collect(
      gateway.stream({ templateId: "assistant", variables: { question: "q", today: "2026-08-01" }, ownerId: "owner-1" }),
    );

    expect(textOf(events)).toBe("Acme is at offer.");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("runs a tool round and announces the tool before continuing", async () => {
    registerAiTool({
      name: "stream_probe",
      description: "probe",
      consequence: "read",
      schema: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        return { ok: true };
      },
    });

    const provider = new StubStreamProvider([
      {
        deltas: ["Let me look."],
        completion: completion({
          stopReason: "tool_call",
          toolCalls: [{ id: "c1", name: "stream_probe", arguments: {} }],
        }),
      },
      { deltas: ["Found it."], completion: completion() },
    ]);

    const gateway = new AiGateway({ provider, client: stubClient() });
    const events = await collect(
      gateway.stream({
        templateId: "assistant",
        variables: { question: "q", today: "2026-08-01" },
        ownerId: "owner-1",
        enableTools: true,
        maxToolRounds: 2,
      }),
    );

    expect(events.filter((event) => event.type === "tool")).toEqual([{ type: "tool", name: "stream_probe" }]);
    expect(textOf(events)).toBe("Let me look.Found it.");

    // The second turn must carry the tool result back to the provider.
    const followUp = provider.requests[1];
    expect(followUp.messages.some((message) => message.role === "tool")).toBe(true);
  });

  it("stops calling tools once the round ceiling is reached", async () => {
    const looping = () =>
      ({
        deltas: ["again"],
        completion: completion({
          stopReason: "tool_call",
          toolCalls: [{ id: "c", name: "stream_probe", arguments: {} }],
        }),
      });

    const provider = new StubStreamProvider([looping(), looping(), looping(), looping()]);
    const gateway = new AiGateway({ provider, client: stubClient() });

    await collect(
      gateway.stream({
        templateId: "assistant",
        variables: { question: "q", today: "2026-08-01" },
        ownerId: "owner-1",
        enableTools: true,
        maxToolRounds: 1,
      }),
    );

    // One initial turn plus exactly one tool round — not an unbounded loop.
    expect(provider.requests).toHaveLength(2);
  });

  it("falls back to a single-shot completion when the provider cannot stream", async () => {
    const provider = new StubStreamProvider([{ deltas: ["all at once"], completion: completion() }], {
      streaming: false,
    });
    const gateway = new AiGateway({ provider, client: stubClient() });

    const events = await collect(
      gateway.stream({ templateId: "assistant", variables: { question: "q", today: "2026-08-01" }, ownerId: "owner-1" }),
    );

    expect(textOf(events)).toBe("all at once");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("treats a stream that never completes as a failure, not an empty answer", async () => {
    const provider = new TruncatedStreamProvider([]);
    const gateway = new AiGateway({ provider, client: stubClient() });

    await expect(
      collect(gateway.stream({ templateId: "assistant", variables: { question: "q", today: "2026-08-01" }, ownerId: "owner-1" })),
    ).rejects.toBeInstanceOf(AiTransientError);
  });

  it("is inert while the AI flag is off", async () => {
    delete process.env.FEATURE_AI;
    const provider = new StubStreamProvider([{ deltas: ["nope"], completion: completion() }]);
    const gateway = new AiGateway({ provider, client: stubClient() });

    await expect(
      collect(gateway.stream({ templateId: "assistant", variables: { question: "q", today: "2026-08-01" }, ownerId: "owner-1" })),
    ).rejects.toMatchObject({ code: "disabled" });
    expect(provider.requests).toHaveLength(0);
  });
});
