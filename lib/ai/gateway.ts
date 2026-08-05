import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiCallOutcome,
  AiCompletion,
  AiMessage,
  AiRequest,
  AiToolCall,
  AiUsage,
} from "@/types/ai";
import type { PromptTemplate } from "@/lib/ai/prompts/template";
import { featureEnabled } from "@/lib/featureFlags";
import {
  AiDisabledError,
  AiRateLimitedError,
  AiTransientError,
  aiErrorCode,
} from "@/lib/ai/errors";
import { checkAiRateLimit } from "@/lib/ai/rateLimit";
import { recordAiCall } from "@/lib/ai/audit";
import { commitBudget, reserveBudget, type BudgetGrant } from "@/lib/ai/budget";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import { redact } from "@/lib/ai/redaction";
import { parseAndValidate } from "@/lib/ai/schema";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { executeAiTool, toolSpecs } from "@/lib/ai/tools/registry";
import type { AiToolContext } from "@/lib/ai/tools/tool";
import "@/lib/ai/tools/catalog";

/**
 * AI gateway (Phase 3 · M6).
 *
 * The only path to a provider. Everything policy-shaped lives here — feature
 * gating, prompt resolution, redaction, budget, tool authorization, output
 * validation, audit — so no caller can obtain a completion that skipped any of
 * it.
 *
 * It depends on the `AiProvider` interface and never on a concrete adapter, so
 * the whole file is exercised in tests against a provider that has never heard
 * of any vendor. That is the working proof of the neutrality invariant.
 */

/** Bounded tool rounds. M6 is not an agent loop — that is M8. */
const DEFAULT_MAX_TOOL_ROUNDS = 1;
const MAX_TOOL_ROUNDS_CEILING = 3;

/**
 * The copilot's agent loop is longer than a one-shot call's, because answering
 * "what's happening with Acme?" legitimately takes a search followed by a
 * drill-down. Still bounded: an unbounded loop is a bill, not a feature.
 */
const MAX_STREAM_TOOL_ROUNDS_CEILING = 6;

/** What a streaming consumer sees. Text arrives incrementally; tools announce themselves. */
export type AiGatewayEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; completion: AiCompletion };

export interface AiGatewayDeps {
  provider: AiProvider;
  /** Session client (RLS) or service-role client (owner-scoped) — caller's choice. */
  client: SupabaseClient;
}

export interface AiCompleteInput {
  templateId: string;
  templateVersion?: string;
  variables?: Record<string, unknown>;
  ownerId: string;
  actor?: "user" | "agent" | "system";
  /** Audit label for what this call was for. */
  action?: string;
  entityType?: string | null;
  entityId?: string | null;
  conversationId?: string | null;
  jobId?: string | null;
  /** Prior turns to include, already bounded by the caller. */
  history?: AiMessage[];
  /** Offer the read-tool catalogue to the model. */
  enableTools?: boolean;
  maxToolRounds?: number;
}

function emptyUsage(): AiUsage {
  return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0 };
}

function addUsage(total: AiUsage, next: AiUsage): void {
  total.inputTokens += next.inputTokens;
  total.outputTokens += next.outputTokens;
  total.cachedInputTokens += next.cachedInputTokens;
  total.cacheCreationInputTokens += next.cacheCreationInputTokens;
}

/**
 * Every token the provider charges for.
 *
 * Cache writes and cache reads are billed, so the budget must see them. Leaving
 * them out let the daily ceiling be overspent by the size of the cached prefix
 * on every call.
 */
function billableTokens(usage: AiUsage): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cachedInputTokens +
    usage.cacheCreationInputTokens
  );
}

function outcomeOf(completion: AiCompletion): AiCallOutcome {
  if (completion.stopReason === "refused") return "refused";
  if (completion.stopReason === "truncated") return "truncated";
  return "success";
}

/**
 * Conservative token estimate for providers with no counting endpoint.
 *
 * Deliberately pessimistic (~3 chars/token rather than the usual ~4) so the
 * budget over-reserves. Under-reserving would let a call slip past the ceiling.
 */
