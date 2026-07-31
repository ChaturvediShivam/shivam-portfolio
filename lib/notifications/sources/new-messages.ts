import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NotificationType, buildDedupeKey, type NotificationInput } from "@/types/notification";
import type { NotificationSource } from "./source";

/**
 * NewMessageSource — recently-synced unread inbound mail. *WHY:* surfaces new
 * mail without touching Gmail sync (M3) — reads the already-synced `messages`.
 */

const WINDOW_HOURS = 48;
const LIMIT = 50;

export interface NewMessageRow {
  id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  opportunity_id: string | null;
  received_at: string | null;
}

/** Pure row → NotificationInput mapping (exported for tests). */
export function newMessageToInput(message: NewMessageRow, ownerId: string): NotificationInput {
  const sender = message.from_name || message.from_address || "Unknown sender";
  return {
    type: NotificationType.MESSAGE_RECEIVED,
    priority: "normal",
    title: `New message from ${sender}`,
    body: message.subject ?? null,
    dedupeKey: buildDedupeKey(NotificationType.MESSAGE_RECEIVED, "message", message.id),
    ownerId,
    payload: {
      entityType: "message",
      entityId: message.id,
      messageId: message.id,
      opportunityId: message.opportunity_id ?? undefined,
      actor: message.from_address ?? undefined,
    },
  };
}

export class NewMessageSource implements NotificationSource {
  readonly name = "new_messages";

  async detect(client: SupabaseClient, ownerId: string): Promise<NotificationInput[]> {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data, error } = await client
      .from("messages")
      .select("id, subject, from_address, from_name, opportunity_id, received_at")
      .eq("owner_id", ownerId)
      .eq("direction", "inbound")
      .eq("is_read", false)
      .is("archived_at", null)
      .gte("received_at", since)
      .limit(LIMIT);
    // Throw rather than degrade to []: a swallowed error would make the scan
    // report success and self-schedule forever while producing nothing.
    if (error) throw error;
    return (data ?? []).map((m) => newMessageToInput(m as NewMessageRow, ownerId));
  }
}
