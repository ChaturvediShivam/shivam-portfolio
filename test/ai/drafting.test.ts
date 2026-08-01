import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Draft generation (Phase 3 · M9).
 *
 * The load-bearing assertion in this file is that recipients never come from
 * model output. Everything else a draft contains is words the operator will
 * read before approving; who the words are addressed to is decided here, from
 * the synced message, so nothing written inside a received email can redirect
 * the reply that answers it.
 */

vi.mock("@/lib/approvals", () => ({
  createApproval: vi.fn(),
  DuplicateApprovalError: class DuplicateApprovalError extends Error {},
}));

import { draftReply, replyIdempotencyKey } from "@/lib/ai/drafting";
import { createApproval, DuplicateApprovalError } from "@/lib/approvals";
import type { AiGateway } from "@/lib/ai/gateway";

const OWNER = "owner-1";

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    owner_id: OWNER,
    direction: "inbound",
    archived_at: null,
    subject: "Staff Engineer role",
    from_name: "Rec Ruiter",
    from_address: "Recruiter@Example.com",
    to_addresses: ["me@myself.com"],
    cc_addresses: ["hiring@example.com", "me@myself.com"],
    body_text: "Are you free Thursday?",
    snippet: null,
    thread_id: "t1",
    metadata: { headers: { "Message-ID": "<abc@example.com>" } },
    opportunity_id: "opp-1",
    contact_id: "c-1",
    company_id: "co-1",
    opportunity: { title: "Staff Engineer", company: { name: "Acme" } },
    ...overrides,
  };
}

function fakeClient(row: unknown) {
  return {
    from() {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      Object.assign(builder, {
        select: self,
        eq: self,
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
      });
      return builder;
    },
  } as unknown as SupabaseClient;
}

function gateway(output: Record<string, unknown> | undefined, stopReason = "completed") {
  return {
    complete: vi.fn().mockResolvedValue({
      stopReason,
      text: "",
      parsed: output,
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
      model: "m",
      provider: "stub",
      latencyMs: 1,
    }),
  } as unknown as AiGateway;
}

const GOOD_OUTPUT = {
  subject: "Re: Staff Engineer role",
  body: "Thursday works for me.",
  rationale: "They asked about availability.",
  confidence: 0.9,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createApproval).mockImplementation(async (_c, input) => ({ id: "ap-1", ...input }) as never);
  process.env.FEATURE_AI = "true";
});

