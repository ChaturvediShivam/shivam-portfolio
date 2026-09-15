import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { createSupabaseStub } from "@/test/stubs/supabase";
import { ingestTallySubmission, normalizeLabel, parseTallySubmission, verifyTallySignature } from "@/lib/vbyb/tally";
import { decideMatch } from "@/lib/vbyb/matching";

/**
 * Tally submissions: signature verification, field mapping from the live form's
 * question labels, and the matching precedence ref → single email → unmatched.
 */

const SECRET = "tally-signing-secret";
const REF = "a".repeat(64);

const PAYLOAD = {
  eventId: "evt-1",
  eventType: "FORM_RESPONSE",
  createdAt: "2026-09-14T10:00:00.000Z",
  data: {
    responseId: "resp-1",
    submissionId: "sub-1",
    respondentId: "respondent-1",
    formId: "lbxOAv",
    formName: "Validate Before You Build — Idea Submission",
    createdAt: "2026-09-14T10:00:00.000Z",
    fields: [
      { key: "q1", label: "Name", type: "INPUT_TEXT", value: "Ada Lovelace" },
      { key: "q2", label: "Email", type: "INPUT_EMAIL", value: " Ada@Example.com " },
      { key: "q3", label: "What are you building?", type: "TEXTAREA", value: "A scheduling tool for clinics" },
      { key: "q4", label: "Who is it for?", type: "TEXTAREA", value: "Independent physiotherapists" },
      { key: "q5", label: "What problem does it solve?", type: "TEXTAREA", value: "No-shows" },
      { key: "q6", label: "What have you already built or done?", type: "TEXTAREA", value: "A prototype" },
      { key: "q7", label: "What evidence do you already have that people want this?", type: "TEXTAREA", value: "Three waitlist signups" },
      { key: "q8", label: "Where did that evidence come from?", type: "TEXTAREA", value: "A LinkedIn post" },
      { key: "q9", label: "What are you planning to do next?", type: "TEXTAREA", value: "Build billing" },
      { key: "q10", label: "What would make you stop building this idea?", type: "TEXTAREA", value: "Nobody pays" },
      { key: "q11", label: "What are people using instead today ?", type: "TEXTAREA", value: "Paper diaries" },
      { key: "q12", label: "Anything else we should know?", type: "TEXTAREA", value: "" },
      { key: "q13", label: "ref", type: "HIDDEN_FIELDS", value: REF },
      { key: "q14", label: "How did you hear about us?", type: "INPUT_TEXT", value: "A newsletter" },
    ],
  },
};

const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("base64");

