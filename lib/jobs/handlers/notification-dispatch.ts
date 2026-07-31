import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { featureEnabled } from "@/lib/featureFlags";
import { dispatchNotification, type OwnerLookup } from "@/lib/notifications/dispatcher";

/**
 * `notification_dispatch` job handler (Phase 3 · M5).
 *
 * Delivers one notification's email (owner-only), idempotently. Owner email is
 * resolved via the service-role admin API (jobs have no session). A transient
 * send failure throws → runner backoff/retry/dead-letter.
 *
 * Flag gate: no email may leave the system while the feature is off, including
 * for dispatch jobs already queued when the flag was flipped.
 */
registerJobHandler("notification_dispatch", async (payload, ctx) => {
  if (!featureEnabled("FEATURE_NOTIFICATIONS")) return;

  const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : null;
  if (!notificationId) throw new Error("notification_dispatch: missing notificationId in payload");

  const ownerLookup: OwnerLookup = {
    async getEmail(ownerId: string) {
      const { data, error } = await ctx.client.auth.admin.getUserById(ownerId);
      if (error) throw error;
      return data.user?.email ?? null;
    },
  };

  await dispatchNotification(ctx.client, notificationId, ownerLookup);
});
