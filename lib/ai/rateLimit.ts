import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-owner AI call throttle (Phase 6 · Sprint 1).
 *
 * The same shape as `lib/rateLimit.ts`, which throttles contact-form
 * submissions by counting rows in the table they already write to. Here the
 * table is `ai_audit_log`: every gateway call writes exactly one row, including
 * refusals, and it is already indexed on `(owner_id, created_at desc)`. So the
 * meter is the audit trail — no new table, no migration, no Redis.
 *
 * WHAT THIS IS FOR, and what it is not.
 *
 * The daily token budget already bounds SPEND. It does not bound RATE: a held
 * Enter key can exhaust a day's ceiling in under a minute, and every one of
 * those calls is billed before the ceiling notices. This bounds the burst.
 *
 * Deliberately generous. A real operator running one analysis (four calls),
 * then a rewrite, then a cover letter is well inside it; only a stuck key or a
 * script trips it.
 */

/** Window and ceiling. One analysis is four calls, so this allows ~5 per window. */
const WINDOW_MINUTES = 5;
const MAX_CALLS_PER_WINDOW = 20;

export interface AiRateLimitState {
  limited: boolean;
  /** Calls already made inside the window. */
  used: number;
  limit: number;
  windowMinutes: number;
}

/**
 * Has this owner exceeded the burst ceiling?
 *
 * Fails OPEN, unlike the budget which fails closed. The two protect different
 * things: the budget protects money and must never be bypassed by an outage,
 * while this protects against a burst that the budget would then catch anyway.
 * Refusing every AI call because a count query failed would turn a degraded
 * database into a total outage for a feature that still has a spend ceiling
 * underneath it.
 */
export async function checkAiRateLimit(
  client: SupabaseClient,
  ownerId: string,
): Promise<AiRateLimitState> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count, error } = await client
    .from("ai_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", windowStart);

  if (error) {
    console.error("[ai rate limit] count failed, allowing the call:", error.message);
    return { limited: false, used: 0, limit: MAX_CALLS_PER_WINDOW, windowMinutes: WINDOW_MINUTES };
  }

  const used = count ?? 0;
  return {
    limited: used >= MAX_CALLS_PER_WINDOW,
    used,
    limit: MAX_CALLS_PER_WINDOW,
    windowMinutes: WINDOW_MINUTES,
  };
}
