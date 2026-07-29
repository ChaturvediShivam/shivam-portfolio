import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { getGoogleOAuthConfig } from "@/lib/integrations/google/oauth";
import { getFreshAccessToken } from "@/lib/integrations/google/tokens";
import { GoogleCalendarProvider } from "@/lib/sync/calendar/google-provider";
import { CalendarSyncEngine } from "@/lib/sync/calendar/engine";
import { CronCalendarSyncTrigger } from "@/lib/sync/calendar/trigger";
import { loadCalendarSyncAccount } from "@/lib/calendar-events";

/**
 * `calendar_sync` job handler (Phase 3 · M4).
 *
 * Wires the Google provider + sync engine + cron trigger. Idempotent (events
 * dedupe on (integration_account_id, external_event_id)); the syncToken advances
 * only on a fully drained run. On success schedules the next cycle.
 */
registerJobHandler("calendar_sync", async (payload, ctx) => {
  const accountId = typeof payload.accountId === "string" ? payload.accountId : null;
  if (!accountId) throw new Error("calendar_sync: missing accountId in payload");

  const account = await loadCalendarSyncAccount(ctx.client, accountId);
  if (!account) return;

  const config = getGoogleOAuthConfig();
  if (!config) throw new Error("Google OAuth is not configured.");

  const accessToken = await getFreshAccessToken(ctx.client, account, config);
  const engine = new CalendarSyncEngine(new GoogleCalendarProvider(accessToken));
  const { caughtUp } = await engine.sync(ctx.client, account);

  await new CronCalendarSyncTrigger().scheduleFollowUp(ctx.client, accountId, caughtUp);
});
