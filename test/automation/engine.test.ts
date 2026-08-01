import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rule engine (Phase 3 · M10).
 *
 * The safety tests. A rule engine's failure modes are not "the wrong text
 * appeared" but "it ran forever", "it ran twice", and "it did something
 * irreversible without asking" — so those three are what this file asserts.
 */

vi.mock("@/lib/automation/rules", () => ({
  listEnabledRulesForEvent: vi.fn(),
  countRecentRuns: vi.fn(),
  recordRun: vi.fn(),
  DuplicateRunError: class DuplicateRunError extends Error {},
}));
vi.mock("@/lib/automation/actions", () => ({ executeAction: vi.fn() }));

import { dispatchEvent, dryRun, evaluateRule, runIdempotencyKey } from "@/lib/automation/engine";
import {
  countRecentRuns,
  DuplicateRunError,
  listEnabledRulesForEvent,
  recordRun,
} from "@/lib/automation/rules";
import { executeAction } from "@/lib/automation/actions";
import type { AutomationEventEnvelope, AutomationRule } from "@/types/automation";

const OWNER = "owner-1";

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: "rule-1",
    name: "Interview prep",
    description: null,
    trigger: { type: "event", event: "opportunity.stage_changed" },
    conditions: [{ field: "opportunity.stage", op: "eq", value: "interview" }],
    actions: [{ action: "create_task", title: "Prep" }],
    enabled: true,
    last_scheduled_at: null,
    metadata: {},
    owner_id: OWNER,
    created_at: "",
    updated_at: "",
    archived_at: null,
    ...overrides,
  };
}

function envelope(stage = "interview"): AutomationEventEnvelope {
  return {
    type: "opportunity.stage_changed",
    ownerId: OWNER,
    entityType: "opportunity",
    entityId: "opp-1",
    entity: { opportunity: { id: "opp-1", stage } },
    idempotencyKey: "opportunity.stage_changed:opp-1:applied->interview",
    occurredAt: "2026-08-02T00:00:00Z",
  };
}

