/**
 * Automation domain types for the Career CRM (Phase 3 · M10).
 * Mirrors `automation_rules` / `automation_runs` and the rule DSL specified in
 * Phase 3 Architecture §14.1.
 */

import type { BadgeVariant } from "@/components/admin/ui";

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export const TRIGGER_TYPES = ["event", "schedule"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

/**
 * Domain events a rule may fire on.
 *
 * A closed list rather than "any string from EVENTS.md": a rule naming an event
 * nothing emits is a rule that silently never runs, which is the most expensive
 * kind of automation bug to diagnose. Each entry here has a real emission point
 * in `lib/automation/emit.ts`; adding an event means adding both.
 */
export const AUTOMATION_EVENTS = [
  "opportunity.created",
  "opportunity.stage_changed",
  "task.created",
  "task.status_changed",
  "message.received",
] as const;
export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number];

export interface EventTrigger {
  type: "event";
  event: AutomationEvent;
}

export interface ScheduleTrigger {
  type: "schedule";
  /** Five-field cron expression, evaluated in UTC. */
  schedule: string;
}

export type RuleTrigger = EventTrigger | ScheduleTrigger;

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export const CONDITION_OPS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "exists",
  "is_null",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

/** Operators that take no `value`. */
export const VALUELESS_OPS: ConditionOp[] = ["exists", "is_null"];

/** Operators whose `value` must be an array. */
export const ARRAY_OPS: ConditionOp[] = ["in", "not_in"];

export interface RuleCondition {
  /** Dotted path on the event entity, e.g. `opportunity.stage`. */
  field: string;
  op: ConditionOp;
  value?: unknown;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const ACTION_TYPES = [
  "create_task",
  "send_notification",
  "add_note",
  "draft_email",
  "change_stage",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/**
 * Actions whose effect is external or hard to undo. These never execute
 * directly: the engine writes an `ai_approvals` row and stops (ADR-006).
 */
export const APPROVAL_GATED_ACTIONS: ActionType[] = ["draft_email", "change_stage"];

export interface CreateTaskAction {
  action: "create_task";
  title: string;
  due_in_days?: number;
  priority?: string;
  opportunity_id?: string;
}

export interface SendNotificationAction {
  action: "send_notification";
  type: string;
  title: string;
  body?: string;
}

export interface AddNoteAction {
  action: "add_note";
  opportunity_id?: string;
  body: string;
}

export interface DraftEmailAction {
  action: "draft_email";
  instruction?: string;
}

export interface ChangeStageAction {
  action: "change_stage";
  opportunity_id?: string;
  to: string;
}

export type RuleAction =
  | CreateTaskAction
  | SendNotificationAction
  | AddNoteAction
  | DraftEmailAction
  | ChangeStageAction;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  enabled: boolean;
  last_scheduled_at: string | null;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export const RUN_STATUSES = ["skipped", "running", "matched", "partial", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface ActionResultEntry {
  action: ActionType;
  status: "executed" | "queued_for_approval" | "failed" | "skipped";
  detail?: string;
}

export interface AutomationRun {
  id: string;
  rule_id: string;
  trigger_type: TriggerType;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: RunStatus;
  reason: string | null;
  action_results: ActionResultEntry[];
  error: string | null;
  idempotency_key: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export function runStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "matched":
      return "success";
    case "failed":
      return "danger";
    case "partial":
    case "running":
      return "progress";
    default:
      return "neutral";
  }
}

export function runStatusLabel(status: string): string {
  switch (status) {
    case "matched":
      return "Ran";
    case "skipped":
      return "No match";
    case "running":
      return "Running";
    case "partial":
      return "Partly ran";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// The event envelope
// ---------------------------------------------------------------------------

/**
 * What a trigger delivers to the engine.
 *
 * Mirrors the canonical envelope in EVENTS.md. `entity` carries the readable
 * snapshot conditions are evaluated against, keyed by entity name so a
 * condition path reads `opportunity.stage` rather than `entity.stage`.
 */
export interface AutomationEventEnvelope {
  type: AutomationEvent;
  ownerId: string;
  entityType: string;
  entityId: string;
  /** `{ opportunity: {...} }` — the root a condition's dotted path resolves in. */
  entity: Record<string, unknown>;
  /** Dedupe key derived from the event's salient fields. */
  idempotencyKey: string;
  occurredAt: string;
}
