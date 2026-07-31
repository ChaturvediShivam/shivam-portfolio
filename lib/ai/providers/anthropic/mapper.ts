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
