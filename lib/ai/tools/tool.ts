import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiToolConsequence, JsonSchema } from "@/types/ai";

/**
 * Tool contract (Phase 3 · M6).
 *
 * Tools are thin wrappers over the existing `lib/<entity>.ts` data layers, so an
 * agent read goes through exactly the same code — and the same RLS — as a human
 * read. Tools never touch SQL directly and never construct their own client.
 *
 * Dual execution context (freeze decision H5):
 *   • interactive callers pass the session client  → RLS applies
 *   • job callers pass the service-role client     → RLS is bypassed, so the
 *     tool MUST scope by `ownerId` explicitly in application code
 * Tools are written to be correct under both, which is why they assert ownership
 * rather than assuming the client enforces it.
 */

export interface AiToolContext {
  /** Session-bound (RLS) or service-role client, chosen by the caller. */
  readonly client: SupabaseClient;
  /** The owner every read/write must be scoped to. */
  readonly ownerId: string;
  /** Who the run is attributed to, for audit. */
  readonly actor: "user" | "agent" | "system";
}

export interface AiTool<TArgs = Record<string, unknown>, TResult = unknown> {
  readonly name: string;
  readonly description: string;
  /**
   * `read` may execute freely. `write` and `external` are approval-gated and
   * cannot execute in M6 — the approval queue is M9.
   */
  readonly consequence: AiToolConsequence;
  readonly schema: JsonSchema;
  execute(args: TArgs, ctx: AiToolContext): Promise<TResult>;
}

/** Read a required string argument, rejecting anything else. */
export function requireStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Tool argument "${key}" must be a non-empty string.`);
  }
  return value.trim();
}

/** Read an optional bounded integer argument. */
export function optionalIntArg(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number,
): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(1, Math.trunc(value)), max);
}
