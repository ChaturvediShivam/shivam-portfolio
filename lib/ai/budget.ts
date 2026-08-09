import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiUsageSnapshot } from "@/types/ai";
import { AiBudgetExceededError, AiPermanentError } from "@/lib/ai/errors";

/**
 * Token budget accounting (Phase 3 · M6).
 *
 * Two-phase: reserve an estimate before the call, reconcile to actual after.
 * The reserve is a single atomic statement in Postgres (`ai_reserve_budget`), so
 * concurrent calls cannot both pass the same ceiling — the failure mode a
 * client-side "read total, compare, then spend" check would have.
 *
 * If the commit never lands (crash, or a DB failure after a successful provider
 * call) the reservation stands. That over-counts the day's usage, which is the
 * safe direction: the budget can under-spend, never over-spend.
 */

export interface BudgetGrant {
  ownerId: string;
  /** Tokens reserved up front; reconciled on commit. */
  estimate: number;
}

/** Daily ceiling in tokens. Unset or unparseable means unlimited. */
export function dailyTokenBudget(): number | null {
  const raw = process.env.AI_DAILY_TOKEN_BUDGET;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Reserve tokens or refuse.
 *
 * A refusal is permanent for the day — the job runner must not retry into the
 * same ceiling, which is why `AiBudgetExceededError` is non-retryable.
 */
export async function reserveBudget(
  client: SupabaseClient,
  ownerId: string,
  tokens: number,
  /**
   * Ceiling for this reservation, when the caller has a tighter one than the
   * operator's daily budget.
   *
   * The public demo does: it advertises AI_DEMO_DAILY_TOKEN_BUDGET but, without
   * this, would be measured against AI_DAILY_TOKEN_BUDGET — the only ceiling
   * `ai_reserve_budget` was ever told about. A preflight read cannot close that
   * gap, because two concurrent requests can both read "under the limit" before
   * either reserves. Passing the number here puts it inside the same atomic
   * statement everything else is already protected by.
   *
   * Omitted means the operator's budget, so every existing caller is unchanged.
   * `null` means unlimited, matching `dailyTokenBudget()`.
   */
  limitOverride?: number | null,
): Promise<BudgetGrant> {
  // `undefined` and `null` mean different things: absent falls back to the
  // operator's budget, explicit null is a deliberate "no ceiling". A supplied 0
  // must stay 0 rather than collapsing into unlimited.
  const limit = limitOverride === undefined ? dailyTokenBudget() : limitOverride;
  const estimate = Math.max(0, Math.trunc(tokens));

  const { data, error } = await client.rpc("ai_reserve_budget", {
    p_owner_id: ownerId,
    p_tokens: estimate,
    p_limit: limit,
  });

  // Fail closed: if the ledger cannot be consulted we do not spend. The most
  // likely cause is the M6 migration not being applied yet.
  if (error) {
    console.error("[ai budget] reserve failed:", error.message);
    throw new AiPermanentError("AI budget ledger is unavailable.");
  }

  // No row returned means the conditional update did not fire — over budget.
  if (data !== true) throw new AiBudgetExceededError();

  return { ownerId, estimate };
}

/**
 * Reconcile a reservation to measured usage.
 *
 * Never throws: the completion has already been produced and paid for, and
 * failing the caller over a bookkeeping write would discard real work. The
 * un-reconciled reservation remains as the conservative over-count.
 */
export async function commitBudget(
  client: SupabaseClient,
  grant: BudgetGrant,
  actualTokens: number,
  costMicros: number,
): Promise<void> {
  const { error } = await client.rpc("ai_commit_budget", {
    p_owner_id: grant.ownerId,
    p_estimate: grant.estimate,
    p_actual: Math.max(0, Math.trunc(actualTokens)),
    p_cost_micros: Math.max(0, Math.trunc(costMicros)),
  });

  if (error) console.error("[ai budget] commit failed:", error.message);
}

/**
 * Today's usage for the Settings panel.
 *
 * Returns null when the ledger is unavailable so Settings degrades to an
 * informational message rather than erroring — the same contract
 * `getJobsHealth` uses for the M1 queue.
 */
export async function getUsageSnapshot(
  client: SupabaseClient,
  ownerId: string,
): Promise<AiUsageSnapshot | null> {
  const { data, error } = await client
    .from("ai_usage_counters")
    .select("usage_date, tokens_reserved, tokens_used, cost_micros, request_count")
    .eq("owner_id", ownerId)
    .eq("usage_date", new Date().toISOString().slice(0, 10))
    .maybeSingle();

  if (error) return null;

  return {
    usageDate: data?.usage_date ?? new Date().toISOString().slice(0, 10),
    tokensReserved: data?.tokens_reserved ?? 0,
    tokensUsed: data?.tokens_used ?? 0,
    costMicros: Number(data?.cost_micros ?? 0),
    requestCount: data?.request_count ?? 0,
    limit: dailyTokenBudget(),
  };
}
