import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { featureEnabled } from "@/lib/featureFlags";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsageSnapshot } from "@/lib/ai/budget";
import { verifyDemoTurnstile } from "@/lib/demo/turnstile";
import { checkVisitorThrottle, recordVisitorUsage } from "@/lib/demo/visitorThrottle";
import {
  DEMO_VISITOR_WINDOW_MINUTES,
  demoConfigured,
  demoDailyTokenBudget,
  demoOwnerId,
} from "@/lib/demo/config";

/**
 * The anonymous equivalent of `withAdminAction`.
 *
 * `lib/actions.ts` resolves a session and hands the action a user id. There is
 * no session here and never will be, so the thing that has to be established
 * before an action runs is not "who is this" but "should this run at all". Four
 * gates answer that, cheapest first, and the action body only ever executes
 * once all four have passed.
 *
 * Ordering is a cost decision, not a stylistic one. The flag and configuration
 * checks read environment variables and cost nothing. Turnstile costs one
 * outbound request, and it comes before the database work deliberately: it is
 * what keeps unverified traffic from reaching our tables at all, so a script
 * that never solves a challenge cannot make us issue a single query. The two
 * database gates follow, and the action's own work — parsing, scoring, a
 * provider call — is the most expensive thing here and runs last.
 *
 * `lib/actions.ts` and every admin action are untouched. The two wrappers share
 * a shape and no code, because the only thing they have in common is returning
 * a result the caller can render.
 */

/**
 * Public failure codes.
 *
 * One per gate, so a client can tell "you are rate limited" from "the demo is
 * off" without being told anything about why. Note that `demo_disabled` and
 * `demo_unconfigured` deliberately carry the SAME public sentence: a visitor
 * has no business learning that the operator left an environment variable unset,
 * and an attacker probing for a misconfigured deployment learns nothing from
 * the difference. The codes diverge only in the server log.
 */
export type DemoErrorCode =
  | "demo_disabled"
  | "demo_unconfigured"
  | "verification_failed"
  | "rate_limited"
  | "budget_exhausted"
  | "internal_error";

/**
 * Structurally compatible with `ActionResult` from lib/action-result.ts — the
 * same `ok` discriminant and `formError` — with a `code` the demo UI switches
 * on. Declared here rather than by widening ActionResult, because adding a
 * field to that type would reach into every admin action that returns it.
 */
export type DemoActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: DemoErrorCode;
      formError: string;
      /** Present on `rate_limited`, so the UI can say when to come back. */
      retryAfterMinutes?: number;
    };

/** What the action body receives once every gate has passed. */
export interface DemoContext {
  /** Service-role client: there is no session, so RLS cannot be the boundary. */
  supabase: SupabaseClient;
  /** The dedicated demo user that owns budget, audit and throttle rows. */
  ownerId: string;
  /** Present when the request carried a resolvable address. */
  visitorIp: string | null;
}

export interface DemoActionInput {
  turnstileToken: string | null | undefined;
  visitorIp: string | null | undefined;
}

/**
 * Public copy. Every sentence here is written to be safe in a browser: no
 * provider name, no table name, no configuration detail, no count of what other
 * visitors have used.
 */
const MESSAGES: Record<DemoErrorCode, string> = {
  demo_disabled: "The live demo is not available right now.",
  demo_unconfigured: "The live demo is not available right now.",
  verification_failed: "We could not verify that request. Refresh the page and try again.",
  rate_limited: "You have used all of this hour's analyses. Try again shortly.",
  budget_exhausted: "The AI review is paused for today. Please try again tomorrow.",
  internal_error: "Something went wrong. Please try again.",
};

export function demoSuccess<T>(data: T): DemoActionResult<T> {
  return { ok: true, data };
}

export function demoFailure(
  code: DemoErrorCode,
  extra?: { retryAfterMinutes?: number },
): DemoActionResult<never> {
  return { ok: false, code, formError: MESSAGES[code], ...extra };
}

