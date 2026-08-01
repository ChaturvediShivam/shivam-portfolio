/**
 * Rule DSL validation (Phase 3 · M10).
 *
 * NOT `server-only`: the create/edit form validates with the same code the
 * server persists through, so the operator sees the same rejection the database
 * would have produced. The server is still the authority — every write revalidates.
 *
 * This is the trust boundary for the one part of the system that accepts
 * user-authored logic. The DSL is deliberately non-Turing — no expressions, no
 * nesting, no code — so validation is a shape check rather than a sandbox, and
 * the properties it enforces are the ones the engine then relies on:
 *
 *   • every enum member is known (unknown keys and values are REJECTED, not
 *     ignored — silently dropping an unrecognised action would arm a rule the
 *     operator believes does something else);
 *   • `condition.field` resolves against a declared entity shape, so a typo is
 *     caught at authoring time rather than becoming a rule that never matches;
 *   • `value` is type-checked against the field, including enum domains;
 *   • at least one action, and approval-gated actions are marked as such.
 */

import {
  ACTION_TYPES,
  ARRAY_OPS,
  AUTOMATION_EVENTS,
  CONDITION_OPS,
  TRIGGER_TYPES,
  VALUELESS_OPS,
  type ActionType,
  type AutomationEvent,
  type ConditionOp,
  type RuleAction,
  type RuleCondition,
  type RuleTrigger,
} from "@/types/automation";
import { OPPORTUNITY_STAGES } from "@/types/opportunity";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/types/task";
import { MESSAGE_DIRECTIONS } from "@/types/message";

export interface DslIssue {
  path: string;
  message: string;
}

export type DslResult<T> = { ok: true; value: T } | { ok: false; issues: DslIssue[] };

/** A field a condition may read, and the domain its value must belong to. */
export interface FieldSpec {
  type: "string" | "number" | "boolean" | "date";
  /** Closed value domain, when the field is an enum. */
  enum?: readonly string[];
}

/**
 * The readable surface of each trigger entity.
 *
 * An allow-list, not a reflection of the row: a condition must never be able to
 * read a column the UI would not show (tokens, internal ids, other owners'
 * data), and the engine only ever populates these keys.
 */
const ENTITY_FIELDS: Record<string, Record<string, FieldSpec>> = {
  opportunity: {
    "opportunity.stage": { type: "string", enum: OPPORTUNITY_STAGES },
    "opportunity.title": { type: "string" },
    "opportunity.source": { type: "string" },
    "opportunity.location": { type: "string" },
    "opportunity.location_type": { type: "string" },
    "opportunity.employment_type": { type: "string" },
    "opportunity.seniority": { type: "string" },
    "opportunity.company_name": { type: "string" },
    "opportunity.applied_at": { type: "date" },
    "opportunity.next_action_at": { type: "date" },
    "opportunity.from_stage": { type: "string", enum: OPPORTUNITY_STAGES },
  },
  task: {
    "task.title": { type: "string" },
    "task.status": { type: "string", enum: TASK_STATUSES },
    "task.priority": { type: "string", enum: TASK_PRIORITIES },
    "task.due_at": { type: "date" },
    "task.from_status": { type: "string", enum: TASK_STATUSES },
  },
  message: {
    "message.subject": { type: "string" },
    "message.direction": { type: "string", enum: MESSAGE_DIRECTIONS },
    "message.from_address": { type: "string" },
    "message.snippet": { type: "string" },
    "message.has_opportunity": { type: "boolean" },
  },
};

/** Which entity each event delivers, so fields can be checked against it. */
const EVENT_ENTITY: Record<AutomationEvent, string> = {
  "opportunity.created": "opportunity",
  "opportunity.stage_changed": "opportunity",
  "task.created": "task",
  "task.status_changed": "task",
  "message.received": "message",
};

/** Every field readable for a given trigger, or all of them for a schedule. */
export function fieldsForEvent(event: AutomationEvent | null): Record<string, FieldSpec> {
  if (!event) return {};
  return ENTITY_FIELDS[EVENT_ENTITY[event]] ?? {};
}

