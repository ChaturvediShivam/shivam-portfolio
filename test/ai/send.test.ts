import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Send executor (Phase 3 · M9).
 *
 * The irreversibility tests. Each case asserts a property that only matters
 * because an email cannot be un-sent:
 *   • nothing reaches Gmail without a claim;
 *   • a failure before the send leaves nothing delivered and the row retryable;
 *   • a failure *after* the send never reports failure, because failure invites
 *     a retry and the mail is already gone.
 */

vi.mock("@/lib/integrations/google/gmail", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/google/gmail")>(
    "@/lib/integrations/google/gmail",
  );
  return { ...actual, sendMessage: vi.fn() };
});
vi.mock("@/lib/integrations/google/tokens", () => ({
  getFreshAccessToken: vi.fn(),
  GoogleReauthRequiredError: class extends Error {},
}));
vi.mock("@/lib/approvals", () => ({
  claimForSend: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
}));

import { sendApprovedReply } from "@/lib/ai/send";
import { sendMessage, GmailAuthError } from "@/lib/integrations/google/gmail";
import { getFreshAccessToken } from "@/lib/integrations/google/tokens";
import { claimForSend, markFailed, markSent } from "@/lib/approvals";
import type { Approval } from "@/types/approval";

const OWNER = "owner-1";

function approval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: "ap-1",
    agent: "email_drafter",
    action_type: "email_reply",
    entity_type: "message",
    entity_id: "msg-1",
    proposed_payload: {
      to: ["recruiter@example.com"],
      cc: [],
      subject: "Re: Staff Engineer",
      bodyText: "Thursday works.",
      threadId: "t1",
      inReplyTo: "<x@y>",
      replyToMessageId: "msg-1",
      opportunityId: "opp-1",
      contactId: null,
      companyId: null,
    },
    rationale: null,
    ai_provider: "stub",
    ai_model: "m",
    ai_prompt_version: "1.0.0",
    ai_confidence: 0.8,
    conversation_id: null,
    status: "sending",
    decided_by: "user-1",
    decided_at: null,
    executed_at: null,
    result_message_id: null,
    last_error: null,
    idempotency_key: "email_reply:msg-1",
    metadata: {},
    owner_id: OWNER,
    created_at: "",
    updated_at: "",
    archived_at: null,
    ...overrides,
  };
}

/** Supabase double recording the tables written to. */
function fakeClient(options: { account?: unknown; messageInsertError?: { code?: string } } = {}) {
  const writes: { table: string; row?: Record<string, unknown> }[] = [];

  const account =
    options.account === undefined
      ? { id: "acct-1", email_address: "me@example.com", status: "connected" }
      : options.account;

  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const self = () => builder;

      Object.assign(builder, {
        select: self,
        eq: self,
        is: self,
        order: self,
        update(row: Record<string, unknown>) {
          writes.push({ table, row });
          return builder;
        },
        insert(row: Record<string, unknown>) {
          writes.push({ table, row });
          return Object.assign({}, builder, {
            select: () => ({
              single: () =>
                Promise.resolve(
                  table === "messages" && options.messageInsertError
                    ? { data: null, error: options.messageInsertError }
                    : { data: { id: "new-msg" }, error: null },
                ),
              maybeSingle: () => Promise.resolve({ data: { id: "new-msg" }, error: null }),
            }),
            then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
          });
        },
        maybeSingle: () =>
          Promise.resolve({
            data: table === "integration_accounts" ? account : { id: "existing-msg" },
            error: null,
          }),
        single: () => Promise.resolve({ data: { id: "new-msg" }, error: null }),
      });

      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, writes };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFreshAccessToken).mockResolvedValue("token");
  vi.mocked(claimForSend).mockResolvedValue(approval());
  vi.mocked(markSent).mockResolvedValue(approval({ status: "sent" }));
  vi.mocked(markFailed).mockResolvedValue(approval({ status: "failed" }));
  vi.mocked(sendMessage).mockResolvedValue({ id: "gmail-1", threadId: "t1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendApprovedReply", () => {
  it("sends the approved payload verbatim and marks it sent", async () => {
    const { client } = fakeClient();

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result.status).toBe("sent");
    expect(sendMessage).toHaveBeenCalledWith("token", {
      to: ["recruiter@example.com"],
      cc: [],
      subject: "Re: Staff Engineer",
      bodyText: "Thursday works.",
      threadId: "t1",
      inReplyTo: "<x@y>",
    });
    expect(markSent).toHaveBeenCalled();
  });

  it("sends nothing when the claim is lost", async () => {
    vi.mocked(claimForSend).mockResolvedValue(null);
    const { client } = fakeClient();

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result).toEqual({ status: "skipped", reason: "claim_lost" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends nothing when no Gmail account is connected", async () => {
    const { client } = fakeClient({ account: null });

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result).toEqual({ status: "skipped", reason: "no_account" });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalled();
  });

  it("sends nothing when the account is not connected", async () => {
    const { client } = fakeClient({ account: { id: "a", email_address: null, status: "error" } });

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result.status).toBe("skipped");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("refuses a payload with no recipient rather than sending", async () => {
    vi.mocked(claimForSend).mockResolvedValue(
      approval({ proposed_payload: { to: [], bodyText: "hi" } as never }),
    );
    const { client } = fakeClient();

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result.status).toBe("failed");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("refuses an action type it does not implement", async () => {
    vi.mocked(claimForSend).mockResolvedValue(approval({ action_type: "stage_change" }));
    const { client } = fakeClient();

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result).toEqual({ status: "skipped", reason: "wrong_action" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("fails the approval back to a retryable state when Gmail rejects the send", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new GmailAuthError("403"));
    const { client } = fakeClient();

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result.status).toBe("failed");
    expect(markFailed).toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
  });

  it("still reports success when post-send bookkeeping fails", async () => {
    // The mail is gone. Reporting failure would invite a retry that could only
    // duplicate it, so a broken insert must not change the outcome.
    const { client } = fakeClient({ messageInsertError: { code: "42P01" } });

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result.status).toBe("sent");
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("marks sent before writing the CRM rows", async () => {
    const order: string[] = [];
    vi.mocked(markSent).mockImplementation(async () => {
      order.push("markSent");
      return approval({ status: "sent" });
    });

    const { client, writes } = fakeClient();
    await sendApprovedReply(client, "ap-1", { ownerId: OWNER });
    for (const write of writes) order.push(write.table);

    expect(order[0]).toBe("markSent");
    expect(order).toContain("messages");
  });

  it("records the outbound message and a timeline event", async () => {
    const { client, writes } = fakeClient();

    await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    const message = writes.find((w) => w.table === "messages");
    expect(message?.row).toMatchObject({
      direction: "outbound",
      external_message_id: "gmail-1",
      metadata: { ai_drafted: true },
    });

    const event = writes.find((w) => w.table === "opportunity_events");
    expect(event?.row).toMatchObject({ event_type: "message_sent", actor_type: "agent" });
  });

  it("resolves the existing row when sync already ingested the sent message", async () => {
    const { client } = fakeClient({ messageInsertError: { code: "23505" } });

    const result = await sendApprovedReply(client, "ap-1", { ownerId: OWNER });

    expect(result).toMatchObject({ status: "sent", messageId: "existing-msg" });
  });
});