describe("draftReply", () => {
  it("derives recipients from the message, never from the model", async () => {
    const gw = gateway({
      ...GOOD_OUTPUT,
      // Model output that tries to name its own recipients is simply not read.
      to: ["attacker@evil.com"],
      cc: ["attacker@evil.com"],
    });

    await draftReply(fakeClient(message()), gw, "msg-1", {
      ownerId: OWNER,
      instruction: "Say Thursday works",
      operatorName: "Shivam",
    });

    const payload = vi.mocked(createApproval).mock.calls[0][1].proposedPayload as Record<string, unknown>;
    expect(payload.to).toEqual(["recruiter@example.com"]);
    expect(payload.cc).toEqual(["hiring@example.com"]);
    expect(JSON.stringify(payload)).not.toContain("attacker@evil.com");
  });

  it("drops the operator's own address from Cc so a reply cannot loop back", async () => {
    await draftReply(fakeClient(message()), gateway(GOOD_OUTPUT), "msg-1", {
      ownerId: OWNER,
      instruction: "reply",
      operatorName: "Shivam",
    });

    const payload = vi.mocked(createApproval).mock.calls[0][1].proposedPayload as Record<string, unknown>;
    expect(payload.cc).not.toContain("me@myself.com");
  });

  it("carries threading and linkage into the frozen payload", async () => {
    await draftReply(fakeClient(message()), gateway(GOOD_OUTPUT), "msg-1", {
      ownerId: OWNER,
      instruction: "reply",
      operatorName: "Shivam",
    });

    const call = vi.mocked(createApproval).mock.calls[0][1];
    expect(call.proposedPayload).toMatchObject({
      threadId: "t1",
      inReplyTo: "<abc@example.com>",
      replyToMessageId: "msg-1",
      opportunityId: "opp-1",
    });
    expect(call.idempotencyKey).toBe(replyIdempotencyKey("msg-1"));
    expect(call.actionType).toBe("email_reply");
  });

  it("creates the proposal as pending — drafting never sends", async () => {
    const result = await draftReply(fakeClient(message()), gateway(GOOD_OUTPUT), "msg-1", {
      ownerId: OWNER,
      instruction: "reply",
      operatorName: "Shivam",
    });

    expect(result.status).toBe("drafted");
    // The only write is the approval; nothing in this module touches Gmail.
    expect(createApproval).toHaveBeenCalledTimes(1);
  });

  it("skips an outbound message", async () => {
    const result = await draftReply(
      fakeClient(message({ direction: "outbound" })),
      gateway(GOOD_OUTPUT),
      "msg-1",
      { ownerId: OWNER, instruction: "reply", operatorName: "S" },
    );

    expect(result).toEqual({ status: "skipped", reason: "outbound" });
    expect(createApproval).not.toHaveBeenCalled();
  });

  it("skips an archived message", async () => {
    const result = await draftReply(
      fakeClient(message({ archived_at: "2026-01-01" })),
      gateway(GOOD_OUTPUT),
      "msg-1",
      { ownerId: OWNER, instruction: "reply", operatorName: "S" },
    );

    expect(result).toEqual({ status: "skipped", reason: "archived" });
  });

  it("skips a message with no sender to reply to", async () => {
    const result = await draftReply(
      fakeClient(message({ from_address: null })),
      gateway(GOOD_OUTPUT),
      "msg-1",
      { ownerId: OWNER, instruction: "reply", operatorName: "S" },
    );

    expect(result).toEqual({ status: "skipped", reason: "no_recipient" });
  });

  it("skips a message that is not found", async () => {
    const result = await draftReply(fakeClient(null), gateway(GOOD_OUTPUT), "msg-1", {
      ownerId: OWNER,
      instruction: "reply",
      operatorName: "S",
    });

    expect(result).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("skips a refusal rather than proposing an empty reply", async () => {
    const result = await draftReply(
      fakeClient(message()),
      gateway(undefined, "refused"),
      "msg-1",
      { ownerId: OWNER, instruction: "reply", operatorName: "S" },
    );

    expect(result).toEqual({ status: "skipped", reason: "refused" });
    expect(createApproval).not.toHaveBeenCalled();
  });

  it("skips output with an empty body", async () => {
    const result = await draftReply(
      fakeClient(message()),
      gateway({ ...GOOD_OUTPUT, body: "   " }),
      "msg-1",
      { ownerId: OWNER, instruction: "reply", operatorName: "S" },
    );

    expect(result).toEqual({ status: "skipped", reason: "empty_output" });
  });

  it("reports an existing open proposal instead of creating a second", async () => {
    vi.mocked(createApproval).mockRejectedValue(new DuplicateApprovalError("k"));

    const result = await draftReply(fakeClient(message()), gateway(GOOD_OUTPUT), "msg-1", {
      ownerId: OWNER,
      instruction: "reply",
      operatorName: "S",
    });

    expect(result).toEqual({ status: "skipped", reason: "already_drafted" });
  });

  it("falls back to a deterministic subject when the model omits one", async () => {
    await draftReply(
      fakeClient(message()),
      gateway({ ...GOOD_OUTPUT, subject: "  " }),
      "msg-1",
      { ownerId: OWNER, instruction: "reply", operatorName: "S" },
    );

    const payload = vi.mocked(createApproval).mock.calls[0][1].proposedPayload as Record<string, unknown>;
    expect(payload.subject).toBe("Re: Staff Engineer role");
  });

  it("bounds the instruction and the drafted body", async () => {
    const gw = gateway({ ...GOOD_OUTPUT, body: "x".repeat(20_000) });

    await draftReply(fakeClient(message()), gw, "msg-1", {
      ownerId: OWNER,
      instruction: "y".repeat(5_000),
      operatorName: "S",
    });

    const complete = vi.mocked((gw as unknown as { complete: ReturnType<typeof vi.fn> }).complete);
    const variables = complete.mock.calls[0][0].variables as Record<string, string>;
    expect(variables.instruction.length).toBe(1_000);

    const payload = vi.mocked(createApproval).mock.calls[0][1].proposedPayload as Record<string, unknown>;
    expect((payload.bodyText as string).length).toBe(8_000);
  });
});
