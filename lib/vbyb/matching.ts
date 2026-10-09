import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { throwIfError } from "@/lib/vbyb/errors";
import { firstOf } from "@/lib/vbyb/format";
import type { ActorType, MatchedBy } from "@/types/vbyb";

/**
 * Submission ↔ order matching.
 *
 * Precedence, strongest first:
 *   1. `ref` — the private per-order reference in the customer's Tally link.
 *   2. email — only when exactly one paid order for that email is still waiting
 *      for a submission. Two or more candidates are ambiguous and stay unmatched.
 *   3. otherwise the submission waits in the Unmatched queue for a manual link,
 *      and is retried by email when a new order arrives.
 */

/** vbyb_orders.submission_ref: two v4 UUIDs without dashes. */
export const SUBMISSION_REF_PATTERN = /^[0-9a-f]{64}$/;

export type MatchDecision =
  | { kind: "ref"; orderId: string }
  | { kind: "email"; orderId: string }
  | { kind: "unmatched"; reason: "no_identifier" | "ref_not_found" | "no_candidate" | "ambiguous_email" };

export function decideMatch(input: {
  refProvided: boolean;
  emailProvided: boolean;
  refOrder: { id: string } | null;
  emailCandidates: { id: string }[];
}): MatchDecision {
  if (input.refOrder) return { kind: "ref", orderId: input.refOrder.id };
  if (input.emailCandidates.length === 1) return { kind: "email", orderId: input.emailCandidates[0].id };
  if (input.emailCandidates.length > 1) return { kind: "unmatched", reason: "ambiguous_email" };
  if (!input.refProvided && !input.emailProvided) return { kind: "unmatched", reason: "no_identifier" };
  if (input.refProvided) return { kind: "unmatched", reason: "ref_not_found" };
  return { kind: "unmatched", reason: "no_candidate" };
}

export async function findOrderByRef(db: SupabaseClient, ref: string): Promise<{ id: string } | null> {
  const normalized = ref.trim().toLowerCase();
  if (!SUBMISSION_REF_PATTERN.test(normalized)) return null;
  const { data, error } = await db.from("vbyb_orders").select("id").eq("submission_ref", normalized).maybeSingle();
  throwIfError(error, "find order by ref");
  return data ? { id: (data as { id: string }).id } : null;
}

/** Paid orders for this email whose validation has no submission yet. */
export async function findEmailCandidates(db: SupabaseClient, email: string): Promise<{ id: string }[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];

  const { data: customer, error } = await db.from("vbyb_customers").select("id").eq("email", normalized).maybeSingle();
  throwIfError(error, "find customer by email");
  if (!customer) return [];

  // status 'paid' means: payment taken, not refunded, no submission linked.
  const { data: validations, error: validationError } = await db
    .from("vbyb_validations")
    .select("order_id")
    .eq("customer_id", (customer as { id: string }).id)
    .eq("status", "paid")
    .is("submission_id", null);
  throwIfError(validationError, "find email candidates");

  return ((validations ?? []) as { order_id: string }[]).map((v) => ({ id: v.order_id }));
}

export async function linkSubmission(
  db: SupabaseClient,
  submissionId: string,
  orderId: string,
  matchedBy: MatchedBy,
  actor: { actorType: ActorType; actorId: string | null },
): Promise<string> {
  const { data, error } = await db.rpc("vbyb_link_submission", {
    p_submission_id: submissionId,
    p_order_id: orderId,
    p_matched_by: matchedBy,
    p_actor_type: actor.actorType,
    p_actor_id: actor.actorId,
  });
  throwIfError(error, "link submission");
  return String(data);
}

/**
 * Called when a new order is created: links submissions that arrived earlier
 * under the same email, provided this order is the only one waiting for a
 * submission from that customer. Returns how many were linked.
 */
export async function autoMatchForOrder(db: SupabaseClient, orderId: string): Promise<number> {
  const { data: order, error } = await db
    .from("vbyb_orders")
    .select("id, customer:vbyb_customers!vbyb_orders_customer_id_fkey(email)")
    .eq("id", orderId)
    .maybeSingle();
  throwIfError(error, "load order for matching");
  const email = firstOf((order as { customer?: { email: string } | { email: string }[] } | null)?.customer)?.email;
  if (!email) return 0;

  const candidates = await findEmailCandidates(db, email);
  if (candidates.length !== 1 || candidates[0].id !== orderId) return 0;

  const { data: submissions, error: submissionError } = await db
    .from("vbyb_submissions")
    .select("id")
    .eq("match_status", "unmatched")
    .eq("email", email)
    .order("submitted_at", { ascending: true })
    .limit(20);
  throwIfError(submissionError, "find unmatched submissions");

  const rows = (submissions ?? []) as { id: string }[];
  for (const submission of rows) {
    await linkSubmission(db, submission.id, orderId, "email", { actorType: "system", actorId: null });
  }
  return rows.length;
}
