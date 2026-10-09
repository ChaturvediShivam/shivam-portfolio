import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VALIDATE_PRODUCT } from "@/constants";
import { LIST_LIMIT, VBYB_LAUNCH_SLUG } from "@/lib/vbyb/config";
import { VbybUserError, throwIfError } from "@/lib/vbyb/errors";
import { recordEvent } from "@/lib/vbyb/events";
import { dateInputToIso, firstOf, isIsoDate, isUuid, parseAmountToMinorUnits, textOrNull } from "@/lib/vbyb/format";
import { autoMatchForOrder } from "@/lib/vbyb/matching";
import { email as emailRule, maxLength, oneOf, optional, required, validate } from "@/lib/validation";
import {
  CUSTOMER_RELATIONSHIPS,
  type CapacityStatus,
  type CustomerRelationship,
  type VbybCustomer,
  type VbybOrder,
  type VbybSubmission,
  type VbybValidation,
} from "@/types/vbyb";

/** Orders, customers and refunds (server-only data layer). */

const CUSTOMER_EMBED = "customer:vbyb_customers!vbyb_orders_customer_id_fkey(id, email, name, relationship, notes)";
const VALIDATION_EMBED =
  "validation:vbyb_validations!vbyb_validations_order_id_fkey(id, status, decision, submitted_at, delivered_at, submission_id)";

export type OrderCustomer = Pick<VbybCustomer, "id" | "email" | "name" | "relationship" | "notes">;
export type OrderValidation = Pick<
  VbybValidation,
  "id" | "status" | "decision" | "submitted_at" | "delivered_at" | "submission_id"
>;
export type OrderRow = VbybOrder & { customer: OrderCustomer | null; validation: OrderValidation | null };

function normalizeOrder(row: Record<string, unknown>): OrderRow {
  return {
    ...(row as unknown as VbybOrder),
    customer: firstOf(row.customer as OrderCustomer | OrderCustomer[] | null),
    validation: firstOf(row.validation as OrderValidation | OrderValidation[] | null),
  };
}

export async function listOrders(db: SupabaseClient): Promise<OrderRow[]> {
  const { data, error } = await db
    .from("vbyb_orders")
    .select(`*, ${CUSTOMER_EMBED}, ${VALIDATION_EMBED}`)
    .order("purchased_at", { ascending: false })
    .limit(LIST_LIMIT);
  throwIfError(error, "list orders");
  return (data ?? []).map((row) => normalizeOrder(row as Record<string, unknown>));
}

export async function getOrder(db: SupabaseClient, id: string): Promise<OrderRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db
    .from("vbyb_orders")
    .select(`*, ${CUSTOMER_EMBED}, ${VALIDATION_EMBED}`)
    .eq("id", id)
    .maybeSingle();
  throwIfError(error, "get order");
  return data ? normalizeOrder(data as Record<string, unknown>) : null;
}

export async function listOrderSubmissions(
  db: SupabaseClient,
  orderId: string,
): Promise<Pick<VbybSubmission, "id" | "submitted_at" | "matched_by" | "email">[]> {
  const { data, error } = await db
    .from("vbyb_submissions")
    .select("id, submitted_at, matched_by, email")
    .eq("order_id", orderId)
    .order("submitted_at", { ascending: true });
  throwIfError(error, "list order submissions");
  return (data ?? []) as Pick<VbybSubmission, "id" | "submitted_at" | "matched_by" | "email">[];
}

/**
 * The customer's personal submission link. Carries only the random
 * submission_ref — never an internal id.
 */
export function personalSubmissionLink(submissionRef: string): string {
  const url = new URL(VALIDATE_PRODUCT.tallyUrl);
  url.searchParams.set("ref", submissionRef);
  return url.toString();
}

export type CustomerRow = VbybCustomer & {
  orders: (Pick<
    VbybOrder,
    "id" | "payment_status" | "refund_status" | "purchased_at" | "is_test" | "amount_cents" | "currency"
  > & { validation: Pick<VbybValidation, "id" | "status" | "decision"> | null })[];
};

