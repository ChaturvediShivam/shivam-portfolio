import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Schedule-scan lifecycle (Phase 3 · M10).
 *
 * These exist because of a bug found in review: the scan chain had no starter,
 * so every schedule-triggered rule would have silently never fired — precisely
 * the failure the DSL validation works to prevent at authoring time. The tests
 * pin both ends of the chain: something starts it, and something keeps it alive
 * after a failure.
 */

vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: vi.fn() }));

import { requestAutomationScan, scheduleAutomationFollowUp } from "@/lib/automation/trigger";
import { enqueueJob } from "@/lib/jobs/queue";

/** Supabase double returning a scripted set of existing scan jobs. */
function fakeClient(existing: { id: string; status: string }[] = [], failing = false) {
  const client = {
    from() {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      Object.assign(builder, {
        select: self,
        eq: self,
        in: () =>
          failing
            ? Promise.reject(new Error("db down"))
            : Promise.resolve({ data: existing, error: null }),
        limit: () =>
          failing
            ? Promise.reject(new Error("db down"))
            : Promise.resolve({ data: existing, error: null }),
      });
      return builder;
    },
  } as unknown as SupabaseClient;
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enqueueJob).mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestAutomationScan", () => {
  it("starts a chain when none exists", async () => {
    await requestAutomationScan(fakeClient([]));

    expect(enqueueJob).toHaveBeenCalledWith(expect.anything(), {
      type: "automation_scan",
      payload: {},
    });
  });

  it("does not start a second chain when one is already running", async () => {
    await requestAutomationScan(fakeClient([{ id: "j1", status: "running" }]));

    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("does not start a second chain when one is pending", async () => {
    await requestAutomationScan(fakeClient([{ id: "j1", status: "pending" }]));

    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("swallows a queue failure rather than failing the operator's action", async () => {
    // Arming a rule must not fail because the queue is unavailable.
    await expect(requestAutomationScan(fakeClient([], true))).resolves.toBeUndefined();
  });
});

describe("scheduleAutomationFollowUp", () => {
  it("queues the next tick with a delay", async () => {
    await scheduleAutomationFollowUp(fakeClient([]));

    const options = vi.mocked(enqueueJob).mock.calls[0][1];
    expect(options.type).toBe("automation_scan");
    expect(options.runAfter?.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not double-queue when a tick is already pending", async () => {
    await scheduleAutomationFollowUp(fakeClient([{ id: "j1", status: "pending" }]));

    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("swallows its own failure so the caller's finally still completes", async () => {
    await expect(scheduleAutomationFollowUp(fakeClient([], true))).resolves.toBeUndefined();
  });
});