export function isApprovalGated(action: ActionType): boolean {
  return action === "draft_email" || action === "change_stage";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Reject unknown keys rather than ignoring them. */
function unknownKeys(
  object: Record<string, unknown>,
  allowed: string[],
  path: string,
  issues: DslIssue[],
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      issues.push({ path, message: `Unknown field "${key}".` });
    }
  }
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

const CRON_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week
];

/**
 * Validate a five-field cron expression.
 *
 * Supports `*`, `n`, `a-b`, `a-b/s`, `*​/s` and comma lists — the subset that
 * covers scheduling and nothing more. Names (`MON`, `JAN`) and the non-standard
 * `?`/`L`/`W` are rejected: accepting a syntax the matcher does not implement
 * would produce a rule that silently never fires.
 */
export function validateCron(expression: string): DslIssue[] {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return [{ path: "trigger.schedule", message: "A cron expression needs exactly five fields." }];
  }

  for (let index = 0; index < 5; index += 1) {
    const [lo, hi] = CRON_RANGES[index];
    for (const part of fields[index].split(",")) {
      if (!isValidCronPart(part, lo, hi)) {
        return [{ path: "trigger.schedule", message: `Invalid cron field "${fields[index]}".` }];
      }
    }
  }

  return [];
}

function isValidCronPart(part: string, lo: number, hi: number): boolean {
  if (!part) return false;

  const [range, step] = part.split("/");
  if (step !== undefined) {
    const parsed = Number(step);
    if (!Number.isInteger(parsed) || parsed < 1) return false;
  }

  if (range === "*") return true;

  const bounds = range.split("-");
  if (bounds.length > 2) return false;

  for (const bound of bounds) {
    const parsed = Number(bound);
    if (!Number.isInteger(parsed) || parsed < lo || parsed > hi) return false;
  }

  if (bounds.length === 2 && Number(bounds[0]) > Number(bounds[1])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export function validateTrigger(input: unknown): DslResult<RuleTrigger> {
  const issues: DslIssue[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: "trigger", message: "A trigger is required." }] };
  }

  const type = input.type;
  if (typeof type !== "string" || !TRIGGER_TYPES.includes(type as never)) {
    return {
      ok: false,
      issues: [{ path: "trigger.type", message: "Choose an event or a schedule." }],
    };
  }

  if (type === "event") {
    unknownKeys(input, ["type", "event"], "trigger", issues);
    const event = input.event;
    if (typeof event !== "string" || !AUTOMATION_EVENTS.includes(event as never)) {
      issues.push({ path: "trigger.event", message: "Choose an event this system emits." });
    }
    if (issues.length) return { ok: false, issues };
    return { ok: true, value: { type: "event", event: event as AutomationEvent } };
  }

  unknownKeys(input, ["type", "schedule"], "trigger", issues);
  const schedule = input.schedule;
  if (typeof schedule !== "string" || !schedule.trim()) {
    issues.push({ path: "trigger.schedule", message: "A cron expression is required." });
  } else {
    issues.push(...validateCron(schedule));
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { type: "schedule", schedule: (schedule as string).trim() } };
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function checkValueType(
  value: unknown,
  spec: FieldSpec,
  op: ConditionOp,
  path: string,
  issues: DslIssue[],
): void {
  const check = (single: unknown, at: string) => {
    if (spec.enum) {
      if (typeof single !== "string" || !spec.enum.includes(single)) {
        issues.push({ path: at, message: `Must be one of: ${spec.enum.join(", ")}.` });
      }
      return;
    }
    if (spec.type === "number" && typeof single !== "number") {
      issues.push({ path: at, message: "Must be a number." });
    }
    if (spec.type === "boolean" && typeof single !== "boolean") {
      issues.push({ path: at, message: "Must be true or false." });
    }
    if ((spec.type === "string" || spec.type === "date") && typeof single !== "string") {
      issues.push({ path: at, message: "Must be text." });
    }
  };

  if (ARRAY_OPS.includes(op)) {
    if (!Array.isArray(value) || value.length === 0) {
      issues.push({ path, message: "Provide at least one value." });
      return;
    }
    value.forEach((entry, index) => check(entry, `${path}[${index}]`));
    return;
  }

  check(value, path);
}

