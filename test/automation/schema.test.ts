import { describe, it, expect } from "vitest";
import {
  validateActions,
  validateConditions,
  validateCron,
  validateRule,
  validateTrigger,
} from "@/lib/automation/schema";

/**
 * Rule DSL validation (Phase 3 · M10).
 *
 * This is the trust boundary for the only user-authored logic in the system.
 * The tests below are mostly rejection cases, because the failure that matters
 * is not "a valid rule was refused" — the operator sees that immediately — but
 * "an invalid rule was accepted and quietly did nothing, or did the wrong
 * thing". Unknown keys and unknown enum members must be rejected, never ignored.
 */

const EVENT_TRIGGER = { type: "event", event: "opportunity.stage_changed" };

function issuePaths(result: ReturnType<typeof validateRule>): string[] {
  return result.ok ? [] : result.issues.map((issue) => issue.path);
}

describe("validateTrigger", () => {
  it("accepts a known event", () => {
    const result = validateTrigger(EVENT_TRIGGER);
    expect(result.ok).toBe(true);
  });

  it("rejects an event nothing emits", () => {
    // A rule naming an unemitted event is a rule that silently never runs —
    // the most expensive automation bug to diagnose.
    const result = validateTrigger({ type: "event", event: "opportunity.abducted" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown trigger type", () => {
    expect(validateTrigger({ type: "webhook", url: "http://x" }).ok).toBe(false);
  });

  it("rejects unknown keys rather than ignoring them", () => {
    const result = validateTrigger({ ...EVENT_TRIGGER, debounce: 500 });
    expect(result.ok).toBe(false);
  });

  it("accepts a schedule with a valid cron expression", () => {
    expect(validateTrigger({ type: "schedule", schedule: "0 9 * * 1-5" }).ok).toBe(true);
  });

  it("rejects a schedule with a malformed expression", () => {
    expect(validateTrigger({ type: "schedule", schedule: "0 9 * *" }).ok).toBe(false);
  });
});

describe("validateCron", () => {
  it("accepts the common forms", () => {
    for (const expression of ["* * * * *", "0 9 * * 1-5", "*/15 * * * *", "0 0 1 1 *", "5,20 8-17/2 * * *"]) {
      expect(validateCron(expression), expression).toEqual([]);
    }
  });

  it("rejects out-of-range values", () => {
    expect(validateCron("60 * * * *").length).toBeGreaterThan(0);
    expect(validateCron("* 24 * * *").length).toBeGreaterThan(0);
    expect(validateCron("* * 32 * *").length).toBeGreaterThan(0);
    expect(validateCron("* * * 13 *").length).toBeGreaterThan(0);
    expect(validateCron("* * * * 7").length).toBeGreaterThan(0);
  });

  it("rejects syntax the matcher does not implement", () => {
    // Accepting these would produce a rule that silently never fires.
    for (const expression of ["0 9 * * MON", "0 9 ? * *", "0 9 L * *", "0 9 * * 1W"]) {
      expect(validateCron(expression).length, expression).toBeGreaterThan(0);
    }
  });

  it("rejects an inverted range and a zero step", () => {
    expect(validateCron("* 17-8 * * *").length).toBeGreaterThan(0);
    expect(validateCron("*/0 * * * *").length).toBeGreaterThan(0);
  });
});

describe("validateConditions", () => {
  it("accepts a field readable on the trigger entity", () => {
    const result = validateConditions(
      [{ field: "opportunity.stage", op: "eq", value: "interview" }],
      "opportunity.stage_changed",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a field that does not exist on the entity", () => {
    const result = validateConditions(
      [{ field: "opportunity.salary_secret", op: "eq", value: "x" }],
      "opportunity.stage_changed",
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a field belonging to a different entity", () => {
    const result = validateConditions(
      [{ field: "task.status", op: "eq", value: "done" }],
      "opportunity.stage_changed",
    );
    expect(result.ok).toBe(false);
  });

  it("type-checks a value against the field's enum domain", () => {
    const result = validateConditions(
      [{ field: "opportunity.stage", op: "eq", value: "not_a_stage" }],
      "opportunity.stage_changed",
    );
    expect(result.ok).toBe(false);
  });

  it("requires an array for in / not_in", () => {
    expect(
      validateConditions([{ field: "opportunity.stage", op: "in", value: "offer" }], "opportunity.stage_changed").ok,
    ).toBe(false);
    expect(
      validateConditions(
        [{ field: "opportunity.stage", op: "in", value: ["offer", "hired"] }],
        "opportunity.stage_changed",
      ).ok,
    ).toBe(true);
  });

  it("refuses a value on exists / is_null", () => {
    expect(
      validateConditions([{ field: "opportunity.applied_at", op: "exists", value: true }], "opportunity.created").ok,
    ).toBe(false);
    expect(
      validateConditions([{ field: "opportunity.applied_at", op: "exists" }], "opportunity.created").ok,
    ).toBe(true);
  });

  it("requires a value on every other operator", () => {
    expect(validateConditions([{ field: "opportunity.stage", op: "eq" }], "opportunity.created").ok).toBe(false);
  });

  it("treats an empty list as always-match", () => {
    const result = validateConditions([], "opportunity.created");
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("rejects conditions on a scheduled rule, which has no triggering record", () => {
    const result = validateConditions([{ field: "opportunity.stage", op: "eq", value: "lead" }], null);
    expect(result.ok).toBe(false);
  });
});

describe("validateActions", () => {
  it("requires at least one action", () => {
    expect(validateActions([]).ok).toBe(false);
  });

  it("accepts a well-formed create_task", () => {
    const result = validateActions([
      { action: "create_task", title: "Prep", due_in_days: 2, priority: "high" },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects a priority outside the task_priority domain", () => {
    expect(validateActions([{ action: "create_task", title: "x", priority: "critical" }]).ok).toBe(false);
  });

  it("rejects a stage outside the opportunity_stage domain", () => {
    // "ghosted" used to be the sentinel here; it became a real stage in the
    // Career Intelligence migration, so this needs a value that is still absent.
    expect(validateActions([{ action: "change_stage", to: "shortlisted" }]).ok).toBe(false);
    expect(validateActions([{ action: "change_stage", to: "offer" }]).ok).toBe(true);
    expect(validateActions([{ action: "change_stage", to: "ghosted" }]).ok).toBe(true);
  });

  it("rejects an unknown action rather than dropping it", () => {
    // Silently ignoring this would arm a rule the operator believes does
    // something it does not.
    expect(validateActions([{ action: "delete_everything" }]).ok).toBe(false);
  });

  it("rejects unknown keys on a known action", () => {
    expect(validateActions([{ action: "create_task", title: "x", assignee: "someone" }]).ok).toBe(false);
  });

  it("bounds due_in_days", () => {
    expect(validateActions([{ action: "create_task", title: "x", due_in_days: -1 }]).ok).toBe(false);
    expect(validateActions([{ action: "create_task", title: "x", due_in_days: 4000 }]).ok).toBe(false);
    expect(validateActions([{ action: "create_task", title: "x", due_in_days: 1.5 }]).ok).toBe(false);
  });

  it("caps the number of actions", () => {
    const many = Array.from({ length: 11 }, () => ({ action: "create_task", title: "x" }));
    expect(validateActions(many).ok).toBe(false);
  });
});

describe("validateRule", () => {
  it("accepts the example rule from the architecture doc", () => {
    const result = validateRule({
      name: "Interview prep",
      trigger: EVENT_TRIGGER,
      conditions: [{ field: "opportunity.stage", op: "eq", value: "interview" }],
      actions: [
        { action: "create_task", title: "Send prep materials", due_in_days: 2, priority: "high" },
        { action: "send_notification", type: "interview_prep", title: "Interview stage reached" },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.actions).toHaveLength(2);
      expect(result.value.trigger).toEqual(EVENT_TRIGGER);
    }
  });

  it("requires a name", () => {
    const result = validateRule({ trigger: EVENT_TRIGGER, actions: [{ action: "create_task", title: "x" }] });
    expect(issuePaths(result)).toContain("name");
  });

  it("reports every problem at once rather than the first", () => {
    const result = validateRule({
      name: "",
      trigger: { type: "event", event: "nope" },
      actions: [],
    });
    expect(issuePaths(result).length).toBeGreaterThanOrEqual(3);
  });
});
