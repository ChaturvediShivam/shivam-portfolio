import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { scheduleNextGmailSync, syncGmailAccount } from "@/lib/sync/gmail-sync";

/**
 * `gmail_sync` job handler (Phase 3 · M3).
 *
 * Idempotent: message upserts dedupe on (integration_account_id,
 * external_message_id). On success it schedules the next cycle (continuous
 * sync). On failure it throws, so the runner backs off + retries the same job
 * (the cursor is not advanced) and eventually dead-letters — no new chain is
 * scheduled for a broken account until it is re-triggered.
 */
registerJobHandler("gmail_sync", async (payload, ctx) => {
  const accountId = typeof payload.accountId === "string" ? payload.accountId : null;
  if (!accountId) throw new Error("gmail_sync: missing accountId in payload");

  const { caughtUp } = await syncGmailAccount(ctx.client, accountId);
  // Caught up → normal cadence; otherwise continue draining the delta promptly.
  if (caughtUp) await scheduleNextGmailSync(ctx.client, accountId);
  else await scheduleNextGmailSync(ctx.client, accountId, 0);
});
