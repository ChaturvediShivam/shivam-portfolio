import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { featureEnabled } from "@/lib/featureFlags";
import { scheduleNextGmailSync, syncGmailAccount } from "@/lib/sync/gmail-sync";

/**
 * `gmail_sync` job handler (Phase 3 · M3).
 *
 * Idempotent: message upserts dedupe on (integration_account_id,
 * external_message_id). On success it schedules the next cycle (continuous
 * sync). On failure it throws, so the runner backs off + retries the same job
 * (the cursor is not advanced) and eventually dead-letters — no new chain is
 * scheduled for a broken account until it is re-triggered.
 *
 * Two conditions terminate the chain instead of rescheduling, because this job
 * re-enqueues itself and would otherwise run forever:
 *   1. the feature flag is off — so flipping it is a real kill switch;
 *   2. the account is gone, archived or disconnected — so a dead account does
 *      not leave a no-op job cycling indefinitely.
 * Both return BEFORE scheduleNextGmailSync; an in-flight chain drains itself
 * out within one cycle.
 */
registerJobHandler("gmail_sync", async (payload, ctx) => {
  if (!featureEnabled("FEATURE_GMAIL_SYNC")) return;

  const accountId = typeof payload.accountId === "string" ? payload.accountId : null;
  if (!accountId) throw new Error("gmail_sync: missing accountId in payload");

  const { caughtUp, active } = await syncGmailAccount(ctx.client, accountId);
  if (!active) return;

  // Caught up → normal cadence; otherwise continue draining the delta promptly.
  if (caughtUp) await scheduleNextGmailSync(ctx.client, accountId);
  else await scheduleNextGmailSync(ctx.client, accountId, 0);
});
