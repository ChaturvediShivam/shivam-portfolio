import "server-only";

/**
 * Google Calendar REST adapter (Phase 3 · M4).
 *
 * Low-level, server-side wrapper over the Calendar API. Returns RAW Google
 * resources — these are converted to the internal DTO by the mapper and never
 * reach the database directly. Errors are typed so the sync engine can retry
 * (auth/rate/transient) or fall back (sync-token expired → 410).
 */

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export class CalendarAuthError extends Error {}
export class CalendarSyncTokenExpiredError extends Error {}
export class CalendarRateLimitError extends Error {}
export class CalendarApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// --- Raw Google resource shapes (only what we consume) -----------------------

export interface GoogleEventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}
export interface GoogleEventAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: string;
}
export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  attendees?: GoogleEventAttendee[];
  recurringEventId?: string;
  htmlLink?: string;
  iCalUID?: string;
}
export interface GoogleEventsListResponse {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}
export interface GoogleEventInsert {
  summary?: string;
  description?: string;
  location?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  attendees?: { email: string }[];
}

async function calendarFetch<T>(
  accessToken: string,
  path: string,
  init?: { method?: string; params?: Record<string, string | undefined>; body?: unknown },
): Promise<T> {
  const url = new URL(`${CALENDAR_BASE}${path}`);
  if (init?.params) {
    for (const [k, v] of Object.entries(init.params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.ok) return (await res.json()) as T;

  if (res.status === 401) throw new CalendarAuthError("Calendar access token rejected (401).");
  if (res.status === 410) throw new CalendarSyncTokenExpiredError("Calendar syncToken expired (410).");
  if (res.status === 429 || res.status === 403) throw new CalendarRateLimitError(`Calendar rate/quota (${res.status}).`);
  throw new CalendarApiError(`Calendar API error (${res.status}).`, res.status);
}

/** One page of events. Incremental when `syncToken` is supplied. */
export async function listEventsPage(
  accessToken: string,
  opts: { calendarId?: string; syncToken?: string; pageToken?: string; maxResults?: number },
): Promise<GoogleEventsListResponse> {
  const calendarId = opts.calendarId ?? "primary";
  return calendarFetch<GoogleEventsListResponse>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    params: {
      singleEvents: "true",
      showDeleted: opts.syncToken ? "true" : undefined, // deletions only meaningful incrementally
      syncToken: opts.syncToken,
      pageToken: opts.pageToken,
      maxResults: String(opts.maxResults ?? 250),
    },
  });
}

/** Create an event on the given calendar. */
export async function insertEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleEventInsert,
): Promise<GoogleEvent> {
  return calendarFetch<GoogleEvent>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: event,
  });
}
