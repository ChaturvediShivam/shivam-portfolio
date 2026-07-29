import "server-only";
import {
  CalendarSyncTokenExpiredError,
  insertEvent,
  listEventsPage,
} from "@/lib/integrations/google/calendar";
import { GoogleCalendarEventMapper } from "@/lib/sync/calendar/mapper";
import type {
  CalendarProvider,
  CalendarSyncCursor,
  CalendarSyncPage,
} from "@/lib/sync/calendar/provider";
import type { CalendarEventDTO, CreateCalendarEventInput } from "@/types/calendar";

/**
 * GoogleCalendarProvider (Phase 3 · M4).
 *
 * Implements CalendarProvider over the Google Calendar adapter + mapper. Handles
 * Google-specific pagination and the syncToken-expiry (410) full re-sync — all
 * behind the interface, so the engine stays provider-agnostic.
 */

const CALENDAR_ID = "primary";
const MAX_PAGES = 10; // bound per-run work

export class GoogleCalendarProvider implements CalendarProvider {
  private readonly mapper = new GoogleCalendarEventMapper();

  constructor(private readonly accessToken: string) {}

  async listEvents(cursor: CalendarSyncCursor): Promise<CalendarSyncPage> {
    try {
      return await this.drain(cursor.syncToken ?? undefined, false);
    } catch (err) {
      if (err instanceof CalendarSyncTokenExpiredError) {
        // Prior token invalid → full re-sync from scratch (idempotent upserts).
        return this.drain(undefined, true);
      }
      throw err;
    }
  }

  private async drain(syncToken: string | undefined, expired: boolean): Promise<CalendarSyncPage> {
    const events: CalendarEventDTO[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    let pages = 0;

    do {
      const res = await listEventsPage(this.accessToken, { calendarId: CALENDAR_ID, syncToken, pageToken });
      for (const item of res.items ?? []) events.push(this.mapper.toEventDTO(item, CALENDAR_ID));
      pageToken = res.nextPageToken;
      if (res.nextSyncToken) nextSyncToken = res.nextSyncToken;
      pages += 1;
    } while (pageToken && pages < MAX_PAGES);

    // Stopped by the page cap (more remains) → no authoritative token to advance.
    if (pageToken) nextSyncToken = null;
    return { events, nextSyncToken, expired };
  }

  async createEvent(input: CreateCalendarEventInput): Promise<CalendarEventDTO> {
    const created = await insertEvent(this.accessToken, CALENDAR_ID, this.mapper.toGoogleInsert(input));
    return this.mapper.toEventDTO(created, CALENDAR_ID);
  }
}
