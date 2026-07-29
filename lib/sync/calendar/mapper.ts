import "server-only";
import type {
  GoogleEvent,
  GoogleEventDateTime,
  GoogleEventInsert,
} from "@/lib/integrations/google/calendar";
import type { CalendarEventDTO, CreateCalendarEventInput } from "@/types/calendar";

/**
 * CalendarEventMapper (Phase 3 · M4, refinement 2).
 *
 * The single boundary between provider (Google) payloads and the internal
 * Calendar Event DTO. Pure and provider-specific: Google resources are mapped
 * here and never handed to the engine/database directly. A future provider gets
 * its own mapper implementing the same DTO contract.
 */

/** Normalize a Google start/end to a UTC ISO string (all-day → date at 00:00Z). */
export function normalizeDateTime(dt: GoogleEventDateTime | undefined): string | null {
  if (!dt) return null;
  if (dt.dateTime) {
    const d = new Date(dt.dateTime);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (dt.date) {
    const d = new Date(`${dt.date}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export class GoogleCalendarEventMapper {
  /** Google event → internal DTO. */
  toEventDTO(event: GoogleEvent, calendarId: string): CalendarEventDTO {
    const allDay = Boolean(event.start?.date && !event.start?.dateTime);
    return {
      externalEventId: event.id,
      calendarId,
      title: event.summary ?? null,
      description: event.description ?? null,
      startsAt: normalizeDateTime(event.start),
      endsAt: normalizeDateTime(event.end),
      allDay,
      location: event.location ?? null,
      attendees: (event.attendees ?? []).map((a) => ({
        email: a.email ? a.email.toLowerCase() : null,
        displayName: a.displayName ?? null,
        responseStatus: a.responseStatus ?? null,
      })),
      status: event.status === "cancelled" ? "cancelled" : "confirmed",
      externalIds: event.iCalUID ? { ical_uid: event.iCalUID } : {},
      metadata: {
        timeZone: event.start?.timeZone ?? null,
        recurringEventId: event.recurringEventId ?? null,
        htmlLink: event.htmlLink ?? null,
      },
    };
  }

  /** Internal create-input → Google insert resource. */
  toGoogleInsert(input: CreateCalendarEventInput): GoogleEventInsert {
    const attendees = (input.attendees ?? []).filter(Boolean).map((email) => ({ email }));
    return {
      summary: input.title,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      start: { dateTime: input.startsAt },
      end: { dateTime: input.endsAt },
      attendees: attendees.length > 0 ? attendees : undefined,
    };
  }
}
