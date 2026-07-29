import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarProvider } from "@/lib/sync/calendar/provider";
import { upsertCalendarEventDTO } from "@/lib/calendar-events";

/**
 * CalendarSyncEngine (Phase 3 · M4).
 *
 * Depends only on the CalendarProvider interface — no Google specifics. Fetches
 * a bounded page of DTOs, upserts them idempotently, and advances the syncToken
 * only when the change set is fully drained (lossless: a large delta is drained
 * across runs; a 410 clears the token so the next run re-syncs from scratch).
 */

export interface CalendarSyncAccount {
  id: string;
  owner_id: string | null;
  calendar_sync_token: string | null;
}

export class CalendarSyncEngine {
  constructor(private readonly provider: CalendarProvider) {}

  async sync(
    client: SupabaseClient,
    account: CalendarSyncAccount,
  ): Promise<{ processed: number; caughtUp: boolean }> {
    const page = await this.provider.listEvents({ syncToken: account.calendar_sync_token });

    let processed = 0;
    for (const dto of page.events) {
      try {
        if (await upsertCalendarEventDTO(client, account, dto)) processed += 1;
      } catch (err) {
        // A single malformed event is skipped; the run still advances.
        console.error(`[calendar-sync] skipping event ${dto.externalEventId}:`, err);
      }
    }

    let newToken: string | null;
    if (page.nextSyncToken) newToken = page.nextSyncToken; // fully drained → advance
    else if (page.expired) newToken = null; // old token invalid → re-sync next run
    else newToken = account.calendar_sync_token ?? null; // capped mid-delta → keep old token

    const caughtUp = page.nextSyncToken !== null;

    const { error } = await client
      .from("integration_accounts")
      .update({ calendar_sync_token: newToken, calendar_synced_at: new Date().toISOString() })
      .eq("id", account.id);
    if (error) throw error;

    return { processed, caughtUp };
  }
}
