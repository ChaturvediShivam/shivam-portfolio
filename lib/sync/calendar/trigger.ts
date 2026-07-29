import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";

/**
 * CalendarSyncTrigger (Phase 3 · M4, refinement 3).
 *
 * Abstracts what initiates a calendar sync. The current implementation is
 * cron-driven (self-scheduling job chain, single active per account). A future
 * webhook (Google push) implementation plugs into the SAME interface — no
 * webhook is implemented here, only the abstraction.
 */

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export interface CalendarSyncTrigger {
  /** Ensure a sync runs promptly (user-requested / initial), without piling up. */
  requestSync(client: SupabaseClient, accountId: string): Promise<void>;
  /** After a run, schedule the next cycle (cadence when caught up, else promptly). */
  scheduleFollowUp(client: SupabaseClient, accountId: string, caughtUp: boolean): Promise<void>;
}

async function activeJobs(client: SupabaseClient, accountId: string) {
  const { data } = await client
    .from("jobs")
    .select("id, status")
    .eq("type", "calendar_sync")
    .filter("payload->>accountId", "eq", accountId)
    .in("status", ["pending", "running"]);
  return data ?? [];
}

export class CronCalendarSyncTrigger implements CalendarSyncTrigger {
  async requestSync(client: SupabaseClient, accountId: string): Promise<void> {
    const active = await activeJobs(client, accountId);
    if (active.some((j) => j.status === "running")) return; // already syncing

    const pending = active.find((j) => j.status === "pending");
    if (pending) {
      await client.from("jobs").update({ run_after: new Date().toISOString() }).eq("id", pending.id);
      return;
    }
    await enqueueJob(client, { type: "calendar_sync", payload: { accountId } });
  }

  async scheduleFollowUp(client: SupabaseClient, accountId: string, caughtUp: boolean): Promise<void> {
    const { data: pending } = await client
      .from("jobs")
      .select("id")
      .eq("type", "calendar_sync")
      .filter("payload->>accountId", "eq", accountId)
      .eq("status", "pending")
      .limit(1);
    if (pending && pending.length > 0) return;

    await enqueueJob(client, {
      type: "calendar_sync",
      payload: { accountId },
      runAfter: new Date(Date.now() + (caughtUp ? SYNC_INTERVAL_MS : 0)),
    });
  }
}
