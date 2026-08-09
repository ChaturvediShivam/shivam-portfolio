import "server-only";

/**
 * Configuration for the public Resume AI demo (/demo).
 *
 * The admin Resume AI feature runs behind a session: its caller is known, its
 * spend lands on the operator's own budget, and its bounds exist to catch
 * mistakes. None of that holds here. Every value below is spent by strangers,
 * so each limit is deliberately tighter than the authenticated equivalent and
 * lives in one file rather than being scattered across the route.
 *
 * Nothing here reads a secret into the client: this module is server-only, and
 * the demo's server action is the only consumer.
 */

/**
 * The numeric ceilings live in `./limits` so the browser can read the file size
 * without importing this server-only module. Re-exported here so every server
 * caller keeps importing them from one place.
 */
export {
  DEMO_MAX_RESUME_CHARS,
  DEMO_MAX_JD_CHARS,
  DEMO_MAX_FILE_BYTES,
  DEMO_VISITOR_LIMIT,
  DEMO_VISITOR_WINDOW_MINUTES,
} from "@/lib/demo/limits";

/** Fallback daily token ceiling when AI_DEMO_DAILY_TOKEN_BUDGET is unset. */
const DEFAULT_DEMO_TOKEN_BUDGET = 50_000;

/**
 * The dedicated non-admin Supabase user that owns demo budget, audit rows and
 * rate-limit windows.
 *
 * Required, not optional: ai_usage_counters.owner_id is a NOT NULL foreign key
 * into auth.users, so a synthetic id cannot stand in — the deployed database
 * rejects one with SQLSTATE 23503. Absent config returns null and the demo
 * refuses to run, which is the correct failure: no owner means no budget
 * ceiling, and no budget ceiling on an anonymous endpoint is an open tab at the
 * provider.
 */
export function demoOwnerId(): string | null {
  const raw = process.env.DEMO_OWNER_ID?.trim();
  return raw ? raw : null;
}

/**
 * Daily token ceiling for demo traffic, kept separate from the operator's own
 * AI_DAILY_TOKEN_BUDGET so strangers can never exhaust the budget the admin
 * features depend on.
 *
 * Unlike the authenticated budget, this never returns null-for-unlimited. An
 * unlimited public endpoint is not a configuration this file will express.
 */
export function demoDailyTokenBudget(): number {
  const raw = process.env.AI_DEMO_DAILY_TOKEN_BUDGET;
  if (!raw) return DEFAULT_DEMO_TOKEN_BUDGET;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DEMO_TOKEN_BUDGET;
  return parsed;
}

/**
 * Salt for hashing visitor IPs in the per-visitor throttle.
 *
 * The limiter needs equality, never the address, so the raw IP is never stored.
 * Absent config returns null and the caller must refuse rather than fall back to
 * an unsalted hash: an unsalted IP hash is trivially reversible by enumeration.
 */
export function demoIpSalt(): string | null {
  const raw = process.env.DEMO_IP_SALT?.trim();
  return raw ? raw : null;
}

/**
 * Is the demo fully configured to run?
 *
 * The feature flag is checked separately by the caller: a flag that is on but
 * unconfigured is an operator error worth distinguishing from a flag that is
 * deliberately off.
 */
export function demoConfigured(): boolean {
  return demoOwnerId() !== null && demoIpSalt() !== null;
}
