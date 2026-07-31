import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { enqueueJob } from "@/lib/jobs/queue";
import { featureEnabled } from "@/lib/featureFlags";
import { createNotification, getNotifiableOwners } from "@/lib/notifications";
import { getNotificationSources } from "@/lib/notifications/sources";
import { CronNotificationScanTrigger } from "@/lib/notifications/trigger";

/**
 * `notification_scan` job handler (Phase 3 · M5).
 *
 * Runs each source per owner, creates deduped in-app notifications, and enqueues
 * one dispatch per newly-created notification. Idempotent (dedupe), owner-scoped,
 * bounded per source. Self-schedules the next cycle.
 *
 * Flag gate: returning here — BEFORE `scheduleFollowUp` — is what makes the flag
 * a real kill switch. The scan self-perpetuates, so without this an in-flight
 * chain would keep running (and keep emailing) after the flag was turned off,
 * and the documented "rollback = flip the flag" would not hold. Returning early
 * lets the chain drain itself out within one cycle.
 */
registerJobHandler("notification_scan", async (_payload, ctx) => {
  if (!featureEnabled("FEATURE_NOTIFICATIONS")) return;

  const owners = await getNotifiableOwners(ctx.client);
  const sources = getNotificationSources();

  for (const ownerId of owners) {
    for (const source of sources) {
      let inputs;
      try {
        inputs = await source.detect(ctx.client, ownerId);
      } catch (err) {
        console.error(`[notification-scan] source ${source.name} failed for owner ${ownerId}:`, err);
        continue;
      }
      for (const input of inputs) {
        const { id, created } = await createNotification(ctx.client, input);
        if (created && id) {
          await enqueueJob(ctx.client, { type: "notification_dispatch", payload: { notificationId: id } });
        }
      }
    }
  }

  await new CronNotificationScanTrigger().scheduleFollowUp(ctx.client);
});
