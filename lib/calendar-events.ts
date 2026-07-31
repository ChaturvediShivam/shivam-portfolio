import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent, CalendarEventDTO, CreateCalendarEventInput } from "@/types/calendar";
import type { CalendarProvider } from "@/lib/sync/calendar/provider";

/**
 * Calendar events data layer (Phase 3 · M4). Server-only; the caller supplies
 * the Supabase client so the auth context is explicit — service-role (jobs,
 * owner-scoped) or session-bound (UI actions, RLS).
 */

const UNIQUE_VIOLATION = "23505";

export interface CalendarSyncAccountRow {
  id: string;
  owner_id: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  calendar_sync_token: string | null;
  status: string;
}

const ACCOUNT_COLUMNS =
  "id, owner_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, calendar_sync_token, status";

/** Load a specific Google account by id (service-role job path). */
export async function loadCalendarSyncAccount(
  client: SupabaseClient,
  accountId: string,
): Promise<CalendarSyncAccountRow | null> {
  // Archived / disconnected accounts are reported as absent so the handler
  // terminates the sync chain instead of rescheduling against a dead account.
  // disconnectAccount sets both status and archived_at; both are checked rather
  // than relying on one implying the other.
  const { data, error } = await client
    .from("integration_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("id", accountId)
    .eq("provider", "gmail")
    .is("archived_at", null)
    .neq("status", "disconnected")
    .maybeSingle();
  if (error) throw error;
  return (data as CalendarSyncAccountRow | null) ?? null;
}

/** The current session's active Google account (UI action path, RLS-scoped). */
export async function getGoogleSyncAccount(client: SupabaseClient): Promise<CalendarSyncAccountRow | null> {
  const { data, error } = await client
    .from("integration_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("provider", "gmail")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return (data as CalendarSyncAccountRow | null) ?? null;
}

interface OwnerScoped {
  id: string;
  owner_id: string | null;
}

/**
 * Idempotent upsert of a synced event DTO. Cancelled events archive the existing
 * row. Returns true when a new event row was created (for the processed count).
 */
export async function upsertCalendarEventDTO(
  client: SupabaseClient,
  account: OwnerScoped,
  dto: CalendarEventDTO,
): Promise<boolean> {
  if (dto.status === "cancelled") {
    await client
      .from("calendar_events")
      .update({ archived_at: new Date().toISOString() })
      .eq("integration_account_id", account.id)
      .eq("external_event_id", dto.externalEventId)
      .is("archived_at", null);
    return false;
  }

  const opportunityId = await autoLinkOpportunity(client, account, dto);
  const record = {
    integration_account_id: account.id,
    opportunity_id: opportunityId,
    external_event_id: dto.externalEventId,
    calendar_id: dto.calendarId,
    title: dto.title,
    description: dto.description,
    starts_at: dto.startsAt,
    ends_at: dto.endsAt,
    all_day: dto.allDay,
    location: dto.location,
    attendees: dto.attendees,
    external_ids: dto.externalIds,
    metadata: dto.metadata,
    owner_id: account.owner_id,
    archived_at: null,
  };

  const { data: existing } = await client
    .from("calendar_events")
    .select("id")
    .eq("integration_account_id", account.id)
    .eq("external_event_id", dto.externalEventId)
    .maybeSingle();

  if (existing) {
    const { error } = await client.from("calendar_events").update(record).eq("id", existing.id);
    if (error) throw error;
    return false;
  }

  const { error } = await client.from("calendar_events").insert(record);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false;
    throw error;
  }
  return true;
}

/**
 * Conservative opportunity auto-link: an attendee whose (lowercased) email
 * exactly matches a contact, when that contact is the sole primary contact of
 * one active opportunity. Parameterized `.in` — attendee addresses cannot inject.
 */
async function autoLinkOpportunity(
  client: SupabaseClient,
  account: OwnerScoped,
  dto: CalendarEventDTO,
): Promise<string | null> {
  if (!account.owner_id) return null;

  const emails = Array.from(
    new Set(dto.attendees.map((a) => a.email).filter((e): e is string => Boolean(e))),
  );
  if (emails.length === 0) return null;

  const { data: contacts } = await client
    .from("contacts")
    .select("id")
    .eq("owner_id", account.owner_id)
    .is("archived_at", null)
    .in("email", emails)
    .limit(1);
  const contact = contacts?.[0];
  if (!contact) return null;

  const { data: opps } = await client
    .from("opportunities")
    .select("id")
    .eq("owner_id", account.owner_id)
    .eq("primary_contact_id", contact.id)
    .is("archived_at", null)
    .limit(2);
  return opps && opps.length === 1 ? (opps[0].id as string) : null;
}

/**
 * Create an interview event via the provider, persist it, and — when linked to
 * an opportunity — record an `interview_scheduled` timeline event.
 */
export async function createInterview(
  client: SupabaseClient,
  account: OwnerScoped,
  input: CreateCalendarEventInput,
  provider: CalendarProvider,
): Promise<string> {
  const dto = await provider.createEvent(input);

  const { data, error } = await client
    .from("calendar_events")
    .insert({
      integration_account_id: account.id,
      opportunity_id: input.opportunityId ?? null,
      external_event_id: dto.externalEventId,
      calendar_id: dto.calendarId,
      title: dto.title,
      description: dto.description,
      starts_at: dto.startsAt,
      ends_at: dto.endsAt,
      all_day: dto.allDay,
      location: dto.location,
      attendees: dto.attendees,
      external_ids: dto.externalIds,
      metadata: dto.metadata,
      owner_id: account.owner_id,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;

  if (input.opportunityId) {
    await client.from("opportunity_events").insert({
      opportunity_id: input.opportunityId,
      event_type: "interview_scheduled",
      actor_type: "user",
      actor_id: account.owner_id,
      metadata: { calendar_event_id: id, external_event_id: dto.externalEventId },
      owner_id: account.owner_id,
    });
  }

  return id;
}

/** Upcoming (and today's) events for the agenda. */
export async function listUpcomingCalendarEvents(
  client: SupabaseClient,
  limit = 50,
): Promise<CalendarEvent[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("calendar_events")
    .select(
      "id, integration_account_id, opportunity_id, external_event_id, calendar_id, title, description, starts_at, ends_at, all_day, location, attendees, owner_id, created_at, archived_at, opportunity:opportunities(id, title)",
    )
    .is("archived_at", null)
    .gte("starts_at", since)
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CalendarEvent[];
}
