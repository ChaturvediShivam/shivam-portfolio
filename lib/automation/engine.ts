import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conditionsMatch } from "@/lib/automation/conditions";
import { executeAction } from "@/lib/automation/actions";
import {
  countRecentRuns,
  DuplicateRunError,
  listEnabledRulesForEvent,
  recordRun,
} from "@/lib/automation/rules";
import type {
  ActionResultEntry,
  AutomationEventEnvelope,
  AutomationRule,
  RunStatus,
} from "@/types/automation";

/**
 * The rule engine (Phase 3 · M10).
 *
 * One event in, zero or more rule evaluations out. Every evaluation writes an
 * `automation_runs` row — matched or not — because runs are simultaneously the
 * audit trail and the loop governor.
 *
 * LOOP SAFETY. Actions can re-fire the triggers that caused them: a rule on
 * `task.status_changed` whose action creates a task, or two rules that trigger
 * each other. Three independent bounds, because any one of them alone has a
 * hole:
 *
 *   1. Per-(rule, entity) run cap inside a cooldown window. Bounds a rule that
 *      keeps re-triggering on the same record — the common runaway.
 *   2. Idempotency on (rule, event). A redelivered job re-reads the existing
 *      run instead of executing again; the queue guarantees at-least-once, not
 *      exactly-once, so without this a retry is a duplicate effect.
 *   3. Actions that could cascade externally are approval-gated, so the worst a
 *      loop can produce is a queue of proposals a human never approves.
 *
 * The cap counts only runs that executed something. A rule seeing many
 * non-matching events must not throttle itself out of ever firing.
 */

/** How far back the governor looks. */
const COOLDOWN_MS = 10 * 60 * 1000;

/** Executions allowed per (rule, entity) inside that window. */
const MAX_RUNS_PER_ENTITY = 5;

/** Rules evaluated for a single event. A bound on fan-out, not on rule count. */
const MAX_RULES_PER_EVENT = 25;

export interface EvaluationSummary {
  ruleId: string;
  status: RunStatus;
  reason?: string;
}

/** Deterministic key: this rule, this event, once. */
export function runIdempotencyKey(ruleId: string, envelope: AutomationEventEnvelope): string {
  return `${ruleId}:${envelope.idempotencyKey}`;
}

function worstStatus(results: ActionResultEntry[]): RunStatus {
  if (results.some((entry) => entry.status === "failed")) {
    return results.every((entry) => entry.status === "failed") ? "failed" : "partial";
  }
  return "matched";
}

/**
 * Evaluate one rule against one event.
 *
 * Never throws for rule-level problems: a rule whose action fails records a
 * `failed` run and returns. The caller is processing a list, and one broken
 * rule must not stop the others from being evaluated.
 */
export async function evaluateRule(
  client: SupabaseClient,
  rule: AutomationRule,
  envelope: AutomationEventEnvelope,
): Promise<EvaluationSummary> {
  const idempotencyKey = runIdempotencyKey(rule.id, envelope);

  const base = {
    ruleId: rule.id,
    ownerId: envelope.ownerId,
    triggerType: "event" as const,
    eventType: envelope.type,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    idempotencyKey,
  };

  // Conditions first: a non-match costs nothing and must not consume the
  // governor's budget.
  if (!conditionsMatch(rule.conditions, envelope)) {
    try {
      await recordRun(client, { ...base, status: "skipped", reason: "Conditions did not match." });
    } catch (error) {
      if (!(error instanceof DuplicateRunError)) throw error;
    }
    return { ruleId: rule.id, status: "skipped", reason: "conditions" };
  }

  // Bound 1: the governor.
  const recent = await countRecentRuns(client, rule.id, envelope.entityId, new Date(Date.now() - COOLDOWN_MS));
  if (recent >= MAX_RUNS_PER_ENTITY) {
    try {
      await recordRun(client, {
        ...base,
        status: "skipped",
        reason: `Loop guard: ${MAX_RUNS_PER_ENTITY} runs for this record in the last ${COOLDOWN_MS / 60_000} minutes.`,
      });
    } catch (error) {
      if (!(error instanceof DuplicateRunError)) throw error;
    }
    return { ruleId: rule.id, status: "skipped", reason: "loop_guard" };
  }

  // Bound 2: claim the run BEFORE executing. A redelivered job hits the unique
  // index here and stops, so at-least-once delivery cannot mean twice-executed.
  let claimed;
  try {
    claimed = await recordRun(client, { ...base, status: "skipped", reason: "Executing…" });
  } catch (error) {
    if (error instanceof DuplicateRunError) {
      return { ruleId: rule.id, status: "skipped", reason: "already_run" };
    }
    throw error;
  }

  const results: ActionResultEntry[] = [];
  for (const action of rule.actions) {
    try {
      results.push(
        await executeAction(action, {
          client,
          ownerId: envelope.ownerId,
          envelope,
          triggerType: "event",
          ruleId: rule.id,
        }),
      );
    } catch (error) {
      console.error(`[automation] rule ${rule.id} action ${action.action} failed:`, error);
      results.push({
        action: action.action,
        status: "failed",
        detail: error instanceof Error ? error.message.slice(0, 200) : "Action failed.",
      });
    }
  }

  const status = worstStatus(results);

  await client
    .from("automation_runs")
    .update({
      status,
      reason: null,
      action_results: results,
      error: status === "matched" ? null : "One or more actions failed.",
    })
    .eq("id", claimed.id);

  return { ruleId: rule.id, status };
}

