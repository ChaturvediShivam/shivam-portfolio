import { describe, it, expect } from "vitest";
import { canTransition, dueAt, isOverdue, missingForDelivery, planTransition } from "@/lib/vbyb/workflow";

/**
 * The validation workflow is PAID → SUBMITTED → IN PROGRESS → DELIVERED, with
 * REFUNDED reachable only through the refund flow. The rule that matters most:
 * nothing is DELIVERED without a decision, a decision date and a rationale.
 */

const base = {
  status: "in_progress" as const,
  submitted_at: "2026-09-10T10:00:00.000Z",
  started_at: "2026-09-10T12:00:00.000Z",
  decision: null,
  decided_at: null,
  decision_rationale: null,
};

const NOW = new Date("2026-09-11T09:00:00.000Z");

describe("canTransition", () => {
  it("allows the forward path and a reopen", () => {
    expect(canTransition("paid", "submitted")).toBe(true);
    expect(canTransition("submitted", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "delivered")).toBe(true);
    expect(canTransition("delivered", "in_progress")).toBe(true);
  });

  it("refuses skipping steps and any manual move into or out of refunded", () => {
    expect(canTransition("paid", "delivered")).toBe(false);
    expect(canTransition("submitted", "delivered")).toBe(false);
    expect(canTransition("in_progress", "refunded")).toBe(false);
    expect(canTransition("refunded", "in_progress")).toBe(false);
  });
});

describe("planTransition — delivery requirements", () => {
  it("refuses DELIVERED without a decision, date and rationale, naming what is missing", () => {
    const result = planTransition(base, "delivered", NOW);
    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain("decision");
    expect(error).toContain("decision date");
    expect(error).toContain("decision rationale");
  });

  it("refuses DELIVERED when only the rationale is blank", () => {
    const result = planTransition(
      { ...base, decision: "build", decided_at: NOW.toISOString(), decision_rationale: "   " },
      "delivered",
      NOW,
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("decision rationale");
  });

  it("allows DELIVERED with all three and stamps delivered_at", () => {
    const result = planTransition(
      { ...base, decision: "test_more", decided_at: NOW.toISOString(), decision_rationale: "Signal but no payment yet." },
      "delivered",
      NOW,
    );
    expect(result.ok).toBe(true);
    const ok = result as { patch: Record<string, unknown>; eventType: string };
    expect(ok.patch.status).toBe("delivered");
    expect(ok.patch.delivered_at).toBe(NOW.toISOString());
    expect(ok.eventType).toBe("VALIDATION_DELIVERED");
  });

  it("lists nothing missing once all delivery fields are present", () => {
    expect(missingForDelivery({ decision: "kill", decided_at: NOW.toISOString(), decision_rationale: "Falsified." })).toEqual([]);
  });
});

describe("planTransition — side effects", () => {
  it("stamps submitted_at when an admin marks a paid validation submitted", () => {
    const result = planTransition({ ...base, status: "paid", submitted_at: null, started_at: null }, "submitted", NOW);
    expect((result as { patch: Record<string, unknown> }).patch.submitted_at).toBe(NOW.toISOString());
  });

  it("records VALIDATION_STARTED and started_at when work begins", () => {
    const result = planTransition({ ...base, status: "submitted", started_at: null }, "in_progress", NOW);
    const ok = result as { patch: Record<string, unknown>; eventType: string };
    expect(ok.patch.started_at).toBe(NOW.toISOString());
    expect(ok.eventType).toBe("VALIDATION_STARTED");
  });

  it("clears delivered_at when a delivered validation is reopened", () => {
    const result = planTransition(
      { ...base, status: "delivered", decision: "park", decided_at: NOW.toISOString(), decision_rationale: "x" },
      "in_progress",
      NOW,
    );
    expect((result as { patch: Record<string, unknown> }).patch.delivered_at).toBeNull();
  });

  it("refuses setting REFUNDED from the status control", () => {
    const result = planTransition(base, "refunded", NOW);
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("refund");
  });
});

describe("overdue", () => {
  it("is due 48 hours after submission", () => {
    expect(dueAt("2026-09-10T10:00:00.000Z")?.toISOString()).toBe("2026-09-12T10:00:00.000Z");
  });

  it("flags submitted or in-progress work past the window only", () => {
    const late = new Date("2026-09-12T10:00:01.000Z");
    expect(isOverdue({ status: "in_progress", submitted_at: "2026-09-10T10:00:00.000Z" }, late)).toBe(true);
    expect(isOverdue({ status: "delivered", submitted_at: "2026-09-10T10:00:00.000Z" }, late)).toBe(false);
    expect(isOverdue({ status: "paid", submitted_at: null }, late)).toBe(false);
    expect(isOverdue({ status: "submitted", submitted_at: "2026-09-10T10:00:00.000Z" }, NOW)).toBe(false);
  });
});
