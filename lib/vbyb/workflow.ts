/**
 * Validation status workflow (pure).
 *
 *   PAID → SUBMITTED → IN PROGRESS → DELIVERED
 *
 * REFUNDED is reached only through the refund flow (vbyb_record_refund), never
 * by picking it from a status control. DELIVERED requires a decision, a decision
 * date and a written rationale — enforced here for a readable error and again by
 * the vbyb_validations_delivery_requirements check constraint.
 */
import { DELIVERY_WINDOW_HOURS } from "@/lib/vbyb/config";
import type { EventType, ValidationStatus, VbybValidation } from "@/types/vbyb";

export const MANUAL_TRANSITIONS: Record<ValidationStatus, readonly ValidationStatus[]> = {
  paid: ["submitted"],
  submitted: ["in_progress"],
  in_progress: ["submitted", "delivered"],
  delivered: ["in_progress"],
  refunded: [],
};

export function canTransition(from: ValidationStatus, to: ValidationStatus): boolean {
  return MANUAL_TRANSITIONS[from]?.includes(to) ?? false;
}

type DeliveryFields = Pick<VbybValidation, "decision" | "decided_at" | "decision_rationale">;

/** What is still missing before a validation may be marked DELIVERED. */
export function missingForDelivery(validation: DeliveryFields): string[] {
  const missing: string[] = [];
  if (!validation.decision) missing.push("decision");
  if (!validation.decided_at) missing.push("decision date");
  if (!validation.decision_rationale || validation.decision_rationale.trim() === "") missing.push("decision rationale");
  return missing;
}

type TransitionSource = Pick<
  VbybValidation,
  "status" | "submitted_at" | "started_at" | "decision" | "decided_at" | "decision_rationale"
>;

export type TransitionResult =
  | { ok: true; patch: Partial<VbybValidation>; eventType: EventType }
  | { ok: false; error: string };

export function planTransition(current: TransitionSource, to: ValidationStatus, now: Date = new Date()): TransitionResult {
  if (current.status === to) return { ok: false, error: "The validation already has that status." };
  if (current.status === "refunded") return { ok: false, error: "A refunded validation cannot change status." };
  if (to === "refunded") return { ok: false, error: "Record a refund on the order to mark this validation refunded." };
  if (!canTransition(current.status, to)) {
    return { ok: false, error: `A validation cannot move from ${current.status.replace("_", " ")} to ${to.replace("_", " ")}.` };
  }

  const stamp = now.toISOString();
  const patch: Partial<VbybValidation> = { status: to, status_changed_at: stamp };
  let eventType: EventType = "VALIDATION_STATUS_CHANGED";

  if (to === "submitted" && !current.submitted_at) patch.submitted_at = stamp;

  if (to === "in_progress") {
    if (!current.started_at) patch.started_at = stamp;
    if (current.status === "submitted") eventType = "VALIDATION_STARTED";
    if (current.status === "delivered") patch.delivered_at = null;
  }

  if (to === "delivered") {
    const missing = missingForDelivery(current);
    if (missing.length > 0) {
      return { ok: false, error: `Record the ${missing.join(", ")} before marking this validation delivered.` };
    }
    patch.delivered_at = stamp;
    eventType = "VALIDATION_DELIVERED";
  }

  return { ok: true, patch, eventType };
}

/** When the Validation File is due: submission time plus the delivery window. */
export function dueAt(submittedAt: string | null): Date | null {
  if (!submittedAt) return null;
  return new Date(new Date(submittedAt).getTime() + DELIVERY_WINDOW_HOURS * 60 * 60 * 1000);
}

export function isOverdue(
  validation: Pick<VbybValidation, "status" | "submitted_at">,
  now: Date = new Date(),
): boolean {
  if (validation.status !== "submitted" && validation.status !== "in_progress") return false;
  const due = dueAt(validation.submitted_at);
  return due != null && now.getTime() > due.getTime();
}