/** Records the update issued when the engine finalises a run. */
function fakeClient() {
  const updates: Record<string, unknown>[] = [];
  const client = {
    from() {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      Object.assign(builder, {
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          return builder;
        },
        eq: self,
        select: self,
        then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
      });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(countRecentRuns).mockResolvedValue(0);
  vi.mocked(recordRun).mockResolvedValue({ id: "run-1" } as never);
  vi.mocked(executeAction).mockResolvedValue({ action: "create_task", status: "executed" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("evaluateRule — conditions", () => {
  it("executes actions when the conditions match", async () => {
    const { client, updates } = fakeClient();

    const result = await evaluateRule(client, rule(), envelope("interview"));

    expect(result.status).toBe("matched");
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(updates[0]).toMatchObject({ status: "matched" });
  });

  it("executes nothing when the conditions do not match", async () => {
    const { client } = fakeClient();

    const result = await evaluateRule(client, rule(), envelope("applied"));

    expect(result).toMatchObject({ status: "skipped", reason: "conditions" });
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("records the non-match, so a rule that never fires is diagnosable", async () => {
    const { client } = fakeClient();

    await evaluateRule(client, rule(), envelope("applied"));

    expect(recordRun).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ status: "skipped", reason: "Conditions did not match." }),
    );
  });

  it("does not consume the loop budget for a non-match", async () => {
    // A rule seeing many non-matching events must not throttle itself out of
    // ever firing.
    const { client } = fakeClient();

    await evaluateRule(client, rule(), envelope("applied"));

    expect(countRecentRuns).not.toHaveBeenCalled();
  });
});

describe("evaluateRule — loop safety", () => {
  it("refuses to execute once the per-entity cap is reached", async () => {
    vi.mocked(countRecentRuns).mockResolvedValue(5);
    const { client } = fakeClient();

    const result = await evaluateRule(client, rule(), envelope());

    expect(result).toMatchObject({ status: "skipped", reason: "loop_guard" });
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("still executes just below the cap", async () => {
    vi.mocked(countRecentRuns).mockResolvedValue(4);
    const { client } = fakeClient();

    const result = await evaluateRule(client, rule(), envelope());

    expect(result.status).toBe("matched");
  });

  it("claims the run as `running`, not as a `skipped` row that lies", async () => {
    const { client } = fakeClient();

    await evaluateRule(client, rule(), envelope());

    // A process that dies mid-execution leaves this row behind. Recording it as
    // `skipped` would tell the operator nothing happened when actions may have.
    expect(recordRun).toHaveBeenCalledWith(client, expect.objectContaining({ status: "running" }));
  });

  it("claims the run before executing, so a redelivered job cannot run twice", async () => {
    vi.mocked(recordRun).mockRejectedValueOnce(new DuplicateRunError());
    const { client } = fakeClient();

    const result = await evaluateRule(client, rule(), envelope());

    // At-least-once delivery is what the queue guarantees; the unique index on
    // (rule, event) is what turns that into exactly-once execution.
    expect(result).toMatchObject({ status: "skipped", reason: "already_run" });
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("derives a stable key from the rule and the event", () => {
    const key = runIdempotencyKey("rule-1", envelope());
    expect(key).toBe("rule-1:opportunity.stage_changed:opp-1:applied->interview");
    expect(runIdempotencyKey("rule-1", envelope())).toBe(key);
  });
});

describe("evaluateRule — action failures", () => {
  it("records a partial run when one of several actions fails", async () => {
    vi.mocked(executeAction)
      .mockResolvedValueOnce({ action: "create_task", status: "executed" })
      .mockRejectedValueOnce(new Error("boom"));

    const { client, updates } = fakeClient();
    const twoActions = rule({
      actions: [
        { action: "create_task", title: "a" },
        { action: "add_note", body: "b" },
      ],
    });

    const result = await evaluateRule(client, twoActions, envelope());

    // One failing action must not discard the one that already succeeded.
    expect(result.status).toBe("partial");
    expect(updates[0].action_results).toHaveLength(2);
  });

  it("records a failed run when every action fails", async () => {
    vi.mocked(executeAction).mockRejectedValue(new Error("boom"));
    const { client } = fakeClient();

    const result = await evaluateRule(client, rule(), envelope());

    expect(result.status).toBe("failed");
  });
});

describe("dispatchEvent", () => {
  it("evaluates every rule listening for the event", async () => {
    vi.mocked(listEnabledRulesForEvent).mockResolvedValue([rule(), rule({ id: "rule-2" })]);
    const { client } = fakeClient();

    const summaries = await dispatchEvent(client, envelope());

    expect(summaries).toHaveLength(2);
  });

  it("scopes the dispatch query to the event's owner", async () => {
    vi.mocked(listEnabledRulesForEvent).mockResolvedValue([]);
    const { client } = fakeClient();

    await dispatchEvent(client, envelope());

    expect(listEnabledRulesForEvent).toHaveBeenCalledWith(client, OWNER, "opportunity.stage_changed");
  });

  it("keeps evaluating after one rule throws", async () => {
    vi.mocked(listEnabledRulesForEvent).mockResolvedValue([rule(), rule({ id: "rule-2" })]);
    vi.mocked(countRecentRuns).mockRejectedValueOnce(new Error("db down"));
    const { client } = fakeClient();

    const summaries = await dispatchEvent(client, envelope());

    expect(summaries[0].status).toBe("failed");
    expect(summaries[1].status).toBe("matched");
  });

  it("bounds fan-out for a single event", async () => {
    vi.mocked(listEnabledRulesForEvent).mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => rule({ id: `rule-${i}` })),
    );
    const { client } = fakeClient();

    const summaries = await dispatchEvent(client, envelope());

    expect(summaries).toHaveLength(25);
  });
});

describe("dryRun", () => {
  it("reports what would happen without executing anything", () => {
    const result = dryRun(rule(), envelope("interview"));

    expect(result).toEqual({ matched: true, wouldRun: ["create_task"] });
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("reports a non-match with nothing to run", () => {
    expect(dryRun(rule(), envelope("applied"))).toEqual({ matched: false, wouldRun: [] });
  });
});
