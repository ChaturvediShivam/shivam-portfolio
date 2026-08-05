import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AiCapabilities,
  AiCompletion,
  AiMessage,
  AiRequest,
  AiStreamEvent,
  AiTaskClass,
  AiUsage,
} from "@/types/ai";
import { AiPermanentError, AiTransientError, AiUnconfiguredError } from "@/lib/ai/errors";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { StreamAssembler, toCompletion, type RawMessage, type RawStreamEvent } from "./mapper";

/**
 * Anthropic adapter (Phase 3 · M6).
 *
 * The ONLY module in the application permitted to import the vendor SDK, name a
 * vendor model, or know a vendor request/response field. Everything it returns
 * is an internal contract; everything it throws is from `lib/ai/errors`. The
 * ESLint boundary rule and the leak test both enforce that.
 *
 * Deliberately NOT used here: server-side refusal fallbacks. That is a
 * vendor-specific resilience feature, and expressing failover as "retry on
 * provider B" belongs at the neutral layer once a second adapter exists. A
 * refusal is already a first-class non-throwing outcome in our contract, so it
 * degrades gracefully rather than failing the caller.
 */

const PROVIDER_NAME = "anthropic";

/**
 * Per-request ceiling.
 *
 * The SDK defaults to a ten-minute timeout and two retries, so a hung request
 * could hold a serverless function for roughly half an hour while the browser
 * gave up at 120s — and every attempt the server completed still billed.
 *
 * 90s sits above every latency measured in production (the slowest observed
 * call was 30.3s) and below the client's own 120s abort, which is the ordering
 * that matters: the server must give up before the operator is told it has, or
 * the UI reports a timeout on work that is still running and still spending.
 */
const REQUEST_TIMEOUT_MS = 90_000;

/** Defaults live here, not in shared code, so no vendor id leaks upward. */
const DEFAULT_MODELS: Record<AiTaskClass, string> = {
  fast: "claude-opus-5",
  reasoning: "claude-opus-5",
};

/**
 * USD per million tokens, used for budget accounting only.
 *
 * Numerically, USD-per-MTok equals micro-USD-per-token, which is why
 * `estimateCostMicros` multiplies directly. Cached input reads bill at ~0.1x.
 * An unknown model falls back to the most expensive entry so an unrecognised
 * model over-estimates cost rather than silently under-charging the budget.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
const FALLBACK_PRICING = { input: 15, output: 75 };
const CACHED_INPUT_MULTIPLIER = 0.1;
/**
 * Writing to the prompt cache costs more than plain input.
 *
 * `cache_control: { type: "ephemeral" }` is the 5-minute tier, billed at ~1.25x
 * the base input rate. Charging cache writes at 1.0x would under-report every
 * call whose system prefix changed.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Effort per task class; overridable without touching code. */
function effortFor(taskClass: AiTaskClass): "low" | "medium" | "high" | "xhigh" | "max" {
  const override = process.env[taskClass === "fast" ? "AI_EFFORT_FAST" : "AI_EFFORT_REASONING"];
  if (override === "low" || override === "medium" || override === "high" || override === "xhigh" || override === "max") {
    return override;
  }
  return taskClass === "fast" ? "medium" : "high";
}

/**
 * Our messages → vendor messages.
 *
 * Tool results are carried as a user turn with a `tool_result` block, which is
 * this vendor's encoding; the neutral contract just says `role: "tool"`.
 */
function toVendorMessages(messages: AiMessage[]): Anthropic.MessageParam[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "tool") {
        return {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: message.toolCallId ?? "",
              content: message.content,
            },
          ],
        };
      }
      return {
        role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: message.content,
      };
    });
}

/**
 * Classify a vendor error into our taxonomy.
 *
 * Most-specific-first, per SDK guidance. Anything unrecognised is treated as
 * permanent so an unknown failure mode cannot spin the retry loop.
 */
function classify(error: unknown): AiTransientError | AiPermanentError {
  if (error instanceof Anthropic.RateLimitError) {
    return new AiTransientError("AI provider rate limit reached.");
  }
  // Before APIConnectionError, which it extends — otherwise a timeout is
  // reported as a connection failure and the operator debugs the wrong thing.
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiTransientError("AI provider did not respond in time.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiTransientError("AI provider connection failed.");
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new AiTransientError("AI provider is unavailable.");
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiPermanentError("AI provider rejected the credentials.");
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiPermanentError("AI model not found — check model configuration.");
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiPermanentError("AI provider rejected the request.");
  }
  // Never surface the raw vendor message: it can echo request content.
  return new AiPermanentError("AI provider call failed.");
}

export class AnthropicProvider implements AiProvider {
  readonly name = PROVIDER_NAME;