function estimateTokens(request: AiRequest): number {
  const characters =
    (request.system?.length ?? 0) + request.messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(characters / 3) + request.maxOutputTokens;
}

export class AiGateway {
  private readonly provider: AiProvider;
  private readonly client: SupabaseClient;

  constructor(deps: AiGatewayDeps) {
    this.provider = deps.provider;
    this.client = deps.client;
  }

  /**
   * Resolve the template and build the provider request under policy.
   *
   * Shared by `complete()` and `stream()` so both paths are gated, redacted and
   * tool-scoped identically — a second copy of this would be a second place for
   * a policy to be forgotten.
   */
  private prepare(input: AiCompleteInput): {
    template: PromptTemplate;
    request: AiRequest;
    wantsStructured: boolean;
    needsPromptFallback: boolean;
  } {
    // Fail-closed before anything else happens: flag off means fully inert.
    if (!featureEnabled("FEATURE_AI")) throw new AiDisabledError();

    const template = getPromptTemplate(input.templateId, input.templateVersion);
    const rendered = template.render(input.variables ?? {});

    const wantsStructured = Boolean(template.responseSchema);
    const needsPromptFallback = wantsStructured && !this.provider.capabilities.structuredOutput;

    // Providers without native schema constraints get the instruction in the
    // prompt instead. Validation is unchanged either way.
    const system = redact(
      needsPromptFallback
        ? `${rendered.system}\n\nRespond with a single JSON object and nothing else.`
        : rendered.system,
    );

    const offerTools = Boolean(input.enableTools) && this.provider.capabilities.toolCalling;

    const request: AiRequest = {
      taskClass: template.taskClass,
      system,
      messages: [...(input.history ?? []), { role: "user", content: redact(rendered.user) }],
      maxOutputTokens: template.maxOutputTokens,
      reasoningDepth: "standard",
      cachePolicy: "prefix",
      ...(wantsStructured && !needsPromptFallback ? { responseSchema: template.responseSchema } : {}),
      ...(offerTools ? { tools: toolSpecs("read") } : {}),
    };

    return { template, request, wantsStructured, needsPromptFallback };
  }

  /**
   * Refuse a burst before anything is reserved or spent.
   *
   * Only `actor: "user"` is throttled. Background work — M7 summaries, M10
   * automation runs — is already paced by the cron cadence and the automation
   * loop governor, and throttling it here would make a backlog permanent by
   * refusing the very calls meant to drain it.
   *
   * Audited on refusal for the same reason a budget refusal is: it is an
   * operator-visible event even though no provider call was made.
   */
  private async enforceRateLimit(input: AiCompleteInput, promptVersion: string, model: string) {
    if ((input.actor ?? "system") !== "user") return;

    const state = await checkAiRateLimit(this.client, input.ownerId);
    if (!state.limited) return;

    const error = new AiRateLimitedError(state.windowMinutes);
    await this.audit(input, promptVersion, model, emptyUsage(), 0, 0, "error", aiErrorCode(error));
    throw error;
  }

