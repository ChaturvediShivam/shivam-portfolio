import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";

/**
 * NotificationScanTrigger (Phase 3 · M5). Abstracts what initiates the scan.
 * Cron-driven + self-scheduling today (single active scan); a future
 * event-driven trigger plugs into the same interface. Global (not per-account).
 */

const SCAN_INTERVAL_MS = 5 * 60 * 1000;

export interface NotificationScanTrigger {
  requestScan(client: SupabaseClient): Promise<void>;
  scheduleFollowUp(client: SupabaseClient): Promise<void>;
}

async function activeScans(client: SupabaseClient) {
  const { data } = await client
    .from("jobs")
    .select("id, status")
    .eq("type", "notification_scan")
    .in("status", ["pending", "running"]);
  return data ?? [];
}

export class CronNotificationScanTrigger implements NotificationScanTrigger {
  async requestScan(client: SupabaseClient): Promise<void> {
    const active = await activeScans(client);
    if (active.some((j) => j.status === "running")) return;

    const pending = active.find((j) => j.status === "pending");
    if (pending) {
      await client.from("jobs").update({ run_after: new Date().toISOString() }).eq("id", pending.id);
      return;
    }
    await enqueueJob(client, { type: "notification_scan", payload: {} });
  }

  async scheduleFollowUp(client: SupabaseClient): Promise<void> {
    const { data: pending } = await client
      .from("jobs")
      .select("id")
      .eq("type", "notification_scan")
      .eq("status", "pending")
      .limit(1);
    if (pending && pending.length > 0) return;

    await enqueueJob(client, {
      type: "notification_scan",
      payload: {},
      runAfter: new Date(Date.now() + SCAN_INTERVAL_MS),
    });
  }
}