  readonly capabilities: AiCapabilities = {
    structuredOutput: true,
    toolCalling: true,
    tokenCounting: true,
    prefixCaching: true,
    reasoningControl: true,
    streaming: true,
  };

  private readonly client: Anthropic;

  constructor(apiKey: string) {
    if (!apiKey) throw new AiUnconfiguredError();
    this.client = new Anthropic({
      apiKey,
      timeout: REQUEST_TIMEOUT_MS,
      // Retry policy belongs to the caller, not the transport. The SDK defaults
      // to two retries of its own, which multiply with the single retry
      // `ResumeInsightsService` performs: one logical review call could become
      // six HTTP attempts, and any attempt the server completed is billed even
      // when the client stopped waiting for it.
      maxRetries: 0,
    });
  }

  resolveModel(taskClass: AiTaskClass): string {
    const override = process.env[taskClass === "fast" ? "AI_MODEL_FAST" : "AI_MODEL_REASONING"];
    return override && override.trim() ? override.trim() : DEFAULT_MODELS[taskClass];
  }

  estimateCostMicros(model: string, usage: AiUsage): number {
    const price = PRICING[model] ?? FALLBACK_PRICING;
    const input = usage.inputTokens * price.input;
    const cached = usage.cachedInputTokens * price.input * CACHED_INPUT_MULTIPLIER;
    const cacheWrite = usage.cacheCreationInputTokens * price.input * CACHE_WRITE_MULTIPLIER;
    const output = usage.outputTokens * price.output;
    return Math.round(input + cached + cacheWrite + output);
  }

  async complete(request: AiRequest): Promise<AiCompletion> {
    const model = this.resolveModel(request.taskClass);
    const startedAt = Date.now();

    try {
      const raw = await this.client.messages.create(this.buildParams(request, model));
      return toCompletion(raw as RawMessage, {
        provider: PROVIDER_NAME,
        model,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      throw classify(error);
    }
  }

  /**
   * Incremental completion (Phase 3 · M8).
   *
   * Errors are classified on both the opening call and mid-stream: a connection
   * dropped halfway through is exactly as transient as one that never opened,
   * and the copilot's retry decision must not depend on when it failed.
   */
  async *stream(request: AiRequest): AsyncIterable<AiStreamEvent> {
    const model = this.resolveModel(request.taskClass);
    const startedAt = Date.now();
    const assembler = new StreamAssembler();

    let raw: AsyncIterable<RawStreamEvent>;
    try {
      raw = (await this.client.messages.create({
        ...this.buildParams(request, model),
        stream: true,
      })) as unknown as AsyncIterable<RawStreamEvent>;
    } catch (error) {
      throw classify(error);
    }

    try {
      for await (const event of raw) {
        const text = assembler.push(event);
        if (text) yield { type: "text_delta", text };
      }
    } catch (error) {
      throw classify(error);
    }

    yield {
      type: "completed",
      completion: assembler.finish({
        provider: PROVIDER_NAME,
        model,
        latencyMs: Date.now() - startedAt,
      }),
    };
  }

  async countTokens(request: AiRequest): Promise<number> {
    const model = this.resolveModel(request.taskClass);
    try {
      const params = this.buildParams(request, model);
      const result = await this.client.messages.countTokens({
        model,
        system: params.system,
        messages: params.messages,
        tools: params.tools,
      });
      return result.input_tokens;
    } catch (error) {
      throw classify(error);
    }
  }

  /**
   * Build the vendor request.
   *
   * Sampling parameters (`temperature`/`top_p`/`top_k`) are deliberately never
   * sent — current models reject them outright. Determinism is steered through
   * the prompt and the effort level instead.
   */
  private buildParams(request: AiRequest, model: string): Anthropic.MessageCreateParamsNonStreaming {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: request.maxOutputTokens,
      messages: toVendorMessages(request.messages),
      output_config: { effort: effortFor(request.taskClass) },
      // Thinking is on by default on current models and shares the max_tokens
      // ceiling with visible output, which is why callers size it with headroom.
      thinking: request.reasoningDepth === "none" ? { type: "disabled" } : { type: "adaptive" },
    };

    if (request.system) {
      // Prefix caching applies to the stable system block only; volatile context
      // belongs in the user turn, after the breakpoint.
      params.system =
        request.cachePolicy === "prefix"
          ? [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }]
          : request.system;
    }

    if (request.responseSchema) {
      params.output_config = {
        ...params.output_config,
        format: { type: "json_schema", schema: request.responseSchema },
      };
    }

    if (request.tools?.length) {
      params.tools = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.schema as Anthropic.Tool.InputSchema,
      }));
    }

    return params;
  }
}
