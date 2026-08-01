import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  approve,
  claimForSend,
  createApproval,
  dismiss,
  DuplicateApprovalError,
  markFailed,
  markSent,
  reject,
} from "@/lib/approvals";
import type { ApprovalStatus } from "@/types/approval";

/**
 * Approval state machine (Phase 3 · M9).
 *
 * These tests exist for one reason: the effect being gated is an email, and an
 * email cannot be un-sent. Every transition is conditional on the status the
 * caller believes it is moving from, and the tests assert the predicate travels
 * to the database — because a transition that forgot its predicate would look
 * identical in the happy path and only diverge under a race.
 */

interface Captured {
  table: string;
  patch?: Record<string, unknown>;
  eq: Record<string, unknown>;
  inFilter?: { column: string; values: unknown[] };
  insert?: Record<string, unknown>;
}

/**
 * Supabase double that records the filters a call actually applied and returns
 * whatever rows the test scripts.
 */
function fakeClient(options: { rows?: unknown[]; insertError?: { code?: string } } = {}) {
  const calls: Captured[] = [];

  const client = {
    from(table: string) {
      const captured: Captured = { table, eq: {} };
      calls.push(captured);

      const builder: Record<string, unknown> = {};
      const self = () => builder;

      Object.assign(builder, {
        insert(row: Record<string, unknown>) {
          captured.insert = row;
          return builder;
        },
        update(patch: Record<string, unknown>) {
          captured.patch = patch;
          return builder;
        },
        eq(column: string, value: unknown) {
          captured.eq[column] = value;
          return builder;
        },
        in(column: string, values: unknown[]) {
          captured.inFilter = { column, values };
          return builder;
        },
        is: self,
        order: self,
        range: self,
        maybeSingle: () => Promise.resolve({ data: options.rows?.[0] ?? null, error: null }),
        single: () =>
          Promise.resolve(
            options.insertError
              ? { data: null, error: options.insertError }
              : { data: options.rows?.[0] ?? null, error: null },
          ),
        select: (_columns?: string, _opts?: unknown) => {
          // `.select()` terminates an update chain but continues an insert chain;
          // returning a thenable builder satisfies both.
          return Object.assign(builder, {
            then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
              resolve({ data: (options.rows ?? []) as unknown[], error: null }),
          });
        },
      });

      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

function row(status: ApprovalStatus) {
  return { id: "a1", status, owner_id: "owner-1" };
}

describe("createApproval", () => {
  it("stores the proposal as pending with its idempotency key", async () => {
    const { client, calls } = fakeClient({ rows: [row("pending")] });

    await createApproval(client, {
      agent: "email_drafter",
      actionType: "email_reply",
      proposedPayload: { subject: "Re: hello" },
      idempotencyKey: "reply:msg-1",
      ownerId: "owner-1",
    });

    expect(calls[0].table).toBe("ai_approvals");
    expect(calls[0].insert).toMatchObject({
      status: "pending",
      idempotency_key: "reply:msg-1",
      owner_id: "owner-1",
      action_type: "email_reply",
    });
  });

  it("reports a unique violation as a duplicate rather than crashing", async () => {
    const { client } = fakeClient({ insertError: { code: "23505" } });

    await expect(
      createApproval(client, {
        agent: "email_drafter",
        actionType: "email_reply",
        proposedPayload: {},
        idempotencyKey: "reply:msg-1",
        ownerId: "owner-1",
      }),
    ).rejects.toBeInstanceOf(DuplicateApprovalError);
  });
});

describe("decision transitions", () => {
  it("approves only from pending or failed", async () => {
    const { client, calls } = fakeClient({ rows: [row("approved")] });

    const result = await approve(client, "a1", "owner-1", "user-1");

    expect(result?.status).toBe("approved");
    expect(calls[0].inFilter).toEqual({ column: "status", values: ["pending", "failed"] });
    expect(calls[0].eq).toMatchObject({ id: "a1", owner_id: "owner-1" });
    expect(calls[0].patch).toMatchObject({ status: "approved", decided_by: "user-1" });
  });

  it("rejects only from pending or failed", async () => {
    const { client, calls } = fakeClient({ rows: [row("rejected")] });

    await reject(client, "a1", "owner-1", "user-1");

    expect(calls[0].inFilter).toEqual({ column: "status", values: ["pending", "failed"] });
    expect(calls[0].patch).toMatchObject({ status: "rejected" });
  });

  it("returns null when the predicate matched nothing, so the caller knows it lost", async () => {
    const { client } = fakeClient({ rows: [] });

    expect(await approve(client, "a1", "owner-1", "user-1")).toBeNull();
  });
});

describe("claimForSend", () => {
  it("claims only an approved row, and only once", async () => {
    const { client, calls } = fakeClient({ rows: [row("sending")] });

    const claimed = await claimForSend(client, "a1", "owner-1");

    expect(claimed?.status).toBe("sending");
    // The whole idempotency guarantee lives in this predicate: a second caller
    // finds the row in `sending`, not `approved`, and gets nothing.
    expect(calls[0].inFilter).toEqual({ column: "status", values: ["approved"] });
    expect(calls[0].patch).toEqual({ status: "sending" });
  });

  it("yields null to the loser of a concurrent claim", async () => {
    const { client } = fakeClient({ rows: [] });

    expect(await claimForSend(client, "a1", "owner-1")).toBeNull();
  });

  it("cannot claim a row that already sent", async () => {
    // The DB predicate is what enforces this; the fake returns no rows because
    // `status in ('approved')` would not match a sent row.
    const { client } = fakeClient({ rows: [] });

    expect(await claimForSend(client, "a1", "owner-1")).toBeNull();
  });
});

describe("dismiss", () => {
  it("archives from any status, including a row stranded in sending", async () => {
    const { client, calls } = fakeClient({ rows: [row("sending")] });

    const result = await dismiss(client, "a1", "owner-1");

    expect(result).not.toBeNull();
    // Deliberately unconditional on status: it is the one operation that must
    // work on a row the state machine has no answer for.
    expect(calls[0].inFilter).toBeUndefined();
    expect(calls[0].patch).toHaveProperty("archived_at");
    expect(calls[0].eq).toMatchObject({ id: "a1", owner_id: "owner-1" });
  });

  it("returns null when the row was already set aside", async () => {
    const { client } = fakeClient({ rows: [] });

    expect(await dismiss(client, "a1", "owner-1")).toBeNull();
  });
});

describe("terminal transitions", () => {
  it("marks sent only from sending, recording the resulting message", async () => {
    const { client, calls } = fakeClient({ rows: [row("sent")] });

    await markSent(client, "a1", "owner-1", "msg-9");

    expect(calls[0].inFilter).toEqual({ column: "status", values: ["sending"] });
    expect(calls[0].patch).toMatchObject({ status: "sent", result_message_id: "msg-9" });
  });

  it("marks failed only from sending, and bounds the stored error", async () => {
    const { client, calls } = fakeClient({ rows: [row("failed")] });

    await markFailed(client, "a1", "owner-1", "x".repeat(900));

    expect(calls[0].inFilter).toEqual({ column: "status", values: ["sending"] });
    expect((calls[0].patch?.last_error as string).length).toBe(500);
  });
});