  async complete<T = unknown>(input: AiCompleteInput): Promise<AiCompletion<T>> {
    const { template, request, wantsStructured } = this.prepare(input);
    const model = this.provider.resolveModel(template.taskClass);
    const usage = emptyUsage();
    let costMicros = 0;
    let latencyMs = 0;

    await this.enforceRateLimit(input, template.version, model);

    const estimate = await this.estimate(request);

    let grant: BudgetGrant;
    try {
      grant = await reserveBudget(this.client, input.ownerId, estimate);
    } catch (error) {
      // A budget refusal is an operator-visible event, so it is audited even
      // though no provider call was made.
      await this.audit(input, template.version, model, usage, 0, 0, "error", aiErrorCode(error));
      throw error;
    }

    try {
      let completion = await this.provider.complete(request);
      addUsage(usage, completion.usage);
      costMicros += this.provider.estimateCostMicros(completion.model, completion.usage);
      latencyMs += completion.latencyMs;

      // Bounded tool rounds. Each round executes the requested read tools and
      // asks the provider once more with the results appended.
      const maxRounds = Math.min(
        Math.max(0, input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS),
        MAX_TOOL_ROUNDS_CEILING,
      );

      for (let round = 0; round < maxRounds && completion.toolCalls.length > 0; round += 1) {
        const results = await this.runTools(completion.toolCalls, {
          client: this.client,
          ownerId: input.ownerId,
          actor: input.actor ?? "agent",
        });

        request.messages = [
          ...request.messages,
          { role: "assistant", content: completion.text },
          ...results,
        ];

        completion = await this.provider.complete(request);
        addUsage(usage, completion.usage);
        costMicros += this.provider.estimateCostMicros(completion.model, completion.usage);
        latencyMs += completion.latencyMs;
      }

      // Only a cleanly completed reply is parsed: a truncated or refused one has
      // no contract to satisfy, and parsing it would turn a known outcome into a
      // confusing validation error.
      const parsed =
        wantsStructured && completion.stopReason === "completed"
          ? parseAndValidate<T>(completion.text, template.responseSchema as Record<string, unknown>)
          : undefined;

      await this.audit(
        input,
        template.version,
        completion.model,
        usage,
        costMicros,
        latencyMs,
        outcomeOf(completion),
        null,
      );

      return { ...completion, usage, parsed } as AiCompletion<T>;
    } catch (error) {
      await this.audit(
        input,
        template.version,
        model,
        usage,
        costMicros,
        latencyMs,
        "error",
        aiErrorCode(error),
      );
      throw error;
    } finally {
      // Always reconcile: on the error path this releases the unused portion of
      // the reservation instead of stranding it for the rest of the day.
      await commitBudget(this.client, grant, billableTokens(usage), costMicros);
    }
  }

  /**
   * Streaming agent loop (Phase 3 · M8).
   *
   * The same policy pipeline as `complete()` — flag gate, redaction, budget
   * reservation, tool authorization, audit, budget reconciliation — with the
   * answer delivered incrementally and tool rounds run in between.
   *
   * Structured output is deliberately not offered here: a schema-constrained
   * reply has nothing useful to show until it is complete and validated, so
   * those callers use `complete()`. The copilot's template is prose.
   *
   * Cancellation matters on this path in a way it does not on the other: when a
   * client disconnects, the consumer stops pulling, and the generator resumes at
   * its `finally` without ever reaching the success or error audit. Both halves
   * of the accounting therefore live in `finally` — every reservation produces
   * exactly one audit row and one reconciliation, including the abandoned ones.
   * Spend that no one recorded is the one outcome this must not have.
   */
  async *stream(input: AiCompleteInput): AsyncIterable<AiGatewayEvent> {
    const { template, request } = this.prepare(input);
    const model = this.provider.resolveModel(template.taskClass);

    const usage = emptyUsage();
    let costMicros = 0;
    let latencyMs = 0;
    let settled: { outcome: AiCallOutcome; errorCode: string | null; model: string } | null = null;

    await this.enforceRateLimit(input, template.version, model);

    const estimate = await this.estimate(request);

    let grant: BudgetGrant;
    try {
      grant = await reserveBudget(this.client, input.ownerId, estimate);
    } catch (error) {
      await this.audit(input, template.version, model, usage, 0, 0, "error", aiErrorCode(error));
      throw error;
    }

    try {
      const maxRounds = Math.min(
        Math.max(0, input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS),
        MAX_STREAM_TOOL_ROUNDS_CEILING,
      );

      let completion: AiCompletion | undefined;

      for (let round = 0; ; round += 1) {
        completion = yield* this.streamOnce(request);
        addUsage(usage, completion.usage);
        costMicros += this.provider.estimateCostMicros(completion.model, completion.usage);
        latencyMs += completion.latencyMs;

        if (completion.toolCalls.length === 0 || round >= maxRounds) break;

        for (const call of completion.toolCalls) yield { type: "tool", name: call.name };

        const results = await this.runTools(completion.toolCalls, {
          client: this.client,
          ownerId: input.ownerId,
          actor: input.actor ?? "user",
        });

        request.messages = [
          ...request.messages,
          { role: "assistant", content: completion.text },
          ...results,
        ];
      }

      settled = { outcome: outcomeOf(completion), errorCode: null, model: completion.model };

      yield { type: "done", completion: { ...completion, usage } };
    } catch (error) {
      settled = { outcome: "error", errorCode: aiErrorCode(error), model };
      throw error;
    } finally {
      // `settled` is still null when the consumer abandoned the generator
      // mid-answer. That is not an error the caller can see, but it did cost
      // tokens, so it is audited under a distinct code rather than going
      // unrecorded. `outcome` is a text column, so this needs no migration.
      const final = settled ?? { outcome: "error" as AiCallOutcome, errorCode: "cancelled", model };

      await this.audit(
        input,
        template.version,
        final.model,
        usage,
        costMicros,
        latencyMs,
        final.outcome,
        final.errorCode,
      );

      await commitBudget(this.client, grant, billableTokens(usage), costMicros);
    }
  }

