import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  priorityFromInt,
  priorityToInt,
  type NotificationInput,
  type NotificationPayload,
  type NotificationPreferences,
  type NotificationView,
} from "@/types/notification";

/**
 * Notifications data layer (Phase 3 · M5). Server-only; the caller supplies the
 * Supabase client so the auth context is explicit — session-bound (UI, RLS) or
 * service-role (jobs, owner-scoped). `createNotification` is the single seam all
 * producers use (scan sources now; the event bus in M10 later).
 */

const UNIQUE_VIOLATION = "23505";
const NOTIFICATION_COLUMNS = "id, type, priority, title, body, payload, metadata, read_at, owner_id, created_at";

function toView(row: Record<string, unknown>): NotificationView {
  return {
    id: row.id as string,
    type: row.type as string,
    priority: priorityFromInt((row.priority as number) ?? 1),
    title: row.title as string,
    body: (row.body as string) ?? null,
    payload: (row.payload as NotificationPayload) ?? {},
    readAt: (row.read_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * Idempotent create. A duplicate dedupe_key (per owner) is a no-op. Returns the
 * new id and whether a row was created (so dispatch is enqueued only once).
 */
export async function createNotification(
  client: SupabaseClient,
  input: NotificationInput,
): Promise<{ id: string | null; created: boolean }> {
  const { data, error } = await client
    .from("notifications")
    .insert({
      type: input.type,
      priority: priorityToInt(input.priority),
      title: input.title,
      body: input.body ?? null,
      dedupe_key: input.dedupeKey,
      payload: input.payload,
      metadata: {},
      owner_id: input.ownerId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { id: null, created: false };
    throw error;
  }
  return { id: data.id as string, created: true };
}

/** Unread count for the bell. */
export async function getUnreadCount(client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

/** Recent notifications (priority-then-recency), for the bell dropdown. */
export async function listRecentNotifications(client: SupabaseClient, limit = 8): Promise<NotificationView[]> {
  const { data, error } = await client
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toView);
}

/** Full list for the notifications page. */
export async function listNotifications(client: SupabaseClient, limit = 100): Promise<NotificationView[]> {
  const { data, error } = await client
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toView);
}

export async function markNotificationRead(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllNotificationsRead(client: SupabaseClient): Promise<void> {
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function getPreferences(
  client: SupabaseClient,
  ownerId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await client
    .from("notification_preferences")
    .select("email_enabled, type_prefs")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    emailEnabled: (data.email_enabled as boolean) ?? true,
    typePrefs: (data.type_prefs as Record<string, boolean>) ?? {},
  };
}

export async function updatePreferences(
  client: SupabaseClient,
  ownerId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  const { error } = await client
    .from("notification_preferences")
    .upsert(
      { owner_id: ownerId, email_enabled: prefs.emailEnabled, type_prefs: prefs.typePrefs },
      { onConflict: "owner_id" },
    );
  if (error) throw error;
}

/** True when email is enabled for this notification type (opt-out model). */
export function emailAllowed(prefs: NotificationPreferences, type: string): boolean {
  if (!prefs.emailEnabled) return false;
  return prefs.typePrefs[type] !== false;
}

/**
 * Owners that own notifiable data (distinct owner_id across source tables).
 *
 * Known limitation (documented, not fixed in M5): PostgREST cannot express
 * `DISTINCT`, so this reads up to `OWNER_SCAN_LIMIT` rows per table and dedupes
 * client-side. An owner whose rows all fall beyond that cut would never be
 * notified. Exact at single-operator scale; a multi-owner deployment needs a
 * `distinct owner_id` SQL function, which is a migration change and therefore
 * out of scope for a review fix.
 *
 * Errors throw rather than degrading to an empty set — a swallowed error here
 * silently disables the entire scan. Note this makes the M4 migration a hard
 * prerequisite: `calendar_events` must exist before the scan runs.
 */
const OWNER_SCAN_LIMIT = 1000;

export async function getNotifiableOwners(client: SupabaseClient): Promise<string[]> {
  const owners = new Set<string>();
  for (const table of ["tasks", "messages", "calendar_events"]) {
    const { data, error } = await client
      .from(table)
      .select("owner_id")
      .not("owner_id", "is", null)
      .limit(OWNER_SCAN_LIMIT);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.owner_id) owners.add(row.owner_id as string);
    }
  }
  return [...owners];
}
