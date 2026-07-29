import type { CalendarEventDTO, CreateCalendarEventInput } from "@/types/calendar";

/**
 * CalendarProvider (Phase 3 · M4, refinement 1).
 *
 * The CalendarSyncEngine depends only on this interface — never on Google
 * directly. A future Microsoft/Apple provider implements the same contract.
 * Providers return internal DTOs (mapped internally), so raw provider payloads
 * never reach the engine or the database.
 */

export interface CalendarSyncCursor {
  syncToken: string | null;
}

export interface CalendarSyncPage {
  events: CalendarEventDTO[];
  /** The next syncToken when the change set was fully drained; null if more remains. */
  nextSyncToken: string | null;
  /** True when the prior token was invalid and a full re-sync was performed. */
  expired: boolean;
}

export interface CalendarProvider {
  /** Fetch changes (incremental when a syncToken is supplied), as internal DTOs. */
  listEvents(cursor: CalendarSyncCursor): Promise<CalendarSyncPage>;
  /** Create an event and return it as an internal DTO. */
  createEvent(input: CreateCalendarEventInput): Promise<CalendarEventDTO>;
}