export function validateConditions(
  input: unknown,
  event: AutomationEvent | null,
): DslResult<RuleCondition[]> {
  const issues: DslIssue[] = [];

  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ path: "conditions", message: "Conditions must be a list." }] };
  }

  const fields = fieldsForEvent(event);
  const value: RuleCondition[] = [];

  input.forEach((raw, index) => {
    const path = `conditions[${index}]`;
    if (!isPlainObject(raw)) {
      issues.push({ path, message: "Each condition must be an object." });
      return;
    }
    unknownKeys(raw, ["field", "op", "value"], path, issues);

    const field = raw.field;
    const op = raw.op;

    if (typeof field !== "string" || !field) {
      issues.push({ path: `${path}.field`, message: "Choose a field." });
      return;
    }
    // A schedule trigger delivers no entity, so it can carry no conditions.
    if (!event) {
      issues.push({
        path: `${path}.field`,
        message: "Scheduled rules have no triggering record to test.",
      });
      return;
    }
    const spec = fields[field];
    if (!spec) {
      issues.push({ path: `${path}.field`, message: `"${field}" is not readable for this event.` });
      return;
    }

    if (typeof op !== "string" || !CONDITION_OPS.includes(op as never)) {
      issues.push({ path: `${path}.op`, message: "Choose a comparison." });
      return;
    }
    const operator = op as ConditionOp;

    if (VALUELESS_OPS.includes(operator)) {
      if (raw.value !== undefined) {
        issues.push({ path: `${path}.value`, message: "This comparison takes no value." });
      }
      value.push({ field, op: operator });
      return;
    }

    if (raw.value === undefined) {
      issues.push({ path: `${path}.value`, message: "A value is required." });
      return;
    }

    checkValueType(raw.value, spec, operator, `${path}.value`, issues);
    value.push({ field, op: operator, value: raw.value });
  });

  return issues.length ? { ok: false, issues } : { ok: true, value };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function validateAction(raw: unknown, path: string, issues: DslIssue[]): RuleAction | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: "Each action must be an object." });
    return null;
  }

  const action = raw.action;
  if (typeof action !== "string" || !ACTION_TYPES.includes(action as never)) {
    issues.push({ path: `${path}.action`, message: "Choose a known action." });
    return null;
  }

  const requireString = (key: string, max = 500): string | null => {
    const candidate = raw[key];
    if (typeof candidate !== "string" || !candidate.trim()) {
      issues.push({ path: `${path}.${key}`, message: "This field is required." });
      return null;
    }
    if (candidate.length > max) {
      issues.push({ path: `${path}.${key}`, message: `Keep this under ${max} characters.` });
      return null;
    }
    return candidate.trim();
  };

  switch (action as ActionType) {
    case "create_task": {
      unknownKeys(raw, ["action", "title", "due_in_days", "priority", "opportunity_id"], path, issues);
      const title = requireString("title", 200);
      if (raw.due_in_days !== undefined) {
        const days = raw.due_in_days;
        if (typeof days !== "number" || !Number.isInteger(days) || days < 0 || days > 365) {
          issues.push({ path: `${path}.due_in_days`, message: "Must be a whole number of days, 0-365." });
        }
      }
      if (raw.priority !== undefined && !TASK_PRIORITIES.includes(raw.priority as never)) {
        issues.push({
          path: `${path}.priority`,
          message: `Must be one of: ${TASK_PRIORITIES.join(", ")}.`,
        });
      }
      if (!title) return null;
      return {
        action: "create_task",
        title,
        ...(raw.due_in_days !== undefined ? { due_in_days: raw.due_in_days as number } : {}),
        ...(raw.priority !== undefined ? { priority: raw.priority as string } : {}),
        ...(typeof raw.opportunity_id === "string" ? { opportunity_id: raw.opportunity_id } : {}),
      };
    }

    case "send_notification": {
      unknownKeys(raw, ["action", "type", "title", "body"], path, issues);
      const type = requireString("type", 60);
      const title = requireString("title", 200);
      if (raw.body !== undefined && typeof raw.body !== "string") {
        issues.push({ path: `${path}.body`, message: "Must be text." });
      }
      if (!type || !title) return null;
      return {
        action: "send_notification",
        type,
        title,
        ...(typeof raw.body === "string" ? { body: raw.body } : {}),
      };
    }

    case "add_note": {
      unknownKeys(raw, ["action", "opportunity_id", "body"], path, issues);
      const body = requireString("body", 2000);
      if (!body) return null;
      return {
        action: "add_note",
        body,
        ...(typeof raw.opportunity_id === "string" ? { opportunity_id: raw.opportunity_id } : {}),
      };
    }

    case "draft_email": {
      unknownKeys(raw, ["action", "instruction"], path, issues);
      if (raw.instruction !== undefined && typeof raw.instruction !== "string") {
        issues.push({ path: `${path}.instruction`, message: "Must be text." });
      }
      return {
        action: "draft_email",
        ...(typeof raw.instruction === "string" ? { instruction: raw.instruction } : {}),
      };
    }

    case "change_stage": {
      unknownKeys(raw, ["action", "opportunity_id", "to"], path, issues);
      const to = raw.to;
      if (typeof to !== "string" || !OPPORTUNITY_STAGES.includes(to as never)) {
        issues.push({
          path: `${path}.to`,
          message: `Must be one of: ${OPPORTUNITY_STAGES.join(", ")}.`,
        });
        return null;
      }
      return {
        action: "change_stage",
        to,
        ...(typeof raw.opportunity_id === "string" ? { opportunity_id: raw.opportunity_id } : {}),
      };
    }
  }
}

