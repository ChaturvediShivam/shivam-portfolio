import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { priorityFromInt, type NotificationView } from "@/types/notification";
import { emailAllowed, getPreferences } from "@/lib/notifications";
import { EmailChannel } from "@/lib/notifications/channels/email-channel";

/**
 * NotificationDispatcher (Phase 3 · M5). Delivers a persisted notification to its
 * external channel(s) — currently email — respecting the owner's preferences and
 * sending only to the owner's own address. Idempotent (skips already-dispatched);
 * a transient send failure throws so the job retries.
 */

/** Resolves an owner's email — injected so the dispatcher stays testable. */
export interface OwnerLookup {
  getEmail(ownerId: string): Promise<string | null>;
}

export async function dispatchNotification(
  client: SupabaseClient,
  notificationId: string,
  ownerLookup: OwnerLookup,
): Promise<void> {
  const { data, error } = await client
    .from("notifications")
    .select("id, type, priority, title, body, payload, metadata, read_at, owner_id, created_at")
    .eq("id", notificationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const metadata = ((data.metadata as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  if (metadata.email_dispatched_at) return; // idempotent — already handled

  const ownerId = data.owner_id as string | null;
  if (!ownerId) return;

  const type = data.type as string;
  const prefs = await getPreferences(client, ownerId);

  let result: { delivered: boolean; reason?: string };
  if (!emailAllowed(prefs, type)) {
    result = { delivered: false, reason: "preference_off" };
  } else {
    const view: NotificationView = {
      id: data.id as string,
      type,
      priority: priorityFromInt((data.priority as number) ?? 1),
      title: data.title as string,
      body: (data.body as string) ?? null,
      payload: (data.payload as NotificationView["payload"]) ?? {},
      readAt: (data.read_at as string) ?? null,
      createdAt: data.created_at as string,
    };
    const email = await ownerLookup.getEmail(ownerId);
    const delivery = await new EmailChannel().deliver(view, { email });
    if (!delivery.delivered && delivery.reason === "send_failed") {
      // Transient — let the job runner retry (metadata not stamped).
      throw new Error("notification email send failed");
    }
    result = delivery;
  }

  // Conditional stamp: only write when the notification is still unstamped, so
  // two concurrent dispatches cannot clobber each other's metadata (a plain
  // read-modify-write would lose whichever update landed first).
  //
  // Residual, accepted: the window between the check above and the send is not
  // closed, so delivery remains at-least-once — a crash or lease reclaim
  // mid-send could re-send. Closing it fully means claiming before sending,
  // which trades a duplicate email for a silently dropped one. Reaching it also
  // requires two dispatch jobs for the same notification, which the create-once
  // enqueue makes unreachable in practice.
  const { error: stampError } = await client
    .from("notifications")
    .update({
      metadata: {
        ...metadata,
        email_dispatched_at: new Date().toISOString(),
        email_result: result.delivered ? "delivered" : result.reason ?? "skipped",
      },
    })
    .eq("id", notificationId)
    .is("metadata->>email_dispatched_at", null);

  // Log, never throw. The email has already been sent by this point, so throwing
  // would hand the job back to the runner and re-send on every retry — turning a
  // lost bookkeeping write into an email storm. Losing the stamp is the strictly
  // safer failure.
  if (stampError) console.error("[notifications] dispatch stamp failed:", stampError.message);
}
