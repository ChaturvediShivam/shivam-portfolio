import { describe, it, expect } from "vitest";
import { buildAssumptionRow, buildEvidenceRow, buildSectionPatch } from "@/lib/vbyb/validations";
import { buildLaunchPatch } from "@/lib/vbyb/launch";

/**
 * Input rules for the Validation File workspace. The evidence rules carry the
 * product's core principle: AI output is not evidence, and evidence without a
 * source or a stated strength is UNKNOWN, not implied.
 */

const EVIDENCE = {
  evidence_text: "Five of eight interviewees described the problem unprompted.",
  source: "Customer interviews, week 1",
  source_url: "",
  evidence_date: "2026-09-10",
  strength: "",
  origin: "customer_submission",
  provided_by_customer: true,
  assumption_id: "",
  notes: "",
};

describe("buildEvidenceRow", () => {
  it("defaults strength to unknown rather than implying support", () => {
    const { row, fieldErrors } = buildEvidenceRow(EVIDENCE);
    expect(fieldErrors).toEqual({});
    expect(row.strength).toBe("unknown");
  });

  it("refuses an AI origin", () => {
    for (const origin of ["ai", "ai_generated", "llm", ""]) {
      const { fieldErrors } = buildEvidenceRow({ ...EVIDENCE, origin });
      expect(fieldErrors.origin, origin).toContain("AI output cannot be recorded as evidence");
    }
  });

  it("requires a source", () => {
    expect(buildEvidenceRow({ ...EVIDENCE, source: "  " }).fieldErrors.source).toBeDefined();
  });

  it("rejects non-http URLs, bad dates and unknown strengths", () => {
    const { fieldErrors } = buildEvidenceRow({
      ...EVIDENCE,
      source_url: "javascript:alert(1)",
      evidence_date: "2026-02-30",
      strength: "certain",
    });
    expect(fieldErrors.source_url).toBeDefined();
    expect(fieldErrors.evidence_date).toBeDefined();
    expect(fieldErrors.strength).toBeDefined();
  });
});

describe("buildAssumptionRow", () => {
  const input = {
    assumption: "Builders will pay before seeing a finished product.",
    why_it_matters: "Revenue depends on it.",
    confidence: "",
    risk_level: "critical",
    falsifier: "No purchases after 30 qualified conversations.",
    test_required: "Offer the founding version.",
    status: "",
  };

  it("accepts a critical assumption and defaults status to untested", () => {
    const { row, fieldErrors } = buildAssumptionRow(input);
    expect(fieldErrors).toEqual({});
    expect(row.risk_level).toBe("critical");
    expect(row.status).toBe("untested");
    expect(row.confidence).toBeNull();
  });

  it("requires the assumption text and a risk level", () => {
    const { fieldErrors } = buildAssumptionRow({ ...input, assumption: "", risk_level: "extreme" });
    expect(fieldErrors.assumption).toBeDefined();
    expect(fieldErrors.risk_level).toBeDefined();
  });
});

describe("buildSectionPatch", () => {
  it("maps the decision date to a timestamp and validates the decision enum", () => {
    const { patch, fieldErrors } = buildSectionPatch("decision", {
      decision: "test_more",
      decided_on: "2026-09-12",
      decision_rationale: "Problem is real; willingness to pay is unproven.",
      decision_confidence: "medium",
    });
    expect(fieldErrors).toEqual({});
    expect(patch).toMatchObject({
      decision: "test_more",
      decided_at: "2026-09-12T12:00:00.000Z",
      decision_confidence: "medium",
    });
  });

  it("rejects decisions outside BUILD / TEST MORE / PARK / KILL", () => {
    expect(buildSectionPatch("decision", { decision: "pivot" }).fieldErrors.decision).toBeDefined();
  });

  it("only writes whitelisted columns for a section", () => {
    const { patch } = buildSectionPatch("idea", { idea_what: " A tool ", status: "delivered", decision: "build" });
    expect(patch).toEqual({ idea_what: "A tool" });
  });

  it("turns blank text into null and validates the test deadline", () => {
    const { patch, fieldErrors } = buildSectionPatch("test", { falsifier: "   ", test_deadline: "not-a-date" });
    expect(patch.falsifier).toBeNull();
    expect(fieldErrors.test_deadline).toBeDefined();
  });
});

describe("buildLaunchPatch", () => {
  const input = {
    name: "Validate Before You Build — Founding Version",
    price: "39.00",
    currency: "usd",
    capacity: "10",
    criteria_min_preorders: "",
    criteria_strong_preorders: "8",
    expected: "Some strangers pay.",
    started_on: "",
    ended_on: "",
  };

  it("parses price, capacity and internal criteria", () => {
    const { patch, fieldErrors } = buildLaunchPatch(input);
    expect(fieldErrors).toEqual({});
    expect(patch).toMatchObject({
      price_cents: 3900,
      currency: "USD",
      capacity: 10,
      criteria_min_preorders: null,
      criteria_strong_preorders: 8,
      started_at: null,
    });
  });

  it("rejects a zero or fractional capacity", () => {
    expect(buildLaunchPatch({ ...input, capacity: "0" }).fieldErrors.capacity).toBeDefined();
    expect(buildLaunchPatch({ ...input, capacity: "2.5" }).fieldErrors.capacity).toBeDefined();
  });
});
