import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { enqueueJob } from "@/lib/jobs/queue";
import { featureEnabled } from "@/lib/featureFlags";
import { isScheduleDue } from "@/lib/automation/conditions";
import { runScheduledRule } from "@/lib/automation/engine";
import { listEnabledScheduleRules, markScheduleRan } from "@/lib/automation/rules";

/**
 * `automation_scan` job handler (Phase 3 · M10).
 *
 * Drives schedule-triggered rules. Self-scheduling on the same pattern as M5's
 * `notification_scan`, because the drainer's cadence is coarser than a cron
 * minute and nothing else would wake a scheduled rule.
 *
 * `isScheduleDue` walks every minute since the rule last ran rather than testing
 * only "now": a rule set for 09:00 would otherwise be missed whenever no scan
 * landed inside that minute.
 *
 * Flag gate before the follow-up enqueue, exactly as in `notification_scan` —
 * the chain self-perpetuates, so returning early is what lets it drain itself
 * out within one cycle instead of running forever after a rollback.
 */

const SCAN_INTERVAL_MS = 5 * 60 * 1000;

async function scheduleFollowUp(client: Parameters<typeof enqueueJob>[0]): Promise<void> {
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
}

registerJobHandler("automation_scan", async (_payload, ctx) => {
  if (!featureEnabled("FEATURE_AUTOMATION")) return;

  const rules = await listEnabledScheduleRules(ctx.client);
  const now = new Date();

  for (const rule of rules) {
    const trigger = rule.trigger;
    if (trigger.type !== "schedule") continue;

    const lastRun = rule.last_scheduled_at ? new Date(rule.last_scheduled_at) : null;
    if (!isScheduleDue(trigger.schedule, now, lastRun)) continue;

    try {
      // Stamped before running: a rule whose actions fail must not re-run every
      // scan for the rest of the window.
      await markScheduleRan(ctx.client, rule.id, now);
      await runScheduledRule(ctx.client, rule);
    } catch (error) {
      console.error(`[automation-scan] rule ${rule.id} failed:`, error);
    }
  }

  await scheduleFollowUp(ctx.client);
});
