import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Event emission (Phase 3 · M10).
 *
 * The contract this file defends: emission is best-effort, the mutation is not.
 * A data layer that has already written its row calls `emitAutomationEvent`
 * last, and nothing that happens inside it may propagate back out — moving a
 * stage must not fail because a rule about moving stages is misconfigured, or
 * because the automation migration has not been applied yet.
 */

vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: vi.fn() }));

import { emitAutomationEvent } from "@/lib/automation/emit";
import { enqueueJob } from "@/lib/jobs/queue";

const client = {} as SupabaseClient;

const INPUT = {
  type: "opportunity.stage_changed" as const,
  ownerId: "owner-1",
  entityType: "opportunity",
  entityId: "opp-1",
  entity: { opportunity: { id: "opp-1", stage: "interview" } },
  discriminator: "applied->interview",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enqueueJob).mockResolvedValue(null);
  process.env.FEATURE_AUTOMATION = "true";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.FEATURE_AUTOMATION;
});

describe("emitAutomationEvent", () => {
  it("enqueues an automation_run job carrying the envelope", async () => {
    await emitAutomationEvent(client, INPUT);

    const options = vi.mocked(enqueueJob).mock.calls[0][1];
    expect(options.type).toBe("automation_run");
    expect(options.ownerId).toBe("owner-1");

    const envelope = (options.payload as { envelope: Record<string, unknown> }).envelope;
    expect(envelope).toMatchObject({
      type: "opportunity.stage_changed",
      ownerId: "owner-1",
      entityId: "opp-1",
    });
  });

  it("derives an idempotency key that distinguishes repeat events on one record", async () => {
    await emitAutomationEvent(client, INPUT);
    await emitAutomationEvent(client, { ...INPUT, discriminator: "interview->offer" });

    const first = vi.mocked(enqueueJob).mock.calls[0][1].idempotencyKey;
    const second = vi.mocked(enqueueJob).mock.calls[1][1].idempotencyKey;

    expect(first).not.toBe(second);
    // A second stage change on the same opportunity is a different event and
    // must not be deduped away.
    expect(first).toContain("applied->interview");
  });

  it("produces the same key for a repeated identical emission", async () => {
    await emitAutomationEvent(client, INPUT);
    await emitAutomationEvent(client, INPUT);

    expect(vi.mocked(enqueueJob).mock.calls[0][1].idempotencyKey).toBe(
      vi.mocked(enqueueJob).mock.calls[1][1].idempotencyKey,
    );
  });

  it("queues nothing while the flag is off, so a rollback leaves no backlog", async () => {
    delete process.env.FEATURE_AUTOMATION;

    await emitAutomationEvent(client, INPUT);

    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("queues nothing for an owner-less row", async () => {
    await emitAutomationEvent(client, { ...INPUT, ownerId: null });

    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("swallows a queue failure rather than failing the caller's mutation", async () => {
    vi.mocked(enqueueJob).mockRejectedValue(new Error("relation \"jobs\" does not exist"));

    // The mutation already succeeded. This must not throw.
    await expect(emitAutomationEvent(client, INPUT)).resolves.toBeUndefined();
  });
});