export async function listCustomers(db: SupabaseClient): Promise<CustomerRow[]> {
  const { data, error } = await db
    .from("vbyb_customers")
    .select(
      "*, orders:vbyb_orders!vbyb_orders_customer_id_fkey(id, payment_status, refund_status, purchased_at, is_test, amount_cents, currency, validation:vbyb_validations!vbyb_validations_order_id_fkey(id, status, decision))",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  throwIfError(error, "list customers");
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const orders = (Array.isArray(r.orders) ? r.orders : []) as Record<string, unknown>[];
    return {
      ...(r as unknown as VbybCustomer),
      orders: orders
        .map((o) => ({ ...o, validation: firstOf(o.validation as never) }) as unknown as CustomerRow["orders"][number])
        .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at)),
    };
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface ManualOrderInput {
  email: string;
  name: string;
  amount: string;
  currency: string;
  purchased_on: string;
  is_test: boolean;
  notes: string;
}

function fail(fieldErrors: Record<string, string>): never {
  throw new VbybUserError("Check the highlighted fields.", fieldErrors);
}

export async function createManualOrder(
  db: SupabaseClient,
  userId: string,
  input: ManualOrderInput,
): Promise<{ orderId: string; created: boolean; capacityStatus: CapacityStatus }> {
  const checked = validate(
    { email: input.email, name: input.name, currency: input.currency, notes: input.notes },
    {
      email: [required("Email is required"), emailRule()],
      name: [optional(maxLength(200))],
      currency: [required("Currency is required")],
      notes: [optional(maxLength(5000))],
    },
  );
  const fieldErrors: Record<string, string> = { ...((checked.fieldErrors ?? {}) as Record<string, string>) };

  const currency = (input.currency ?? "").trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) fieldErrors.currency = "Use a 3-letter currency code, e.g. USD";
  const amount = /^[A-Z]{3}$/.test(currency) ? parseAmountToMinorUnits(input.amount ?? "", currency) : null;
  if (amount == null) fieldErrors.amount = "Enter an amount such as 39.00";
  if (input.purchased_on && !isIsoDate(input.purchased_on)) fieldErrors.purchased_on = "Enter a valid date";
  if (Object.keys(fieldErrors).length > 0) fail(fieldErrors);

  const { data, error } = await db.rpc("vbyb_record_order", {
    p_launch_slug: VBYB_LAUNCH_SLUG,
    p_provider: "manual",
    p_external_order_id: null,
    p_email: input.email,
    p_name: textOrNull(input.name),
    p_purchaser_id: null,
    p_product_id: null,
    p_product_name: null,
    p_amount_cents: amount,
    p_currency: currency,
    p_purchased_at: input.purchased_on ? dateInputToIso(input.purchased_on) : null,
    p_is_test: Boolean(input.is_test),
    p_raw_payload: null,
    p_notes: textOrNull(input.notes),
    p_actor_type: "user",
    p_actor_id: userId,
  });
  throwIfError(error, "create manual order");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id: string; created: boolean; capacity_status: CapacityStatus }
    | undefined;
  if (!row?.order_id) throw new Error("[vbyb] create manual order returned no row");

  if (row.created) await autoMatchForOrder(db, row.order_id);
  return { orderId: row.order_id, created: row.created, capacityStatus: row.capacity_status };
}

export async function updateOrderNotes(db: SupabaseClient, userId: string, orderId: string, notes: string): Promise<void> {
  if (!isUuid(orderId)) throw new VbybUserError("Order not found.");
  if ((notes ?? "").length > 5000) fail({ notes: "Must be 5000 characters or fewer" });

  const { data, error } = await db
    .from("vbyb_orders")
    .update({ notes: textOrNull(notes) })
    .eq("id", orderId)
    .select("id, customer_id");
  throwIfError(error, "update order notes");
  const row = (data ?? [])[0] as { id: string; customer_id: string } | undefined;
  if (!row) throw new VbybUserError("Order not found.");

  await recordEvent(db, {
    eventType: "ORDER_UPDATED",
    orderId,
    customerId: row.customer_id,
    actorType: "user",
    actorId: userId,
    metadata: { field: "notes" },
  });
}

