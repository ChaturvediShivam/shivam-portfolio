import "server-only";
import type { AiCompletion, AiStopReason, AiToolCall, AiUsage } from "@/types/ai";

/**
 * Anthropic ↔ DTO mapper (Phase 3 · M6).
 *
 * The sole translation point between this vendor's wire format and our internal
 * contracts — the same role `GoogleCalendarEventMapper` plays in M4. Raw vendor
 * payloads never reach the gateway, the database, or any consumer.
 *
 * The raw shapes below are declared structurally rather than imported from the
 * SDK so the mapper (and its tests) assert the payload contract explicitly. If
 * the vendor changes shape, it fails here — at the boundary — rather than
 * somewhere downstream.
 */

interface RawUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

interface RawBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface RawMessage {
  model?: string | null;
  stop_reason?: string | null;
  content?: RawBlock[] | null;
  usage?: RawUsage | null;
}

/**
 * Vendor stop reasons → our neutral vocabulary.
 *
 * `stop_sequence` and `pause_turn` both mean "this turn ended without failure"
 * for our purposes; we use no server-side tools, so a pause cannot strand work.
 * Anything unrecognised degrades to `completed` — the caller still inspects the
 * content, and a truncation/refusal never masquerades as success because those
 * two map explicitly.
 */
export function toStopReason(raw: string | null | undefined): AiStopReason {
  switch (raw) {
    case "tool_use":
      return "tool_call";
    case "max_tokens":
      return "truncated";
    case "refusal":
      return "refused";
    default:
      return "completed";
  }
}

/** Concatenate text blocks only. Thinking blocks are never treated as output. */
function toText(blocks: RawBlock[]): string {
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}

function toToolCalls(blocks: RawBlock[]): AiToolCall[] {
  const calls: AiToolCall[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    if (typeof block.id !== "string" || typeof block.name !== "string") continue;
    calls.push({
      id: block.id,
      name: block.name,
      // Tool inputs arrive as parsed objects; anything else is treated as empty
      // rather than trusted, since these values reach tool execution.
      arguments:
        block.input && typeof block.input === "object" && !Array.isArray(block.input)
          ? (block.input as Record<string, unknown>)
          : {},
    });
  }
  return calls;
}

export function toUsage(raw: RawUsage | null | undefined): AiUsage {
  return {
    inputTokens: raw?.input_tokens ?? 0,
    outputTokens: raw?.output_tokens ?? 0,
    cachedInputTokens: raw?.cache_read_input_tokens ?? 0,
  };
}

/**
 * Raw vendor message → `AiCompletion`.
 *
 * Note the ordering: `stop_reason` is resolved before content is read, so a
 * refusal (which returns HTTP 200 with empty or partial content) can never be
 * mistaken for a successful empty answer.
 */
export function toCompletion(
  raw: RawMessage,
  context: { provider: string; model: string; latencyMs: number },
): AiCompletion {
  const stopReason = toStopReason(raw.stop_reason);
  const blocks = Array.isArray(raw.content) ? raw.content : [];

  return {
    stopReason,
    text: toText(blocks),
    toolCalls: toToolCalls(blocks),
    usage: toUsage(raw.usage),
    model: raw.model ?? context.model,
    provider: context.provider,
    latencyMs: context.latencyMs,
  };
}

/** A single frame from this vendor's event stream, declared structurally. */
export interface RawStreamEvent {
  type: string;
  message?: RawMessage | null;
  index?: number;
  content_block?: RawBlock | null;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string | null;
  } | null;
  usage?: RawUsage | null;
}

/**
 * Incremental stream reducer (Phase 3 · M8).
 *
 * Folds this vendor's event frames into the neutral contract. It is a class
 * rather than a generator so the assembly rules stay unit-testable frame by
 * frame, without needing a live stream.
 *
 * Three vendor-specific facts are absorbed here and nowhere else:
 *   • tool arguments stream as concatenated JSON fragments, valid only once the
 *     block closes — so they are buffered and parsed at `content_block_stop`,
 *     never incrementally;
 *   • thinking deltas share the delta channel with visible text and must not be
 *     surfaced as output;
 *   • usage is split across the opening and closing frames, so input tokens come
 *     from the first and output tokens from the last.
 */
export class StreamAssembler {
  private text = "";
  private stopReason: string | null = null;
  private model: string | null = null;
  private usage: AiUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  /** Partially-received `tool_use` blocks, keyed by their stream index. */
  private readonly pending = new Map<number, { id: string; name: string; json: string }>();
  private readonly calls: AiToolCall[] = [];

  /**
   * Consume one frame, returning visible text to emit (empty when the frame
   * carries no output — thinking, tool fragments, bookkeeping).
   */
  push(event: RawStreamEvent): string {
    switch (event.type) {
      case "message_start": {
        this.model = event.message?.model ?? null;
        const usage = toUsage(event.message?.usage);
        this.usage.inputTokens = usage.inputTokens;
        this.usage.cachedInputTokens = usage.cachedInputTokens;
        return "";
      }

      case "content_block_start": {
        const block = event.content_block;
        if (
          block?.type === "tool_use" &&
          typeof block.id === "string" &&
          typeof block.name === "string" &&
          typeof event.index === "number"
        ) {
          this.pending.set(event.index, { id: block.id, name: block.name, json: "" });
        }
        return "";
      }

      case "content_block_delta": {
        if (event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
          this.text += event.delta.text;
          return event.delta.text;
        }
        if (event.delta?.type === "input_json_delta" && typeof event.delta.partial_json === "string") {
          const buffered = typeof event.index === "number" ? this.pending.get(event.index) : undefined;
          if (buffered) buffered.json += event.delta.partial_json;
        }
        // Everything else (thinking, signatures, citations) is not output.
        return "";
      }

      case "content_block_stop": {
        if (typeof event.index !== "number") return "";
        const buffered = this.pending.get(event.index);
        if (!buffered) return "";
        this.pending.delete(event.index);
        this.calls.push({
          id: buffered.id,
          name: buffered.name,
          // An empty fragment means a no-argument tool; anything unparseable is
          // treated as no arguments rather than trusted, since these values
          // reach tool execution.
          arguments: parseToolArguments(buffered.json),
        });
        return "";
      }

      case "message_delta": {
        if (event.delta?.stop_reason) this.stopReason = event.delta.stop_reason;
        const usage = toUsage(event.usage);
        if (usage.outputTokens) this.usage.outputTokens = usage.outputTokens;
        return "";
      }

      default:
        return "";
    }
  }

  /** The finished turn, in the same shape a non-streaming call returns. */
  finish(context: { provider: string; model: string; latencyMs: number }): AiCompletion {
    return {
      stopReason: toStopReason(this.stopReason),
      text: this.text,
      toolCalls: this.calls,
      usage: this.usage,
      model: this.model ?? context.model,
      provider: context.provider,
      latencyMs: context.latencyMs,
    };
  }
}

function parseToolArguments(json: string): Record<string, unknown> {
  if (!json.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