export function validateActions(input: unknown): DslResult<RuleAction[]> {
  const issues: DslIssue[] = [];

  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, issues: [{ path: "actions", message: "Add at least one action." }] };
  }
  if (input.length > 10) {
    return { ok: false, issues: [{ path: "actions", message: "A rule may have at most 10 actions." }] };
  }

  const value: RuleAction[] = [];
  input.forEach((raw, index) => {
    const parsed = validateAction(raw, `actions[${index}]`, issues);
    if (parsed) value.push(parsed);
  });

  return issues.length ? { ok: false, issues } : { ok: true, value };
}

// ---------------------------------------------------------------------------
// Whole rule
// ---------------------------------------------------------------------------

export interface RuleDefinition {
  name: string;
  description: string | null;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export function validateRule(input: {
  name?: unknown;
  description?: unknown;
  trigger?: unknown;
  conditions?: unknown;
  actions?: unknown;
}): DslResult<RuleDefinition> {
  const issues: DslIssue[] = [];

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) issues.push({ path: "name", message: "Give the rule a name." });
  if (name.length > 120) issues.push({ path: "name", message: "Keep the name under 120 characters." });

  const description =
    typeof input.description === "string" && input.description.trim()
      ? input.description.trim().slice(0, 500)
      : null;

  const trigger = validateTrigger(input.trigger);
  if (trigger.ok === false) issues.push(...trigger.issues);

  const event = trigger.ok && trigger.value.type === "event" ? trigger.value.event : null;
  const conditions = validateConditions(input.conditions, event);
  if (conditions.ok === false) issues.push(...conditions.issues);

  const actions = validateActions(input.actions);
  if (actions.ok === false) issues.push(...actions.issues);

  if (!trigger.ok || !conditions.ok || !actions.ok || issues.length) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      name,
      description,
      trigger: trigger.value,
      conditions: conditions.value,
      actions: actions.value,
    },
  };
}
