import { describe, it, expect } from "vitest";
import { createSupabaseStub, type StubOperation } from "@/test/stubs/supabase";
import { updateOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/types/opportunity";

/**
 * Guards the payload `updateOpportunity` sends to Supabase.
 *
 * `updateOpportunity` writes the mapped object wholesale, so every key it emits
 * overwrites its column. The opportunity form submits only the fields it
 * renders, and Career Intelligence added eight columns it does not render —
 * deadline_at, priority, resume_score, ats_score, offer_at, rejected_at and the
 * two version links. Before the fix, renaming a title nulled all eight.
 *
 * These assert on the payload rather than on a database round-trip because the
 * payload IS the defect: a key present with `null` is indistinguishable, at the
 * wire, from a deliberate clear.
 */

const PHASE_1_COLUMNS = [
  "deadline_at",
  "priority",
  "resume_score",
  "ats_score",
  "offer_at",
  "rejected_at",
  "resume_version_id",
  "cover_letter_version_id",
] as const;

/** What OpportunityForm builds on edit: its 15 rendered fields, nothing more. */
function formPayload(overrides: Partial<Record<string, unknown>> = {}): OpportunityInput {
  return {
    title: "Senior Engineer",
    stage: undefined,
    company_id: "co-1",
    primary_contact_id: "ct-1",
    source: "linkedin",
    job_url: "https://example.com/job",
    location: "Bengaluru",
    location_type: "hybrid",
    employment_type: "full_time",
    seniority: "senior",
    work_authorization: "",
    application_method: "portal",
    salary_min: "3000000",
    salary_max: "4500000",
    salary_currency: "INR",
    applied_at: "2026-08-01",
    next_action_at: "2026-08-15",
    ...overrides,
  } as unknown as OpportunityInput;
}

async function capture(input: OpportunityInput): Promise<StubOperation> {
  const stub = createSupabaseStub({ update: { opportunities: [{ id: "opp-1" }] } });
  await updateOpportunity(stub.client, "opp-1", input);
  const op = stub.opsFor("opportunities").find((o) => o.type === "update");
  if (!op) throw new Error("no update issued");
  return op;
}

describe("updateOpportunity payload", () => {
  it("omits columns the caller did not supply, so a title-only edit preserves them", async () => {
    const op = await capture(formPayload({ title: "Senior Engineer (renamed)" }));

    expect(op.values!.title).toBe("Senior Engineer (renamed)");
    for (const column of PHASE_1_COLUMNS) {
      expect(
        Object.prototype.hasOwnProperty.call(op.values!, column),
        `"${column}" must be absent from the payload — present, even as null, overwrites the stored value`,
      ).toBe(false);
    }
  });

  it("still writes NULL when a field is explicitly cleared", async () => {
    // null (a cleared picker) and "" (a cleared text input) both mean "clear it"
    // and must reach the database, unlike undefined.
    const op = await capture(
      formPayload({ deadline_at: null, priority: "", resume_version_id: null, ats_score: "" }),
    );

    expect(op.values).toHaveProperty("deadline_at", null);
    expect(op.values).toHaveProperty("priority", null);
    expect(op.values).toHaveProperty("resume_version_id", null);
    expect(op.values).toHaveProperty("ats_score", null);
  });

  it("maps supplied values unchanged, and still targets a single row", async () => {
    const op = await capture(
      formPayload({ deadline_at: "2026-09-01", priority: "high", resume_score: "87.5", ats_score: "92.25" }),
    );

    // Pre-existing behaviour, unaltered by the fix.
    expect(op.values!.salary_min).toBe(3000000);
    expect(op.values!.salary_currency).toBe("INR");
    expect(op.values!.work_authorization).toBeNull(); // "" still clears
    // Phase 1 columns map through when supplied.
    expect(op.values!.deadline_at).toBe("2026-09-01");
    expect(op.values!.priority).toBe("high");
    expect(op.values!.resume_score).toBe(87.5);
    expect(op.values!.ats_score).toBe(92.25);
    // Scores are CHECK-bounded 0-100 in Postgres; the clamp keeps a bad client
    // value from becoming a 500.
    const clamped = await capture(formPayload({ resume_score: "150", ats_score: "-20" }));
    expect(clamped.values!.resume_score).toBe(100);
    expect(clamped.values!.ats_score).toBe(0);

    expect(op.filters).toContainEqual({ op: "eq", column: "id", value: "opp-1" });
  });
});