/**
 * Dispatch one event to every rule listening for it.
 *
 * Rules are evaluated in series rather than concurrently: they share the loop
 * governor's counters and can act on the same records, and a burst of parallel
 * writes would make the ordering of effects unpredictable for no useful gain at
 * this scale.
 */
export async function dispatchEvent(
  client: SupabaseClient,
  envelope: AutomationEventEnvelope,
): Promise<EvaluationSummary[]> {
  const rules = await listEnabledRulesForEvent(client, envelope.ownerId, envelope.type);
  const summaries: EvaluationSummary[] = [];

  for (const rule of rules.slice(0, MAX_RULES_PER_EVENT)) {
    try {
      summaries.push(await evaluateRule(client, rule, envelope));
    } catch (error) {
      console.error(`[automation] rule ${rule.id} evaluation failed:`, error);
      summaries.push({ ruleId: rule.id, status: "failed" });
    }
  }

  return summaries;
}

/**
 * Run a rule's actions on a schedule.
 *
 * No envelope, so no conditions and no entity — the DSL rejects conditions on a
 * scheduled rule for exactly that reason. The governor still applies, keyed on
 * a null entity.
 */
export async function runScheduledRule(
  client: SupabaseClient,
  rule: AutomationRule,
): Promise<EvaluationSummary> {
  const ownerId = rule.owner_id;
  if (!ownerId) return { ruleId: rule.id, status: "skipped", reason: "no_owner" };

  const recent = await countRecentRuns(client, rule.id, null, new Date(Date.now() - COOLDOWN_MS));
  if (recent >= MAX_RUNS_PER_ENTITY) {
    await recordRun(client, {
      ruleId: rule.id,
      ownerId,
      triggerType: "schedule",
      status: "skipped",
      reason: "Loop guard: too many scheduled runs in the cooldown window.",
    });
    return { ruleId: rule.id, status: "skipped", reason: "loop_guard" };
  }

  const results: ActionResultEntry[] = [];
  for (const action of rule.actions) {
    try {
      results.push(
        await executeAction(action, {
          client,
          ownerId,
          envelope: null,
          triggerType: "schedule",
          ruleId: rule.id,
        }),
      );
    } catch (error) {
      console.error(`[automation] scheduled rule ${rule.id} action ${action.action} failed:`, error);
      results.push({
        action: action.action,
        status: "failed",
        detail: error instanceof Error ? error.message.slice(0, 200) : "Action failed.",
      });
    }
  }

  const status = worstStatus(results);
  await recordRun(client, {
    ruleId: rule.id,
    ownerId,
    triggerType: "schedule",
    status,
    actionResults: results,
    error: status === "matched" ? null : "One or more actions failed.",
  });

  return { ruleId: rule.id, status };
}

/**
 * Evaluate a rule without executing anything.
 *
 * The dry run behind the UI's "Test" button. Reports whether the conditions
 * match and what would happen, so an operator can check a rule before arming
 * it — which is the whole reason `enabled` defaults to false.
 */
export function dryRun(
  rule: AutomationRule,
  envelope: AutomationEventEnvelope,
): { matched: boolean; wouldRun: string[] } {
  const matched = conditionsMatch(rule.conditions, envelope);
  return {
    matched,
    wouldRun: matched ? rule.actions.map((action) => action.action) : [],
  };
}