export async function requestRefund(
  db: SupabaseClient,
  userId: string,
  orderId: string,
  input: { requested_on: string; reason: string },
): Promise<void> {
  if (!isUuid(orderId)) throw new VbybUserError("Order not found.");
  if (input.requested_on && !isIsoDate(input.requested_on)) fail({ requested_on: "Enter a valid date" });
  if ((input.reason ?? "").length > 2000) fail({ reason: "Must be 2000 characters or fewer" });

  const requestedAt = input.requested_on ? dateInputToIso(input.requested_on) : new Date().toISOString();
  const { data, error } = await db
    .from("vbyb_orders")
    .update({ refund_status: "requested", refund_requested_at: requestedAt, refund_reason: textOrNull(input.reason) })
    .eq("id", orderId)
    .eq("payment_status", "paid")
    .eq("refund_status", "not_requested")
    .select("id, customer_id");
  throwIfError(error, "request refund");
  const row = (data ?? [])[0] as { id: string; customer_id: string } | undefined;
  if (!row) throw new VbybUserError("A refund can only be requested for a paid order without a refund in progress.");

  await recordEvent(db, {
    eventType: "ORDER_REFUND_REQUESTED",
    orderId,
    customerId: row.customer_id,
    actorType: "user",
    actorId: userId,
    metadata: { requested_at: requestedAt },
  });
}

/**
 * Records a refund that has been issued (in Gumroad or elsewhere). It does not
 * move money. Frees the founding slot; the order and validation are kept.
 */
export async function recordRefund(
  db: SupabaseClient,
  userId: string,
  orderId: string,
  input: { amount: string; refunded_on: string; reason: string },
): Promise<void> {
  const order = await getOrder(db, orderId);
  if (!order) throw new VbybUserError("Order not found.");

  const amount = input.amount?.trim() ? parseAmountToMinorUnits(input.amount, order.currency) : order.amount_cents;
  const fieldErrors: Record<string, string> = {};
  if (amount == null || amount > order.amount_cents) fieldErrors.amount = "Enter an amount no larger than the order total";
  if (input.refunded_on && !isIsoDate(input.refunded_on)) fieldErrors.refunded_on = "Enter a valid date";
  if ((input.reason ?? "").length > 2000) fieldErrors.reason = "Must be 2000 characters or fewer";
  if (Object.keys(fieldErrors).length > 0) fail(fieldErrors);

  const { data, error } = await db.rpc("vbyb_record_refund", {
    p_order_id: orderId,
    p_refunded_at: input.refunded_on ? dateInputToIso(input.refunded_on) : null,
    p_amount_cents: amount,
    p_reason: textOrNull(input.reason),
    p_actor_type: "user",
    p_actor_id: userId,
  });
  throwIfError(error, "record refund");
  if (data !== true) throw new VbybUserError("This order is already refunded.");
}

export async function updateCustomer(
  db: SupabaseClient,
  userId: string,
  customerId: string,
  input: { name: string; relationship: string; notes: string },
): Promise<void> {
  if (!isUuid(customerId)) throw new VbybUserError("Customer not found.");
  const checked = validate(input, {
    name: [optional(maxLength(200))],
    relationship: [required(), oneOf(CUSTOMER_RELATIONSHIPS as readonly string[], "Choose a relationship")],
    notes: [optional(maxLength(5000))],
  });
  if (!checked.ok) fail(checked.fieldErrors as Record<string, string>);

  const { data, error } = await db
    .from("vbyb_customers")
    .update({
      name: textOrNull(input.name),
      relationship: input.relationship as CustomerRelationship,
      notes: textOrNull(input.notes),
    })
    .eq("id", customerId)
    .select("id");
  throwIfError(error, "update customer");
  if (!(data ?? []).length) throw new VbybUserError("Customer not found.");

  await recordEvent(db, {
    eventType: "CUSTOMER_UPDATED",
    customerId,
    actorType: "user",
    actorId: userId,
    metadata: { relationship: input.relationship },
  });
}
