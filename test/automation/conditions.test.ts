import { describe, it, expect } from "vitest";
import {
  conditionsMatch,
  cronMatches,
  evaluateCondition,
  isScheduleDue,
  resolveField,
} from "@/lib/automation/conditions";
import type { AutomationEventEnvelope } from "@/types/automation";

/**
 * Condition evaluation and cron matching (Phase 3 · M10).
 *
 * Pure logic, and the part that decides whether a rule fires at all. Evaluation
 * must be total — an unresolvable path or a type mismatch yields false, never a
 * throw — because one malformed rule must not stop every other rule listening
 * to the same event.
 */

function envelope(entity: Record<string, unknown>): AutomationEventEnvelope {
  return {
    type: "opportunity.stage_changed",
    ownerId: "owner-1",
    entityType: "opportunity",
    entityId: "opp-1",
    entity,
    idempotencyKey: "k",
    occurredAt: "2026-08-02T00:00:00Z",
  };
}

const OPP = { opportunity: { stage: "interview", title: "Staff Engineer", applied_at: "2026-07-01T00:00:00Z" } };

describe("resolveField", () => {
  it("reads a dotted path", () => {
    expect(resolveField(OPP, "opportunity.stage")).toBe("interview");
  });

  it("returns undefined for a missing path instead of throwing", () => {
    expect(resolveField(OPP, "opportunity.nope")).toBeUndefined();
    expect(resolveField(OPP, "task.status")).toBeUndefined();
    expect(resolveField(OPP, "opportunity.stage.deeper")).toBeUndefined();
  });

  it("does not walk the prototype chain", () => {
    // Paths come from stored rule data; `constructor` must not be reachable.
    expect(resolveField(OPP, "constructor")).toBeUndefined();
    expect(resolveField(OPP, "opportunity.constructor.name")).toBeUndefined();
    expect(resolveField(OPP, "__proto__")).toBeUndefined();
    expect(resolveField(OPP, "opportunity.toString")).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  const check = (op: string, value?: unknown, field = "opportunity.stage") =>
    evaluateCondition({ field, op: op as never, value }, OPP);

  it("compares equality", () => {
    expect(check("eq", "interview")).toBe(true);
    expect(check("eq", "offer")).toBe(false);
    expect(check("neq", "offer")).toBe(true);
  });

  it("tests membership", () => {
    expect(check("in", ["interview", "offer"])).toBe(true);
    expect(check("in", ["offer"])).toBe(false);
    expect(check("not_in", ["offer"])).toBe(true);
  });

  it("tests presence", () => {
    expect(check("exists", undefined, "opportunity.title")).toBe(true);
    expect(check("exists", undefined, "opportunity.missing")).toBe(false);
    expect(check("is_null", undefined, "opportunity.missing")).toBe(true);
  });

  it("reads contains as substring for text and membership for a list", () => {
    expect(check("contains", "engineer", "opportunity.title")).toBe(true);
    expect(check("contains", "designer", "opportunity.title")).toBe(false);
    expect(
      evaluateCondition(
        { field: "opportunity.tags", op: "contains", value: "remote" },
        { opportunity: { tags: ["remote", "senior"] } },
      ),
    ).toBe(true);
  });

  it("orders dates", () => {
    expect(check("gt", "2026-01-01T00:00:00Z", "opportunity.applied_at")).toBe(true);
    expect(check("lt", "2026-01-01T00:00:00Z", "opportunity.applied_at")).toBe(false);
  });

  it("orders numbers", () => {
    const entity = { task: { count: 5 } };
    expect(evaluateCondition({ field: "task.count", op: "gte", value: 5 }, entity)).toBe(true);
    expect(evaluateCondition({ field: "task.count", op: "gt", value: 5 }, entity)).toBe(false);
  });

  it("returns false rather than throwing on an unorderable comparison", () => {
    expect(check("gt", "not-a-date")).toBe(false);
    expect(check("gt", undefined, "opportunity.missing")).toBe(false);
  });

  it("returns false for an unknown operator", () => {
    expect(check("regex" as never, "x")).toBe(false);
  });
});

describe("conditionsMatch", () => {
  it("requires every condition to pass", () => {
    expect(
      conditionsMatch(
        [
          { field: "opportunity.stage", op: "eq", value: "interview" },
          { field: "opportunity.title", op: "contains", value: "staff" },
        ],
        envelope(OPP),
      ),
    ).toBe(true);

    expect(
      conditionsMatch(
        [
          { field: "opportunity.stage", op: "eq", value: "interview" },
          { field: "opportunity.title", op: "contains", value: "designer" },
        ],
        envelope(OPP),
      ),
    ).toBe(false);
  });

  it("treats an empty list as always", () => {
    expect(conditionsMatch([], envelope(OPP))).toBe(true);
  });
});

describe("cronMatches", () => {
  const at = (iso: string) => new Date(iso);

  it("matches a wildcard every minute", () => {
    expect(cronMatches("* * * * *", at("2026-08-02T13:37:00Z"))).toBe(true);
  });

  it("matches a specific time in UTC", () => {
    expect(cronMatches("0 9 * * *", at("2026-08-02T09:00:00Z"))).toBe(true);
    expect(cronMatches("0 9 * * *", at("2026-08-02T09:01:00Z"))).toBe(false);
    expect(cronMatches("0 9 * * *", at("2026-08-02T10:00:00Z"))).toBe(false);
  });

  it("matches steps", () => {
    expect(cronMatches("*/15 * * * *", at("2026-08-02T10:30:00Z"))).toBe(true);
    expect(cronMatches("*/15 * * * *", at("2026-08-02T10:31:00Z"))).toBe(false);
  });

  it("matches ranges and lists", () => {
    // 2026-08-03 is a Monday.
    expect(cronMatches("0 9 * * 1-5", at("2026-08-03T09:00:00Z"))).toBe(true);
    // 2026-08-02 is a Sunday.
    expect(cronMatches("0 9 * * 1-5", at("2026-08-02T09:00:00Z"))).toBe(false);
    expect(cronMatches("5,20 * * * *", at("2026-08-02T10:20:00Z"))).toBe(true);
  });

  it("ORs day-of-month with day-of-week when both are restricted", () => {
    // Cron's traditional semantics — what an operator copying an expression expects.
    expect(cronMatches("0 9 1 * 1", at("2026-08-01T09:00:00Z"))).toBe(true); // 1st, a Saturday
    expect(cronMatches("0 9 1 * 1", at("2026-08-03T09:00:00Z"))).toBe(true); // Monday, the 3rd
    expect(cronMatches("0 9 1 * 1", at("2026-08-04T09:00:00Z"))).toBe(false);
  });

  it("rejects a malformed expression rather than matching everything", () => {
    expect(cronMatches("0 9 * *", at("2026-08-02T09:00:00Z"))).toBe(false);
  });
});

describe("isScheduleDue", () => {
  it("fires for a minute that passed between scans", () => {
    // The scan runs every 5 minutes; a 09:00 rule must not be missed just
    // because no scan landed exactly inside that minute.
    const now = new Date("2026-08-02T09:04:00Z");
    const lastRun = new Date("2026-08-02T08:59:00Z");
    expect(isScheduleDue("0 9 * * *", now, lastRun)).toBe(true);
  });

  it("does not fire twice for the same minute", () => {
    const now = new Date("2026-08-02T09:04:00Z");
    const lastRun = new Date("2026-08-02T09:00:00Z");
    expect(isScheduleDue("0 9 * * *", now, lastRun)).toBe(false);
  });

  it("does not fire when no matching minute has passed", () => {
    const now = new Date("2026-08-02T08:30:00Z");
    const lastRun = new Date("2026-08-02T08:25:00Z");
    expect(isScheduleDue("0 9 * * *", now, lastRun)).toBe(false);
  });

  it("bounds the replay window after a long outage", () => {
    // A rule idle for a month replays at most a day, not a month of firings.
    const now = new Date("2026-08-02T09:00:00Z");
    const lastRun = new Date("2026-07-01T00:00:00Z");
    expect(isScheduleDue("0 9 * * *", now, lastRun, 60)).toBe(true);
    expect(isScheduleDue("0 3 * * *", now, lastRun, 60)).toBe(false);
  });

  it("considers only the current minute for a rule that has never run", () => {
    const now = new Date("2026-08-02T09:00:00Z");
    expect(isScheduleDue("0 9 * * *", now, null)).toBe(true);
    expect(isScheduleDue("0 10 * * *", now, null)).toBe(false);
  });
});
