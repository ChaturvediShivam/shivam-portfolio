/**
 * Validate Before You Build (VBYB) — shared enums, labels and row types.
 *
 * Not server-only: admin client components import labels and enum lists from
 * here. Every enum array mirrors a Postgres enum in
 * supabase/migrations/20260914090000_validate_before_you_build.sql — change
 * both together.
 */
import type { BadgeVariant } from "@/components/admin/ui";

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = ["not_requested", "requested", "refunded"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const CAPACITY_STATUSES = ["within_capacity", "over_capacity", "not_applicable"] as const;
export type CapacityStatus = (typeof CAPACITY_STATUSES)[number];

export const VALIDATION_STATUSES = ["paid", "submitted", "in_progress", "delivered", "refunded"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const DECISIONS = ["build", "test_more", "park", "kill"] as const;
export type Decision = (typeof DECISIONS)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const EVIDENCE_STRENGTHS = ["unknown", "weak", "moderate", "strong"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

/** Where evidence came from. There is no AI value: AI output is not evidence. */
export const EVIDENCE_ORIGINS = ["customer_submission", "external_research", "direct_observation"] as const;
export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const ASSUMPTION_STATUSES = ["untested", "testing", "supported", "refuted"] as const;
export type AssumptionStatus = (typeof ASSUMPTION_STATUSES)[number];

export const TEST_STATUSES = ["not_started", "in_progress", "completed"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export const CUSTOMER_RELATIONSHIPS = ["unknown", "stranger", "known"] as const;
export type CustomerRelationship = (typeof CUSTOMER_RELATIONSHIPS)[number];

export const MATCH_STATUSES = ["matched", "unmatched"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export type MatchedBy = "ref" | "email" | "manual";

export const DELIVERY_STATUSES = ["received", "processed", "ignored", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ORDER_PROVIDERS = ["gumroad", "manual"] as const;
export type OrderProvider = (typeof ORDER_PROVIDERS)[number];

export const EVENT_TYPES = [
  "ORDER_CREATED",
  "ORDER_CAPACITY_EXCEEDED",
  "ORDER_UPDATED",
  "ORDER_REFUND_REQUESTED",
  "ORDER_REFUNDED",
  "ORDER_PARTIALLY_REFUNDED",
  "ORDER_DISPUTED",
  "CUSTOMER_UPDATED",
  "SUBMISSION_RECEIVED",
  "SUBMISSION_UNMATCHED",
  "SUBMISSION_LINKED",
  "VALIDATION_STARTED",
  "VALIDATION_UPDATED",
  "VALIDATION_STATUS_CHANGED",
  "VALIDATION_DELIVERED",
  "DECISION_RECORDED",
  "LAUNCH_UPDATED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type ActorType = "user" | "system" | "webhook";

/** The ten idea questions from the Tally form, in form order. */
export const IDEA_FIELDS = [
  { key: "idea_what", label: "What are you building?" },
  { key: "idea_who", label: "Who is it for?" },
  { key: "idea_problem", label: "What problem does it solve?" },
  { key: "idea_done", label: "What have you already built or done?" },
  { key: "idea_evidence", label: "What evidence do you already have that people want this?" },
  { key: "idea_evidence_source", label: "Where did that evidence come from?" },
  { key: "idea_next", label: "What are you planning to do next?" },
  { key: "idea_stop", label: "What would make you stop building this idea?" },
  { key: "idea_alternatives", label: "What are people using instead today?" },
  { key: "idea_context", label: "Anything else we should know?" },
] as const;
export type IdeaFieldKey = (typeof IDEA_FIELDS)[number]["key"];

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const DECISION_LABELS: Record<Decision, string> = {
  build: "BUILD",
  test_more: "TEST MORE",
  park: "PARK",
  kill: "KILL",
};

export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  paid: "Paid — awaiting submission",
  submitted: "Submitted",
  in_progress: "In progress",
  delivered: "Delivered",
  refunded: "Refunded",
};

export const EVIDENCE_ORIGIN_LABELS: Record<EvidenceOrigin, string> = {
  customer_submission: "Customer submission",
  external_research: "External research",
  direct_observation: "Direct observation",
};

export const EVENT_LABELS: Record<EventType, string> = {
  ORDER_CREATED: "Customer purchased",
  ORDER_CAPACITY_EXCEEDED: "Order exceeded founding capacity",
  ORDER_UPDATED: "Order updated",
  ORDER_REFUND_REQUESTED: "Refund requested",
  ORDER_REFUNDED: "Order refunded",
  ORDER_PARTIALLY_REFUNDED: "Partial refund in Gumroad",
  ORDER_DISPUTED: "Payment disputed in Gumroad",
  CUSTOMER_UPDATED: "Customer updated",
  SUBMISSION_RECEIVED: "Submission received",
  SUBMISSION_UNMATCHED: "Submission could not be matched",
  SUBMISSION_LINKED: "Submission linked to order",
  VALIDATION_STARTED: "Validation started",
  VALIDATION_UPDATED: "Validation updated",
  VALIDATION_STATUS_CHANGED: "Validation status changed",
  VALIDATION_DELIVERED: "Validation delivered",
  DECISION_RECORDED: "Decision recorded",
  LAUNCH_UPDATED: "Launch settings updated",
};

/** Turns a snake_case enum value into readable text. */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function validationStatusVariant(status: ValidationStatus): BadgeVariant {
  switch (status) {
    case "paid":
      return "neutral";
    case "submitted":
      return "info";
    case "in_progress":
      return "progress";
    case "delivered":
      return "success";
    case "refunded":
      return "danger";
  }
}

export function paymentStatusVariant(status: PaymentStatus): BadgeVariant {
  switch (status) {
    case "paid":
      return "success";
    case "refunded":
      return "danger";
    case "failed":
      return "danger";
    case "pending":
      return "neutral";
  }
}

export function strengthVariant(strength: EvidenceStrength): BadgeVariant {
  switch (strength) {
    case "strong":
      return "success";
    case "moderate":
      return "info";
    case "weak":
      return "progress";
    case "unknown":
      return "neutral";
  }
}

export function riskVariant(risk: RiskLevel): BadgeVariant {
  switch (risk) {
    case "critical":
      return "danger";
    case "high":
      return "progress";
    case "medium":
      return "info";
    case "low":
      return "neutral";
  }
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface VbybLaunch {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  currency: string;
  capacity: number;
  gumroad_product_id: string | null;
  primary_metric: string | null;
  criteria_min_preorders: number | null;
  criteria_strong_preorders: number | null;
  expected: string | null;
  what_happened: string | null;
  objections: string | null;
  what_changed: string | null;
  learnings: string | null;
  customer_feedback: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VbybCustomer {
  id: string;
  email: string;
  name: string | null;
  relationship: CustomerRelationship;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VbybOrder {
  id: string;
  launch_id: string;
  customer_id: string;
  provider: OrderProvider;
  external_order_id: string | null;
  external_purchaser_id: string | null;
  product_id: string | null;
  product_name: string | null;
  amount_cents: number;
  currency: string;
  purchased_at: string;
  payment_status: PaymentStatus;
  refund_status: RefundStatus;
  refund_requested_at: string | null;
  refunded_at: string | null;
  refund_amount_cents: number | null;
  refund_reason: string | null;
  capacity_status: CapacityStatus;
  slot_number: number | null;
  is_test: boolean;
  submission_ref: string;
  raw_payload: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnmappedSubmissionField {
  label: string;
  type: string;
  value: string;
}

export type SubmissionFields = Partial<Record<IdeaFieldKey | "name" | "email", string>> & {
  unmapped?: UnmappedSubmissionField[];
};

export interface VbybSubmission {
  id: string;
  provider: "tally";
  external_submission_id: string;
  external_response_id: string | null;
  external_event_id: string | null;
  form_id: string | null;
  respondent_id: string | null;
  submitted_at: string;
  email: string | null;
  name: string | null;
  ref: string | null;
  fields: SubmissionFields;
  raw_payload: unknown;
  match_status: MatchStatus;
  matched_by: MatchedBy | null;
  order_id: string | null;
  matched_at: string | null;
  created_at: string;
  updated_at: string;
}

export type VbybValidation = {
  id: string;
  order_id: string;
  customer_id: string;
  submission_id: string | null;
  status: ValidationStatus;
  status_changed_at: string;
  submitted_at: string | null;
  started_at: string | null;
  delivered_at: string | null;
  decision: Decision | null;
  decided_at: string | null;
  decision_rationale: string | null;
  decision_confidence: Confidence | null;
  key_risk: string | null;
  killer_assumption_id: string | null;
  falsifier: string | null;
  evidence_summary: string | null;
  test_description: string | null;
  test_hypothesis: string | null;
  test_success_threshold: string | null;
  test_kill_threshold: string | null;
  test_deadline: string | null;
  test_result: string | null;
  test_status: TestStatus;
  test_notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
} & Record<IdeaFieldKey, string | null>;

export interface VbybAssumption {
  id: string;
  validation_id: string;
  assumption: string;
  why_it_matters: string | null;
  confidence: Confidence | null;
  risk_level: RiskLevel;
  falsifier: string | null;
  test_required: string | null;
  status: AssumptionStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VbybEvidence {
  id: string;
  validation_id: string;
  assumption_id: string | null;
  evidence_text: string;
  source: string;
  source_url: string | null;
  evidence_date: string | null;
  strength: EvidenceStrength;
  origin: EvidenceOrigin;
  provided_by_customer: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VbybEvent {
  id: string;
  event_type: EventType;
  customer_id: string | null;
  order_id: string | null;
  validation_id: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface VbybWebhookDelivery {
  id: string;
  provider: "gumroad" | "tally";
  dedupe_key: string;
  event_type: string | null;
  external_id: string | null;
  status: DeliveryStatus;
  error: string | null;
  attempts: number;
  received_at: string;
  last_received_at: string;
  processed_at: string | null;
}
