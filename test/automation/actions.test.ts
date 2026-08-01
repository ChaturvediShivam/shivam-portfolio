import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Automation action executors (Phase 3 · M10).
 *
 * The assertion that matters most in this file is negative: `change_stage` and
 * `draft_email` must NOT call the data layer that performs them. An automation
 * may propose an irreversible or externally-visible action; only a human may
 * confirm it (ADR-006). If these tests ever pass while `changeStage` is called,
 * the approval gate has been bypassed.
 */

vi.mock("@/lib/tasks", () => ({ createTask: vi.fn() }));
vi.mock("@/lib/opportunities", () => ({ addNote: vi.fn(), changeStage: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/approvals", () => ({
  createApproval: vi.fn(),
  DuplicateApprovalError: class DuplicateApprovalError extends Error {},
}));

import { executeAction, type ActionContext } from "@/lib/automation/actions";
import { createTask } from "@/lib/tasks";
import { addNote, changeStage } from "@/lib/opportunities";
import { createNotification } from "@/lib/notifications";
import { createApproval, DuplicateApprovalError } from "@/lib/approvals";
import type { AutomationEventEnvelope } from "@/types/automation";

const OWNER = "owner-1";
const client = {} as SupabaseClient;

function envelope(entity: Record<string, unknown>): AutomationEventEnvelope {
  return {
    type: "opportunity.stage_changed",
    ownerId: OWNER,
    entityType: "opportunity",
    entityId: "opp-1",
    entity,
    idempotencyKey: "evt-1",
    occurredAt: "2026-08-02T00:00:00Z",
  };
}

function ctx(entity: Record<string, unknown> = { opportunity: { id: "opp-1" } }): ActionContext {
  return {
    client,
    ownerId: OWNER,
    envelope: envelope(entity),
    triggerType: "event",
    ruleId: "rule-1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNotification).mockResolvedValue({ id: "n1", created: true });
  vi.mocked(createApproval).mockResolvedValue({ id: "ap-1" } as never);
});

describe("direct actions", () => {
  it("creates a task through the same data layer the UI uses", async () => {
    const result = await executeAction(
      { action: "create_task", title: "Prep", due_in_days: 2, priority: "high" },
      ctx(),
    );

    expect(result).toMatchObject({ action: "create_task", status: "executed" });
    const [, ownerId, input, assignee] = vi.mocked(createTask).mock.calls[0];
    expect(ownerId).toBe(OWNER);
    expect(input).toMatchObject({ title: "Prep", priority: "high", opportunity_id: "opp-1" });
    expect(assignee).toBeNull();
    expect(input.due_at).toBeTruthy();
  });

  it("falls back to a safe priority when the stored one is unknown", async () => {
    await executeAction({ action: "create_task", title: "x", priority: "critical" } as never, ctx());

    expect(vi.mocked(createTask).mock.calls[0][2]).toMatchObject({ priority: "medium" });
  });

  it("adds a note to the triggering opportunity", async () => {
    const result = await executeAction({ action: "add_note", body: "Automated note" }, ctx());

    expect(result.status).toBe("executed");
    expect(addNote).toHaveBeenCalledWith(client, "opp-1", "Automated note", OWNER);
  });

  it("skips a note when nothing supplies an opportunity", async () => {
    const result = await executeAction({ action: "add_note", body: "x" }, ctx({ message: { id: "m1" } }));

    expect(result).toMatchObject({ status: "skipped" });
    expect(addNote).not.toHaveBeenCalled();
  });

  it("resolves the opportunity from a linked task", async () => {
    await executeAction({ action: "add_note", body: "x" }, ctx({ task: { id: "t1", opportunity_id: "opp-9" } }));

    expect(addNote).toHaveBeenCalledWith(client, "opp-9", "x", OWNER);
  });

  it("prefers an explicit opportunity_id over the triggering entity", async () => {
    await executeAction({ action: "add_note", body: "x", opportunity_id: "opp-explicit" }, ctx());

    expect(addNote).toHaveBeenCalledWith(client, "opp-explicit", "x", OWNER);
  });

  it("dedupes a notification on the triggering event", async () => {
    await executeAction({ action: "send_notification", type: "t", title: "Hi" }, ctx());

    expect(vi.mocked(createNotification).mock.calls[0][1].dedupeKey).toBe("automation:rule-1:evt-1");
  });

  it("reports a deduped notification as skipped rather than executed", async () => {
    vi.mocked(createNotification).mockResolvedValue({ id: null, created: false });

    const result = await executeAction({ action: "send_notification", type: "t", title: "Hi" }, ctx());

    expect(result.status).toBe("skipped");
  });
});

describe("approval-gated actions", () => {
  it("proposes a stage change and never performs one", async () => {
    const result = await executeAction({ action: "change_stage", to: "offer" }, ctx());

    expect(result).toMatchObject({ action: "change_stage", status: "queued_for_approval" });
    // The gate. If this ever fails, an automation can rewrite the pipeline.
    expect(changeStage).not.toHaveBeenCalled();
    expect(createApproval).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        agent: "automation",
        actionType: "change_stage",
        proposedPayload: { opportunityId: "opp-1", to: "offer" },
      }),
    );
  });

  it("proposes an email draft rather than sending or drafting one", async () => {
    const result = await executeAction(
      { action: "draft_email", instruction: "Thank them" },
      ctx({ message: { id: "msg-1" } }),
    );

    expect(result.status).toBe("queued_for_approval");
    expect(vi.mocked(createApproval).mock.calls[0][1]).toMatchObject({
      actionType: "draft_email_request",
      entityId: "msg-1",
    });
  });

  it("skips an email proposal when there is no message to reply to", async () => {
    const result = await executeAction({ action: "draft_email" }, ctx());

    expect(result.status).toBe("skipped");
    expect(createApproval).not.toHaveBeenCalled();
  });

  it("keys proposals so a redelivered run cannot create a second", async () => {
    await executeAction({ action: "change_stage", to: "offer" }, ctx());

    expect(vi.mocked(createApproval).mock.calls[0][1].idempotencyKey).toBe(
      "automation:change_stage:rule-1:evt-1",
    );
  });

  it("reports an existing proposal as skipped rather than failing the run", async () => {
    vi.mocked(createApproval).mockRejectedValue(new DuplicateApprovalError("k"));

    const result = await executeAction({ action: "change_stage", to: "offer" }, ctx());

    expect(result).toMatchObject({ status: "skipped", detail: "Already proposed." });
  });

  it("skips a stage change when nothing supplies an opportunity", async () => {
    const result = await executeAction({ action: "change_stage", to: "offer" }, ctx({ message: { id: "m" } }));

    expect(result.status).toBe("skipped");
    expect(createApproval).not.toHaveBeenCalled();
  });
});
