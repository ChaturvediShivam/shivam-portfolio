/**
 * AI domain contracts (Phase 3 · M6).
 *
 * VENDOR-NEUTRALITY INVARIANT — this file is the boundary.
 * Nothing here may name or mirror a specific provider. No SDK types, no vendor
 * enums, no vendor stop-reason strings, no vendor request/response shapes. Every
 * provider-specific concept terminates inside `lib/ai/providers/<vendor>/`, and
 * the rest of the application (gateway, tools, prompts, data layers, jobs, UI)
 * depends only on the contracts declared here.
 *
 * Consequence: replacing the provider is a new directory under
 * `lib/ai/providers/` plus one env var — no change to the gateway, business
 * logic, database layer, tools, prompts, or consumers. If a swap ever requires
 * editing anything above the adapter line, that is a defect in this boundary.
 *
 * `model` and `provider` travel as opaque strings for provenance/audit only.
 * Nothing may branch on their value.
 */

/**
 * Why generation stopped, in neutral terms.
 *
 * Providers spell this differently (end_turn/stop/STOP, max_tokens/length/
 * MAX_TOKENS, refusal/content_filter/SAFETY). Each adapter maps its own
 * vocabulary onto these four; consumers only ever see these.
 */
export type AiStopReason = "completed" | "tool_call" | "truncated" | "refused";

/** Conversation roles. Common to every provider we intend to support. */
export type AiRole = "system" | "user" | "assistant" | "tool";

/**
 * What kind of work a call is doing. Callers request a class, never a model —
 * concrete model selection is provider/config territory (see lib/ai/models.ts).
 */
export type AiTaskClass = "fast" | "reasoning";

/**
 * How much internal deliberation to request. Providers expose this very
 * differently (or not at all); adapters translate or ignore it.
 */
export type AiReasoningDepth = "none" | "standard" | "deep";

/** Prompt-prefix caching intent. Adapters ignore it when unsupported. */
export type AiCachePolicy = "none" | "prefix";

/** A single turn in a request. `content` is plain text; tool results carry an id. */
export interface AiMessage {
  role: AiRole;
  content: string;
  /** Set on `tool` messages: which tool call this result answers. */
  toolCallId?: string;
  /** Set on `tool` messages: the tool that produced the result. */
  toolName?: string;
}

/**
 * A JSON Schema object. An open standard rather than a vendor type, which is
 * why it is allowed to cross the boundary.
 */
export type JsonSchema = Record<string, unknown>;

/** A tool offered to the model, in provider-independent form. */
export interface AiToolSpec {
  name: string;
  description: string;
  schema: JsonSchema;
}

/** A tool invocation requested by the model. */
export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** A provider-independent completion request. */
export interface AiRequest {
  taskClass: AiTaskClass;
  system?: string;
  messages: AiMessage[];
  tools?: AiToolSpec[];
  /** When set, the reply must satisfy this schema (validated by the gateway). */
  responseSchema?: JsonSchema;
  maxOutputTokens: number;
  reasoningDepth?: AiReasoningDepth;
  cachePolicy?: AiCachePolicy;
}

/**
 * Token usage for one call.
 *
 * The three input figures are disjoint and priced differently, which is why
 * they are carried separately rather than summed at the source:
 *
 *   inputTokens              uncached input, base rate
 *   cacheCreationInputTokens written to the cache this call, ~1.25x base
 *   cachedInputTokens        read from the cache, ~0.1x base
 *
 * Total billable input is the sum of all three. Omitting the middle one — as
 * this type did until the accounting fix — makes every prompt-cached call
 * under-report by the size of its cached prefix, silently.
 */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
}

/** The result of one completion. The only shape consumers ever see. */
export interface AiCompletion<T = unknown> {
  stopReason: AiStopReason;
  text: string;
  /** Present only when `responseSchema` was set and validation succeeded. */
  parsed?: T;
  toolCalls: AiToolCall[];
  usage: AiUsage;
  /** Opaque provenance. Recorded, never branched on. */
  model: string;
  /** Opaque provenance. Recorded, never branched on. */
  provider: string;
  latencyMs: number;
}

/**
 * What a provider can actually do.
 *
 * True neutrality means not assuming every provider supports everything: native
 * structured output, tool calling, a token-counting endpoint, prefix caching,
 * reasoning control and incremental streaming each exist on some providers and
 * not others. The gateway reads these and degrades deliberately rather than
 * assuming.
 */
export interface AiCapabilities {
  structuredOutput: boolean;
  toolCalling: boolean;
  tokenCounting: boolean;
  prefixCaching: boolean;
  reasoningControl: boolean;
  streaming: boolean;
}

/**
 * One event from an incremental generation (Phase 3 · M8).
 *
 * Deliberately minimal: visible text as it arrives, then exactly one terminal
 * event carrying the same `AiCompletion` a non-streaming call would have
 * returned. Tool calls travel in that final completion rather than as their own
 * event, so the gateway's tool loop is identical on both paths — streaming
 * changes how the answer is delivered, never what it means.
 *
 * Providers that stream nothing but the finished message still satisfy this by
 * yielding a single `completed`.
 */
export type AiStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "completed"; completion: AiCompletion };

/** Consequence class for a tool. Drives the execution policy. */
export type AiToolConsequence = "read" | "write" | "external";

/** Outcome recorded on every audited call. */
export type AiCallOutcome = "success" | "refused" | "truncated" | "error";

/** Per-owner budget state for the day. */
export interface AiUsageSnapshot {
  usageDate: string;
  tokensReserved: number;
  tokensUsed: number;
  costMicros: number;
  requestCount: number;
  /** Daily ceiling in tokens; null when unlimited. */
  limit: number | null;
}

/** A conversation container. */
export interface AiConversationView {
  id: string;
  subject: string | null;
  entityType: string | null;
  entityId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** One persisted turn. */
export interface AiTurn {
  id: string;
  conversationId: string;
  role: AiRole;
  content: string;
  toolCalls: AiToolCall[];
  inputTokens: number;
  outputTokens: number;
  /** Opaque provenance strings. */
  aiProvider: string | null;
  aiModel: string | null;
  aiPromptVersion: string | null;
  createdAt: string;
}

/** A row destined for `ai_audit_log`. */
export interface AiAuditEntry {
  actor: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  aiProvider: string;
  aiModel: string;
  aiPromptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  costMicros: number;
  latencyMs: number;
  outcome: AiCallOutcome;
  errorCode?: string | null;
  jobId?: string | null;
  conversationId?: string | null;
  ownerId: string;
}
