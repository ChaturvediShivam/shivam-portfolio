import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";

/**
 * Schedule-scan lifecycle (Phase 3 · M10).
 *
 * Mirrors `lib/notifications/trigger.ts` (M5): the scan is a self-perpetuating
 * chain, so something has to start it and something has to keep it alive.
 *
 * Event-triggered rules need none of this — each mutation enqueues its own job.
 * Only schedule triggers depend on a running chain, which is why arming a
 * schedule rule is what starts one.
 */

const SCAN_INTERVAL_MS = 5 * 60 * 1000;

async function pendingOrRunning(client: SupabaseClient) {
  const { data } = await client
    .from("jobs")
    .select("id, status")
    .eq("type", "automation_scan")
    .in("status", ["pending", "running"]);
  return data ?? [];
}

/**
 * Ensure a scan chain exists.
 *
 * Idempotent, and safe to call whenever a schedule rule is armed. Without a
 * starter the chain never begins and every scheduled rule silently never fires —
 * the exact failure the DSL validation works to prevent at authoring time, so it
 * would be perverse to allow it at runtime.
 */
export async function requestAutomationScan(client: SupabaseClient): Promise<void> {
  try {
    const active = await pendingOrRunning(client);
    if (active.length > 0) return;
    await enqueueJob(client, { type: "automation_scan", payload: {} });
  } catch (error) {
    // Arming a rule must not fail because the queue is unavailable.
    console.error("[automation/trigger] could not start the scan chain:", error);
  }
}

/**
 * Queue the next tick.
 *
 * Called from the handler's `finally`, so a scan that threw still schedules its
 * successor. A chain that stopped on the first transient error would leave every
 * scheduled rule dead until someone noticed.
 */
export async function scheduleAutomationFollowUp(client: SupabaseClient): Promise<void> {
  try {
    const { data: pending } = await client
      .from("jobs")
      .select("id")
      .eq("type", "automation_scan")
      .eq("status", "pending")
      .limit(1);
    if (pending && pending.length > 0) return;

    await enqueueJob(client, {
      type: "automation_scan",
      payload: {},
      runAfter: new Date(Date.now() + SCAN_INTERVAL_MS),
    });
  } catch (error) {
    console.error("[automation/trigger] could not schedule the next scan:", error);
  }
}
