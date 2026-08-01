import "server-only";
import type {
  AiCapabilities,
  AiCompletion,
  AiRequest,
  AiStreamEvent,
  AiTaskClass,
  AiUsage,
} from "@/types/ai";

/**
 * AiProvider (Phase 3 · M6) — the vendor-neutrality boundary.
 *
 * Everything provider-specific lives behind this interface: the SDK, the wire
 * format, model ids, pricing, auth, reasoning/caching knobs, error classes and
 * stop-reason vocabulary. The gateway depends on this interface and never on a
 * concrete implementation, exactly as `CalendarSyncEngine` depends on
 * `CalendarProvider` and never imports Google (M4).
 *
 * Adding a provider = one new directory under `lib/ai/providers/` that satisfies
 * this interface, plus one env var. Nothing above this line changes.
 *
 * Model selection and cost live here rather than in shared code because both are
 * irreducibly vendor-specific — a shared model table would leak vendor ids into
 * the gateway.
 */
export interface AiProvider {
  /** Opaque identifier recorded for provenance (e.g. "anthropic"). */
  readonly name: string;

  /** What this provider can actually do; the gateway degrades accordingly. */
  readonly capabilities: AiCapabilities;

  /** Concrete model for a task class. Provider-owned, env-overridable. */
  resolveModel(taskClass: AiTaskClass): string;

  /** Cost of a call in micro-USD (millionths), for budget accounting. */
  estimateCostMicros(model: string, usage: AiUsage): number;

  /** Run one completion. Must throw only errors from `lib/ai/errors`. */
  complete(request: AiRequest): Promise<AiCompletion>;

  /**
   * Run one completion incrementally (Phase 3 · M8).
   *
   * Optional for the same reason `countTokens` is: not every provider exposes a
   * streaming endpoint, and a local runtime may only ever return a finished
   * message. The gateway checks `capabilities.streaming` and falls back to
   * `complete()` when absent, so a non-streaming provider still drives the
   * copilot — it simply arrives all at once.
   *
   * Must yield zero or more `text_delta` events followed by exactly one
   * `completed`, and must throw only errors from `lib/ai/errors`.
   */
  stream?(request: AiRequest): AsyncIterable<AiStreamEvent>;

  /**
   * Exact token count for a request. Optional: several providers (local
   * runtimes, some gateways) expose no counting endpoint. When absent the
   * gateway falls back to a conservative estimate, which over-reserves budget
   * rather than under-reserving.
   */
  countTokens?(request: AiRequest): Promise<number>;
}