export async function withPublicDemoAction<T>(
  input: DemoActionInput,
  run: (context: DemoContext) => Promise<DemoActionResult<T>>,
  /**
   * Seam for tests. Production always uses the service client; injecting one
   * avoids a test needing real Supabase credentials to exercise a gate.
   */
  createClient: () => SupabaseClient = createServiceClient,
): Promise<DemoActionResult<T>> {
  // ---- Gate 1: feature flag and configuration. Environment reads only. ----
  if (!featureEnabled("FEATURE_PUBLIC_DEMO")) return demoFailure("demo_disabled");

  if (!demoConfigured()) {
    console.error(
      "[demo] FEATURE_PUBLIC_DEMO is on but DEMO_OWNER_ID or DEMO_IP_SALT is unset; refusing.",
    );
    return demoFailure("demo_unconfigured");
  }

  const ownerId = demoOwnerId();
  if (!ownerId) return demoFailure("demo_unconfigured");

  const visitorIp = input.visitorIp ?? null;

  // ---- Gate 2: Turnstile. One outbound request, before any database work. ----
  const verified = await verifyDemoTurnstile(input.turnstileToken, visitorIp);
  if (!verified) return demoFailure("verification_failed");

  let supabase: SupabaseClient;
  try {
    supabase = createClient();
  } catch (error) {
    // createServiceClient throws when Supabase env vars are missing. That is a
    // deployment fault, not something a visitor can act on.
    console.error("[demo] service client unavailable:", error);
    return demoFailure("demo_unconfigured");
  }

  // ---- Gate 3: per-visitor allowance. Fails closed inside the limiter. ----
  const throttle = await checkVisitorThrottle(supabase, visitorIp);
  if (throttle.limited) {
    return demoFailure("rate_limited", { retryAfterMinutes: DEMO_VISITOR_WINDOW_MINUTES });
  }

  // ---- Gate 4: global demo budget. The ceiling every visitor shares. ----
  if (await budgetExhausted(supabase, ownerId)) return demoFailure("budget_exhausted");

  // ---- Gate 5: run the action. ----
  let result: DemoActionResult<T>;
  try {
    result = await run({ supabase, ownerId, visitorIp });
  } catch (error) {
    // ---- Gate 6: scrub. ----
    // The only place an unexpected throw becomes a response. Provider errors
    // carry prompts, Postgres errors carry SQL and column names, and stack
    // traces carry paths — none of it crosses this line. The server log keeps
    // everything; the visitor gets one sentence.
    console.error("[demo] action threw:", error);
    return demoFailure("internal_error");
  }

  // Meter only work that actually happened. A visitor whose request failed
  // validation has consumed nothing worth charging against their allowance.
  if (result.ok) await recordVisitorUsage(supabase, visitorIp);

  return result;
}

/**
 * Has demo traffic spent its daily ceiling?
 *
 * Reuses the existing ledger rather than counting anything itself: reservations
 * are written by `ai_reserve_budget`, so `tokensReserved` is the authoritative
 * figure and reading it here cannot disagree with what the reservation path
 * sees. This is a pre-flight read, not a reservation — the atomic reserve still
 * happens at the point of the call, where the token estimate is known.
 *
 * Fails CLOSED. `getUsageSnapshot` returns null only when the ledger is
 * unreadable, and an unreadable ledger means the ceiling cannot be enforced.
 * The budget is the layer protecting money; it does not get to guess.
 */
async function budgetExhausted(client: SupabaseClient, ownerId: string): Promise<boolean> {
  const snapshot = await getUsageSnapshot(client, ownerId);

  if (!snapshot) {
    console.error("[demo] usage ledger unreadable, refusing rather than spending blind");
    return true;
  }

  // snapshot.limit is the operator's AI_DAILY_TOKEN_BUDGET. The demo has its
  // own, lower ceiling, so it is compared here rather than reused from there.
  return snapshot.tokensReserved >= demoDailyTokenBudget();
}
