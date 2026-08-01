/**
 * Condition evaluation and cron matching (Phase 3 · M10).
 *
 * Pure functions, no I/O, not `server-only` — they are the most testable part
 * of the engine and the part whose correctness decides whether a rule fires.
 *
 * Evaluation is deliberately total: an unresolvable path, a null, or a type
 * mismatch yields `false`, never a throw. A rule that cannot be evaluated must
 * not fire, and it must not take down the evaluation of every other rule
 * listening to the same event.
 */

import type { AutomationEventEnvelope, ConditionOp, RuleCondition } from "@/types/automation";

/**
 * Read a dotted path from the envelope's entity root.
 *
 * Own-property access only. A path like `constructor.prototype` must resolve to
 * undefined rather than walking into the prototype chain — the paths come from
 * stored rule data, and the allow-list in `schema.ts` is validated at authoring
 * time, not re-checked here.
 */
export function resolveField(entity: Record<string, unknown>, path: string): unknown {
  let current: unknown = entity;

  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/** Comparable form for ordering operators. Dates compare as epoch millis. */
function comparable(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function order(left: unknown, right: unknown, op: ConditionOp): boolean {
  const a = comparable(left);
  const b = comparable(right);
  // Two values that cannot be ordered are not "equal-ish" — they simply do not
  // satisfy an ordering test.
  if (a === null || b === null) return false;

  switch (op) {
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    default:
      return a <= b;
  }
}

/** Evaluate one comparison. Never throws. */
export function evaluateCondition(
  condition: RuleCondition,
  entity: Record<string, unknown>,
): boolean {
  const actual = resolveField(entity, condition.field);
  const expected = condition.value;

  switch (condition.op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "is_null":
      return actual === undefined || actual === null;

    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;

    case "in":
      return Array.isArray(expected) && expected.includes(actual as never);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual as never);

    case "contains":
      // Substring for text, membership for a list — the two readings an
      // operator means by "contains", chosen by what the field actually is.
      if (Array.isArray(actual)) return actual.includes(expected as never);
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      return false;

    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return order(actual, expected, condition.op);

    default:
      return false;
  }
}

/** All conditions must pass. An empty list means "always". */
export function conditionsMatch(
  conditions: RuleCondition[],
  envelope: AutomationEventEnvelope,
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, envelope.entity));
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

/** Expand one cron field into the set of values it matches. */
function expandField(field: string, lo: number, hi: number): Set<number> {
  const matched = new Set<number>();

  for (const part of field.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) continue;

    let start = lo;
    let end = hi;

    if (range !== "*") {
      const bounds = range.split("-");
      start = Number(bounds[0]);
      end = bounds.length === 2 ? Number(bounds[1]) : start;
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      // A bare `n/step` means "from n to the end of the range", not just `n`.
      if (bounds.length === 1 && stepRaw !== undefined) end = hi;
    }

    for (let value = start; value <= end; value += step) {
      if (value >= lo && value <= hi) matched.add(value);
    }
  }

  return matched;
}

/**
 * Does `date` fall in a minute this expression selects?
 *
 * UTC, matching the DSL. Day-of-month and day-of-week use cron's traditional
 * OR semantics when both are restricted — the behaviour every other cron
 * implementation has, and the one an operator copying an expression expects.
 */
export function cronMatches(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const minutes = expandField(fields[0], 0, 59);
  const hours = expandField(fields[1], 0, 23);
  const daysOfMonth = expandField(fields[2], 1, 31);
  const months = expandField(fields[3], 1, 12);
  const daysOfWeek = expandField(fields[4], 0, 6);

  if (!minutes.has(date.getUTCMinutes())) return false;
  if (!hours.has(date.getUTCHours())) return false;
  if (!months.has(date.getUTCMonth() + 1)) return false;

  const domRestricted = fields[2] !== "*";
  const dowRestricted = fields[4] !== "*";
  const domHit = daysOfMonth.has(date.getUTCDate());
  const dowHit = daysOfWeek.has(date.getUTCDay());

  if (domRestricted && dowRestricted) return domHit || dowHit;
  if (domRestricted) return domHit;
  if (dowRestricted) return dowHit;
  return true;
}

/**
 * Whether a schedule is due, given when it last ran.
 *
 * The scan runs on a coarser cadence than a cron minute, so this walks every
 * minute since the last run rather than testing only "now" — otherwise a rule
 * set for 09:00 would be missed whenever no scan happened to land in that
 * minute. The window is bounded so a long outage replays at most one day.
 */
export function isScheduleDue(
  expression: string,
  now: Date,
  lastRunAt: Date | null,
  maxLookbackMinutes = 1440,
): boolean {
  const nowMinute = Math.floor(now.getTime() / 60_000);
  const lastMinute = lastRunAt ? Math.floor(lastRunAt.getTime() / 60_000) : nowMinute - 1;
  const from = Math.max(lastMinute + 1, nowMinute - maxLookbackMinutes);

  for (let minute = from; minute <= nowMinute; minute += 1) {
    if (cronMatches(expression, new Date(minute * 60_000))) return true;
  }

  return false;
}
