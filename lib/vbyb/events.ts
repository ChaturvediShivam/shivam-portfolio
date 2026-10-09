import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { throwIfError } from "@/lib/vbyb/errors";
import type { ActorType, EventType, VbybEvent } from "@/types/vbyb";

/**
 * Activity log. Append-only: events are inserted, never edited or deleted.
 * Order, refund and submission events written inside the SQL functions land in
 * the same table.
 */

export interface NewEvent {
  eventType: EventType;
  actorType: ActorType;
  actorId?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  validationId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordEvent(db: SupabaseClient, event: NewEvent): Promise<void> {
  const { error } = await db.from("vbyb_events").insert({
    event_type: event.eventType,
    actor_type: event.actorType,
    actor_id: event.actorId ?? null,
    customer_id: event.customerId ?? null,
    order_id: event.orderId ?? null,
    validation_id: event.validationId ?? null,
    metadata: event.metadata ?? {},
  });
  throwIfError(error, "record event");
}

/** Records an order event only if the order has none of that type yet (re-syncs repeat facts). */
export async function recordOrderEventOnce(
  db: SupabaseClient,
  event: NewEvent & { orderId: string },
): Promise<boolean> {
  const { count, error } = await db
    .from("vbyb_events")
    .select("id", { count: "exact", head: true })
    .eq("order_id", event.orderId)
    .eq("event_type", event.eventType);
  throwIfError(error, "check existing event");
  if ((count ?? 0) > 0) return false;
  await recordEvent(db, event);
  return true;
}

export type EventWithCustomer = VbybEvent & { customer: { name: string | null; email: string } | null };

export async function listEvents(
  db: SupabaseClient,
  filter: { orderId?: string; validationId?: string; limit?: number } = {},
): Promise<EventWithCustomer[]> {
  let query = db
    .from("vbyb_events")
    .select("*, customer:vbyb_customers!vbyb_events_customer_id_fkey(name, email)")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 50);

  if (filter.orderId && filter.validationId) {
    query = query.or(`order_id.eq.${filter.orderId},validation_id.eq.${filter.validationId}`);
  } else if (filter.orderId) {
    query = query.eq("order_id", filter.orderId);
  } else if (filter.validationId) {
    query = query.eq("validation_id", filter.validationId);
  }

  const { data, error } = await query;
  throwIfError(error, "list events");
  return (data ?? []).map((row) => {
    const customer = Array.isArray(row.customer) ? row.customer[0] ?? null : row.customer ?? null;
    return { ...row, customer } as EventWithCustomer;
  });
}
