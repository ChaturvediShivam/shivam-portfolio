/**
 * Calendar domain types (Phase 3 · M4).
 *
 * The internal Calendar Event DTO is the ONLY event shape the sync engine, data
 * layer, and database see. Provider (Google) payloads are converted to this DTO
 * by a mapper and never reach the database directly.
 */

export type CalendarEventStatus = "confirmed" | "cancelled";

export interface CalendarAttendee {
  email: string | null;
  displayName: string | null;
  responseStatus: string | null;
}

/** Provider-agnostic normalized calendar event. */
export interface CalendarEventDTO {
  externalEventId: string;
  calendarId: string | null;
  title: string | null;
  description: string | null;
  startsAt: string | null; // ISO 8601 (UTC)
  endsAt: string | null; // ISO 8601 (UTC)
  allDay: boolean;
  location: string | null;
  attendees: CalendarAttendee[];
  status: CalendarEventStatus;
  externalIds: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/** Input for creating an interview event from an opportunity. */
export interface CreateCalendarEventInput {
  title: string;
  description?: string | null;
  startsAt: string; // ISO 8601
  endsAt: string; // ISO 8601
  location?: string | null;
  attendees?: string[]; // emails
  opportunityId?: string | null;
}

/** Read shape for the agenda UI (DB row + optional opportunity join). */
export interface CalendarEvent {
  id: string;
  integration_account_id: string | null;
  opportunity_id: string | null;
  external_event_id: string | null;
  calendar_id: string | null;
  title: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  attendees: CalendarAttendee[];
  owner_id: string | null;
  created_at: string;
  archived_at: string | null;
  opportunity?: { id: string; title: string } | null;
}
