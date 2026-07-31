import { describe, it, expect } from "vitest";
import { toCompletion, toStopReason, toUsage, type RawMessage } from "@/lib/ai/providers/anthropic/mapper";

const CTX = { provider: "anthropic", model: "test-model", latencyMs: 42 };

describe("stop reason mapping", () => {
  it("maps the vendor vocabulary onto the neutral one", () => {
    expect(toStopReason("end_turn")).toBe("completed");
    expect(toStopReason("tool_use")).toBe("tool_call");
    expect(toStopReason("max_tokens")).toBe("truncated");
    expect(toStopReason("refusal")).toBe("refused");
  });

  it("treats stop_sequence and pause_turn as completed", () => {
    expect(toStopReason("stop_sequence")).toBe("completed");
    expect(toStopReason("pause_turn")).toBe("completed");
  });

  it("degrades an unknown or absent reason to completed", () => {
    expect(toStopReason("something_new")).toBe("completed");
    expect(toStopReason(null)).toBe("completed");
    expect(toStopReason(undefined)).toBe("completed");
  });
});

describe("usage mapping", () => {
  it("reads token counts including cache reads", () => {
    expect(toUsage({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: 3,
    });
  });

  it("defaults every counter to zero when absent", () => {
    expect(toUsage(null)).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
  });
});

describe("completion mapping", () => {
  it("concatenates text blocks and ignores thinking blocks", () => {
    const raw: RawMessage = {
      model: "m",
      stop_reason: "end_turn",
      content: [
        { type: "thinking", text: "internal reasoning" },
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
      ],
      usage: { input_tokens: 1, output_tokens: 2 },
    };
    const completion = toCompletion(raw, CTX);
    expect(completion.text).toBe("Hello world");
    expect(completion.text).not.toContain("internal reasoning");
  });

  it("extracts tool calls with parsed arguments", () => {
    const raw: RawMessage = {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "get_opportunity", input: { opportunityId: "x" } }],
    };
    const completion = toCompletion(raw, CTX);
    expect(completion.stopReason).toBe("tool_call");
    expect(completion.toolCalls).toEqual([
      { id: "t1", name: "get_opportunity", arguments: { opportunityId: "x" } },
    ]);
  });

  it("never trusts a non-object tool input", () => {
    const raw: RawMessage = {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "x", input: "not-an-object" }],
    };
    expect(toCompletion(raw, CTX).toolCalls[0].arguments).toEqual({});
  });

  it("handles a refusal, which returns success with empty content", () => {
    const raw: RawMessage = { stop_reason: "refusal", content: [], usage: { input_tokens: 4, output_tokens: 0 } };
    const completion = toCompletion(raw, CTX);
    expect(completion.stopReason).toBe("refused");
    expect(completion.text).toBe("");
    expect(completion.usage.inputTokens).toBe(4);
  });

  it("survives a missing content array", () => {
    const completion = toCompletion({ stop_reason: "end_turn" }, CTX);
    expect(completion.text).toBe("");
    expect(completion.toolCalls).toEqual([]);
  });

  it("carries provenance and latency through", () => {
    const completion = toCompletion({ model: "srv-model", stop_reason: "end_turn" }, CTX);
    expect(completion.provider).toBe("anthropic");
    expect(completion.model).toBe("srv-model");
    expect(completion.latencyMs).toBe(42);
  });
});
