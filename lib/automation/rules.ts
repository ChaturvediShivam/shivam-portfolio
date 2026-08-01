import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActionResultEntry,
  AutomationRule,
  AutomationRun,
  RunStatus,
  TriggerType,
} from "@/types/automation";
import type { RuleDefinition } from "@/lib/automation/schema";

/**
 * Automation rules + runs data layer (Phase 3 · M10).
 *
 * Owner scoping is asserted in application code as well as by RLS, per H5: the
 * engine runs from the job runner under a service-role client that bypasses RLS
 * entirely, so every query here carries `owner_id` explicitly.
 */

const RULE_SELECT =
  "id, name, description, trigger, conditions, actions, enabled, last_scheduled_at, " +
  "metadata, owner_id, created_at, updated_at, archived_at";

const RUN_SELECT =
  "id, rule_id, trigger_type, event_type, entity_type, entity_id, status, reason, " +
  "action_results, error, idempotency_key, owner_id, created_at, updated_at";

const UNIQUE_VIOLATION = "23505";

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function createRule(
  client: SupabaseClient,
  definition: RuleDefinition,
  ownerId: string,
): Promise<AutomationRule> {
  const { data, error } = await client
    .from("automation_rules")
    .insert({
      name: definition.name,
      description: definition.description,
      trigger: definition.trigger,
      conditions: definition.conditions,
      actions: definition.actions,
      // Never armed on create. The first thing an operator does with a new rule
      // is read it back, and a rule that acted before that could not be reviewed.
      enabled: false,
      owner_id: ownerId,
    })
    .select(RULE_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as AutomationRule;
}

export async function updateRule(
  client: SupabaseClient,
  id: string,
  ownerId: string,
  definition: RuleDefinition,
): Promise<AutomationRule | null> {
  const { data, error } = await client
    .from("automation_rules")
    .update({
      name: definition.name,
      description: definition.description,
      trigger: definition.trigger,
      conditions: definition.conditions,
      actions: definition.actions,
    })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .select(RULE_SELECT);

  if (error) throw error;
  const rows = (data ?? []) as unknown as AutomationRule[];
  return rows[0] ?? null;
}

export async function setRuleEnabled(
  client: SupabaseClient,
  id: string,
  ownerId: string,
  enabled: boolean,
): Promise<AutomationRule | null> {
  const { data, error } = await client
    .from("automation_rules")
    .update({ enabled })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .select(RULE_SELECT);

  if (error) throw error;
  const rows = (data ?? []) as unknown as AutomationRule[];
  return rows[0] ?? null;
}

export async function archiveRule(
  client: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<AutomationRule | null> {
  const { data, error } = await client
    .from("automation_rules")
    .update({ enabled: false, archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .select(RULE_SELECT);

  if (error) throw error;
  const rows = (data ?? []) as unknown as AutomationRule[];
  return rows[0] ?? null;
}

export async function getRule(
  client: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<AutomationRule | null> {
  const { data, error } = await client
    .from("automation_rules")
    .select(RULE_SELECT)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as AutomationRule) ?? null;
}

export async function listRules(
  client: SupabaseClient,
  ownerId: string,
): Promise<AutomationRule[]> {
  const { data, error } = await client
    .from("automation_rules")
    .select(RULE_SELECT)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as AutomationRule[];
}

/**
 * Enabled rules listening for one event, across all owners.
 *
 * The engine's dispatch query. Owner filtering happens per-envelope rather than
 * here, because one event belongs to exactly one owner and the engine must
 * never evaluate it against another's rules.
 */
export async function listEnabledRulesForEvent(
  client: SupabaseClient,
  ownerId: string,
  event: string,
): Promise<AutomationRule[]> {
  const { data, error } = await client
    .from("automation_rules")
    .select(RULE_SELECT)
    .eq("owner_id", ownerId)
    .eq("enabled", true)
    .is("archived_at", null)
    .eq("trigger->>type", "event")
    .eq("trigger->>event", event);

  if (error) throw error;
  return (data ?? []) as unknown as AutomationRule[];
}

/** Every enabled schedule rule, for the scan to test against the clock. */
export async function listEnabledScheduleRules(
  client: SupabaseClient,
): Promise<AutomationRule[]> {
  const { data, error } = await client
    .from("automation_rules")
    .select(RULE_SELECT)
    .eq("enabled", true)
    .is("archived_at", null)
    .eq("trigger->>type", "schedule");

  if (error) throw error;
  return (data ?? []) as unknown as AutomationRule[];
}

export async function markScheduleRan(
  client: SupabaseClient,
  id: string,
  at: Date,
): Promise<void> {
  const { error } = await client
    .from("automation_rules")
    .update({ last_scheduled_at: at.toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface RecordRunInput {
  ruleId: string;
  ownerId: string;
  triggerType: TriggerType;
  eventType?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  status: RunStatus;
  reason?: string | null;
  actionResults?: ActionResultEntry[];
  error?: string | null;
  idempotencyKey?: string | null;
}

/** Raised when a run for this (rule, event) already exists. */
export class DuplicateRunError extends Error {
  constructor() {
    super("This rule has already run for this event.");
    this.name = "DuplicateRunError";
  }
}

/**
 * Record an evaluation.
 *
 * Every evaluation writes a row, including the ones that matched nothing: runs
 * are the loop governor as well as the audit trail, and a governor that only
 * counted successes would not bound a rule whose actions keep failing.
 */
export async function recordRun(
  client: SupabaseClient,
  input: RecordRunInput,
): Promise<AutomationRun> {
  const { data, error } = await client
    .from("automation_runs")
    .insert({
      rule_id: input.ruleId,
      owner_id: input.ownerId,
      trigger_type: input.triggerType,
      event_type: input.eventType ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      status: input.status,
      reason: input.reason ?? null,
      action_results: input.actionResults ?? [],
      error: input.error ? input.error.slice(0, 500) : null,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select(RUN_SELECT)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateRunError();
    throw error;
  }
  return data as unknown as AutomationRun;
}

/**
 * How many times this rule has acted on this entity recently.
 *
 * The loop governor's read. Counts only runs that executed something —
 * `skipped` evaluations cost nothing external and must not consume the budget,
 * or a rule that legitimately sees many non-matching events would throttle
 * itself out of ever firing.
 */
export async function countRecentRuns(
  client: SupabaseClient,
  ruleId: string,
  entityId: string | null,
  since: Date,
): Promise<number> {
  let query = client
    .from("automation_runs")
    .select("id", { count: "exact", head: true })
    .eq("rule_id", ruleId)
    .in("status", ["matched", "partial", "failed"])
    .gte("created_at", since.toISOString());

  query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function listRuns(
  client: SupabaseClient,
  ownerId: string,
  options: { ruleId?: string; limit?: number } = {},
): Promise<AutomationRun[]> {
  let query = client
    .from("automation_runs")
    .select(RUN_SELECT)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(1, options.limit ?? 50), 200));

  if (options.ruleId) query = query.eq("rule_id", options.ruleId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AutomationRun[];
}