  /**
   * One streamed turn: re-emit text deltas, return the finished completion.
   *
   * Falls back to `complete()` when the provider cannot stream, emitting the
   * whole answer as a single delta. The copilot then still works end to end —
   * it just arrives at once — which is what keeps streaming a provider
   * capability rather than a provider requirement.
   */
  private async *streamOnce(request: AiRequest): AsyncGenerator<AiGatewayEvent, AiCompletion> {
    if (!this.provider.capabilities.streaming || !this.provider.stream) {
      const completion = await this.provider.complete(request);
      if (completion.text) yield { type: "text", text: completion.text };
      return completion;
    }

    for await (const event of this.provider.stream(request)) {
      if (event.type === "text_delta") {
        yield { type: "text", text: event.text };
      } else {
        return event.completion;
      }
    }

    // A stream that ends without its terminal event is a broken contract, not an
    // empty answer — surfacing it as success would silently truncate the reply.
    throw new AiTransientError("AI provider stream ended without completing.");
  }

  /** Exact count when the provider offers one, conservative estimate otherwise. */
  private async estimate(request: AiRequest): Promise<number> {
    if (!this.provider.capabilities.tokenCounting || !this.provider.countTokens) {
      return estimateTokens(request);
    }
    try {
      return (await this.provider.countTokens(request)) + request.maxOutputTokens;
    } catch {
      // Counting is an optimisation; never let it block the call.
      return estimateTokens(request);
    }
  }

  /**
   * Execute model-requested tools under policy.
   *
   * A tool that throws returns its error to the model as a tool result rather
   * than aborting the call — the model can recover, and one bad argument should
   * not discard the turn. Policy refusals (write/external) surface the same way.
   */
  private async runTools(calls: AiToolCall[], ctx: AiToolContext): Promise<AiMessage[]> {
    const results: AiMessage[] = [];

    for (const call of calls) {
      let content: string;
      try {
        content = JSON.stringify(await executeAiTool(call.name, call.arguments, ctx));
      } catch (error) {
        content = JSON.stringify({
          error: error instanceof Error ? redact(error.message) : "Tool execution failed.",
        });
      }
      results.push({ role: "tool", content, toolCallId: call.id, toolName: call.name });
    }

    return results;
  }

  private async audit(
    input: AiCompleteInput,
    promptVersion: string,
    model: string,
    usage: AiUsage,
    costMicros: number,
    latencyMs: number,
    outcome: AiCallOutcome,
    errorCode: string | null,
  ): Promise<void> {
    await recordAiCall(this.client, {
      actor: input.actor ?? "system",
      action: input.action ?? "complete",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      aiProvider: this.provider.name,
      aiModel: model,
      aiPromptVersion: promptVersion,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      costMicros,
      latencyMs,
      outcome,
      errorCode,
      jobId: input.jobId ?? null,
      conversationId: input.conversationId ?? null,
      ownerId: input.ownerId,
    });
  }
}
