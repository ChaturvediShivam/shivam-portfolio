import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { featureEnabled } from "@/lib/featureFlags";
import { isScheduleDue } from "@/lib/automation/conditions";
import { runScheduledRule } from "@/lib/automation/engine";
import { listEnabledScheduleRules, markScheduleRan } from "@/lib/automation/rules";
import { scheduleAutomationFollowUp } from "@/lib/automation/trigger";

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
 * Flag gate before the follow-up, exactly as in `notification_scan` — the chain
 * self-perpetuates, so returning early is what lets it drain itself out within
 * one cycle instead of running forever after a rollback.
 */

registerJobHandler("automation_scan", async (_payload, ctx) => {
  if (!featureEnabled("FEATURE_AUTOMATION")) return;

  try {
    const rules = await listEnabledScheduleRules(ctx.client);
    const now = new Date();

    for (const rule of rules) {
      const trigger = rule.trigger;
      if (trigger.type !== "schedule") continue;

      const lastRun = rule.last_scheduled_at ? new Date(rule.last_scheduled_at) : null;
      if (!isScheduleDue(trigger.schedule, now, lastRun)) continue;

      try {
        // Stamped before running: a rule whose actions fail must not re-run on
        // every scan for the rest of the window.
        await markScheduleRan(ctx.client, rule.id, now);
        await runScheduledRule(ctx.client, rule);
      } catch (error) {
        console.error(`[automation-scan] rule ${rule.id} failed:`, error);
      }
    }
  } finally {
    // In `finally` on purpose. A chain that stopped on the first transient
    // error would leave every scheduled rule dead until someone noticed, and
    // nothing else in the system would restart it.
    await scheduleAutomationFollowUp(ctx.client);
  }
});