describe("verifyTallySignature", () => {
  it("accepts a signature over the raw body", () => {
    const body = JSON.stringify(PAYLOAD);
    expect(verifyTallySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("accepts Tally's documented JSON.stringify(payload) signature when the raw body is formatted differently", () => {
    const pretty = JSON.stringify(PAYLOAD, null, 2);
    expect(verifyTallySignature(pretty, sign(JSON.stringify(PAYLOAD)), SECRET)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and a missing header", () => {
    const body = JSON.stringify(PAYLOAD);
    const tampered = body.replace("Ada Lovelace", "Mallory");
    expect(verifyTallySignature(tampered, sign(body), SECRET)).toBe(false);
    expect(verifyTallySignature(body, sign(body, "other-secret"), SECRET)).toBe(false);
    expect(verifyTallySignature(body, null, SECRET)).toBe(false);
    expect(verifyTallySignature("not json", sign("different"), SECRET)).toBe(false);
  });
});

describe("parseTallySubmission", () => {
  it("maps every question of the live form by label and keeps the hidden ref", () => {
    const s = parseTallySubmission(PAYLOAD)!;
    expect(s.submissionId).toBe("sub-1");
    expect(s.email).toBe("ada@example.com");
    expect(s.name).toBe("Ada Lovelace");
    expect(s.ref).toBe(REF);
    expect(s.fields).toMatchObject({
      idea_what: "A scheduling tool for clinics",
      idea_who: "Independent physiotherapists",
      idea_problem: "No-shows",
      idea_done: "A prototype",
      idea_evidence: "Three waitlist signups",
      idea_evidence_source: "A LinkedIn post",
      idea_next: "Build billing",
      idea_stop: "Nobody pays",
      idea_alternatives: "Paper diaries",
    });
    expect(s.fields.idea_context).toBeUndefined();
  });

  it("keeps questions it does not recognise instead of dropping them", () => {
    expect(parseTallySubmission(PAYLOAD)!.unmapped).toEqual([
      { label: "How did you hear about us?", type: "INPUT_TEXT", value: "A newsletter" },
    ]);
  });

  it("normalizes label punctuation, case and apostrophes", () => {
    expect(normalizeLabel("  What are people using instead TODAY ?  ")).toBe("what are people using instead today");
    expect(normalizeLabel("Who’s it for:")).toBe("who's it for");
  });

  it("rejects payloads without fields or a submission id", () => {
    expect(parseTallySubmission({ eventId: "e", eventType: "FORM_RESPONSE", data: {} })).toBeNull();
    expect(parseTallySubmission({ eventId: "e", eventType: "FORM_RESPONSE", data: { fields: [] } })).toBeNull();
  });
});

describe("decideMatch", () => {
  it("prefers the private ref over email", () => {
    expect(
      decideMatch({ refProvided: true, emailProvided: true, refOrder: { id: "o-ref" }, emailCandidates: [{ id: "o-email" }] }),
    ).toEqual({ kind: "ref", orderId: "o-ref" });
  });

  it("matches by email only when exactly one order is waiting", () => {
    expect(decideMatch({ refProvided: false, emailProvided: true, refOrder: null, emailCandidates: [{ id: "o1" }] })).toEqual({
      kind: "email",
      orderId: "o1",
    });
    expect(
      decideMatch({ refProvided: false, emailProvided: true, refOrder: null, emailCandidates: [{ id: "o1" }, { id: "o2" }] }),
    ).toEqual({ kind: "unmatched", reason: "ambiguous_email" });
  });

  it("leaves an unknown ref or an unknown email unmatched", () => {
    expect(decideMatch({ refProvided: true, emailProvided: true, refOrder: null, emailCandidates: [] })).toEqual({
      kind: "unmatched",
      reason: "ref_not_found",
    });
    expect(decideMatch({ refProvided: false, emailProvided: true, refOrder: null, emailCandidates: [] })).toEqual({
      kind: "unmatched",
      reason: "no_candidate",
    });
  });
});

describe("ingestTallySubmission", () => {
  const parsed = () => parseTallySubmission(PAYLOAD)!;

  it("does nothing further for a duplicate submission", async () => {
    const stub = createSupabaseStub({ rpc: { vbyb_store_submission: [{ submission_id: "s-1", created: false }] } });
    const outcome = await ingestTallySubmission(stub.client, parsed(), PAYLOAD);
    expect(outcome).toEqual({ kind: "duplicate", submissionId: "s-1" });
    expect(stub.rpcCalls.map((c) => c.name)).toEqual(["vbyb_store_submission"]);
    expect(stub.operations).toEqual([]);
  });

  it("stores the raw payload and links by ref", async () => {
    const stub = createSupabaseStub({
      rpc: { vbyb_store_submission: [{ submission_id: "s-1", created: true }], vbyb_link_submission: "linked" },
      select: { vbyb_orders: { id: "order-ref" } },
    });
    const outcome = await ingestTallySubmission(stub.client, parsed(), PAYLOAD);

    expect(outcome).toEqual({ kind: "matched", submissionId: "s-1", orderId: "order-ref", matchedBy: "ref" });
    const store = stub.rpcCalls[0];
    expect(store.args.p_raw_payload).toBe(PAYLOAD);
    expect(store.args.p_ref).toBe(REF);
    expect(stub.hasFilter(stub.opsFor("vbyb_orders")[0], "eq", "submission_ref", REF)).toBe(true);
    expect(stub.opsFor("vbyb_customers")).toEqual([]);
    expect(stub.rpcCalls[1]).toMatchObject({ name: "vbyb_link_submission", args: { p_order_id: "order-ref", p_matched_by: "ref" } });
  });

  it("keeps an ambiguous email submission unmatched and logs why", async () => {
    const withoutRef = { ...parsed(), ref: null };
    const stub = createSupabaseStub({
      rpc: { vbyb_store_submission: [{ submission_id: "s-2", created: true }] },
      select: { vbyb_customers: { id: "customer-1" }, vbyb_validations: [{ order_id: "o1" }, { order_id: "o2" }] },
    });
    const outcome = await ingestTallySubmission(stub.client, withoutRef, PAYLOAD);

    expect(outcome).toEqual({ kind: "unmatched", submissionId: "s-2", reason: "ambiguous_email" });
    expect(stub.rpcCalls.some((c) => c.name === "vbyb_link_submission")).toBe(false);
    const event = stub.opsFor("vbyb_events").find((op) => op.type === "insert")!;
    expect(event.values).toMatchObject({ event_type: "SUBMISSION_UNMATCHED", metadata: { reason: "ambiguous_email" } });
  });

  it("stores a submission that arrives before its order as unmatched", async () => {
    const stub = createSupabaseStub({
      rpc: { vbyb_store_submission: [{ submission_id: "s-3", created: true }] },
      select: { vbyb_orders: null, vbyb_customers: null },
    });
    const outcome = await ingestTallySubmission(stub.client, parsed(), PAYLOAD);
    expect(outcome).toMatchObject({ kind: "unmatched", reason: "ref_not_found" });
  });
});
