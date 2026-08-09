import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEMO_VISITOR_LIMIT,
  DEMO_VISITOR_WINDOW_MINUTES,
  demoIpSalt,
} from "@/lib/demo/config";

/**
 * Per-visitor throttle for the public demo.
 *
 * The tier this fills: the demo's AI calls are owned by one dedicated user, so
 * `lib/ai/rateLimit.ts` — which keys on that owner — is a GLOBAL ceiling. It is
 * the right backstop for spend and the wrong tool for isolation, because one
 * visitor holding down a button would spend the ceiling and lock out everyone
 * else. This bounds a single visitor so the global tier is never the thing that
 * has to notice.
 *
 * WHY THIS FAILS CLOSED, WHEN THE AI LIMITER FAILS OPEN
 *
 * `lib/ai/rateLimit.ts` allows the call when its count query fails, and gives a
 * good reason: the daily budget still bounds spend underneath it, so refusing
 * everything would turn a degraded database into a total outage for a feature
 * that was never actually at risk.
 *
 * Neither half of that reasoning holds here. This is the only thing standing
 * between one anonymous visitor and the whole shared ceiling, so there is no
 * layer underneath to catch what it lets through — and the "outage" it prevents
 * is a demo being unavailable for a few minutes, not an operator losing access
 * to their own CRM. When the meter is unavailable the honest answer is no.
 */

/**
 * Salted SHA-256 of a visitor address.
 *
 * The limiter only ever asks whether two requests came from the same place,
 * which is an equality test — the address itself is never needed, so it is
 * never stored. The salt is required rather than optional: an unsalted hash of
 * an IPv4 address is reversible by enumerating the whole space in seconds, so
 * an unsalted digest would be the address with extra steps.
 */
export function hashVisitor(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Why a visitor was denied, when it was for a reason other than their count. */
export type VisitorDenialReason = "count" | "unidentified" | "unconfigured" | "unavailable";

export interface VisitorThrottleState {
  limited: boolean;
  /** Analyses already run inside the window. Zero when the count was not reached. */
  used: number;
  limit: number;
  windowMinutes: number;
  reason: VisitorDenialReason | null;
}

function denied(reason: VisitorDenialReason, used = 0): VisitorThrottleState {
  return {
    limited: true,
    used,
    limit: DEMO_VISITOR_LIMIT,
    windowMinutes: DEMO_VISITOR_WINDOW_MINUTES,
    reason,
  };
}

/** Start of the current window, as an ISO timestamp. */
function windowStart(): string {
  return new Date(Date.now() - DEMO_VISITOR_WINDOW_MINUTES * 60 * 1000).toISOString();
}

/**
 * Has this visitor exhausted their allowance?
 *
 * Expiry needs no sweep to take effect: the count is bounded by `created_at >=
 * windowStart`, so a row ages out of the answer the moment it falls behind the
 * window, whether or not it has been deleted yet. Deletion is housekeeping, not
 * correctness.
 */
export async function checkVisitorThrottle(
  client: SupabaseClient,
  ip: string | null | undefined,
): Promise<VisitorThrottleState> {
  // No address means no way to tell this visitor from the next one, so the
  // allowance cannot be enforced at all. That is a denial, not a free pass.
  if (!ip) return denied("unidentified");

  const salt = demoIpSalt();
  if (!salt) return denied("unconfigured");

  const { count, error } = await client
    .from("demo_usage")
    .select("id", { count: "exact", head: true })
    .eq("visitor_hash", hashVisitor(ip, salt))
    .gte("created_at", windowStart());

  if (error) {
    console.error("[demo throttle] count failed, denying the request:", error.message);
    return denied("unavailable");
  }

  const used = count ?? 0;
  return {
    limited: used >= DEMO_VISITOR_LIMIT,
    used,
    limit: DEMO_VISITOR_LIMIT,
    windowMinutes: DEMO_VISITOR_WINDOW_MINUTES,
    reason: used >= DEMO_VISITOR_LIMIT ? "count" : null,
  };
}

/**
 * Record one analysis against a visitor's allowance.
 *
 * Called after the work succeeds rather than before it: a visitor whose request
 * failed on validation or a provider outage has consumed nothing worth metering,
 * and charging them for it would make a broken demo feel punitive.
 *
 * The cost of that ordering is a window between check and record in which two
 * concurrent requests from one visitor both pass. It is bounded — the global
 * tier and the daily budget both sit underneath — and closing it would mean
 * reserving a slot up front and releasing it on failure, which is materially
 * more machinery than a demo's third analysis is worth.
 *
 * Never throws. A ledger write that fails must not fail an analysis the visitor
 * has already paid for in latency; the consequence is one uncounted request.
 */
export async function recordVisitorUsage(
  client: SupabaseClient,
  ip: string | null | undefined,
): Promise<void> {
  if (!ip) return;
  const salt = demoIpSalt();
  if (!salt) return;

  const { error } = await client
    .from("demo_usage")
    .insert({ visitor_hash: hashVisitor(ip, salt) });

  if (error) {
    console.error("[demo throttle] usage write failed, request not counted:", error.message);
    return;
  }

  await sweepExpired(client);
}

/**
 * Delete rows that have aged out of every window.
 *
 * Opportunistic rather than scheduled: this is one small table, and a cron for
 * it would be a moving part to deploy and monitor in exchange for deleting a few
 * hundred rows a day. Failure is ignored entirely — an uncollected row is
 * invisible to the count, which is already bounded by time.
 */
async function sweepExpired(client: SupabaseClient): Promise<void> {
  const { error } = await client.from("demo_usage").delete().lt("created_at", windowStart());
  if (error) {
    console.warn("[demo throttle] sweep failed, rows will be collected next time:", error.message);
  }
}
