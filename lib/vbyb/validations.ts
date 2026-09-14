import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIST_LIMIT } from "@/lib/vbyb/config";
import { VbybUserError, throwIfError } from "@/lib/vbyb/errors";
import { listEvents, recordEvent, type EventWithCustomer } from "@/lib/vbyb/events";
import { dateInputToIso, firstOf, isIsoDate, isUuid, textOrNull } from "@/lib/vbyb/format";
import { linkSubmission } from "@/lib/vbyb/matching";
import { planTransition } from "@/lib/vbyb/workflow";
import {
  ASSUMPTION_STATUSES,
  CONFIDENCE_LEVELS,
  DECISIONS,
  EVIDENCE_ORIGINS,
  EVIDENCE_STRENGTHS,
  IDEA_FIELDS,
  RISK_LEVELS,
  TEST_STATUSES,
  VALIDATION_STATUSES,
  type ValidationStatus,
  type VbybAssumption,
  type VbybCustomer,
  type VbybEvidence,
  type VbybOrder,
  type VbybSubmission,
  type VbybValidation,
} from "@/types/vbyb";

/** Validations, the evidence ledger, assumptions and submission linking (server-only). */

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type ValidationListRow = Pick<
  VbybValidation,
  | "id"
  | "order_id"
  | "customer_id"
  | "submission_id"
  | "status"
  | "status_changed_at"
  | "submitted_at"
  | "started_at"
  | "delivered_at"
  | "decision"
  | "decided_at"
  | "updated_at"
> & {
  customer: Pick<VbybCustomer, "id" | "email" | "name"> | null;
  order: Pick<VbybOrder, "id" | "is_test" | "payment_status" | "purchased_at"> | null;
};

export async function listValidations(db: SupabaseClient): Promise<ValidationListRow[]> {
  const { data, error } = await db
    .from("vbyb_validations")
    .select(
      "id, order_id, customer_id, submission_id, status, status_changed_at, submitted_at, started_at, delivered_at, decision, decided_at, updated_at, customer:vbyb_customers!vbyb_validations_customer_id_fkey(id, email, name), order:vbyb_orders!vbyb_validations_order_id_fkey(id, is_test, payment_status, purchased_at)",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  throwIfError(error, "list validations");
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...(r as unknown as ValidationListRow),
      customer: firstOf(r.customer as never),
      order: firstOf(r.order as never),
    };
  });
}

export interface ValidationWorkspace {
  validation: VbybValidation;
  customer: VbybCustomer | null;
  order: VbybOrder | null;
  submission: VbybSubmission | null;
  additionalSubmissions: Pick<VbybSubmission, "id" | "submitted_at" | "fields" | "email">[];
  assumptions: VbybAssumption[];
  evidence: VbybEvidence[];
  events: EventWithCustomer[];
}

export async function getValidationWorkspace(db: SupabaseClient, id: string): Promise<ValidationWorkspace | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await db
    .from("vbyb_validations")
    .select(
      "*, customer:vbyb_customers!vbyb_validations_customer_id_fkey(*), order:vbyb_orders!vbyb_validations_order_id_fkey(*)",
    )
    .eq("id", id)
    .maybeSingle();
  throwIfError(error, "get validation");
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const validation = row as unknown as VbybValidation;
  const customer = firstOf(row.customer as VbybCustomer | VbybCustomer[] | null);
  const order = firstOf(row.order as VbybOrder | VbybOrder[] | null);

  const [submissionResult, additionalResult, assumptionsResult, evidenceResult, events] = await Promise.all([
    validation.submission_id
      ? db.from("vbyb_submissions").select("*").eq("id", validation.submission_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("vbyb_submissions")
      .select("id, submitted_at, fields, email")
      .eq("order_id", validation.order_id)
      .order("submitted_at", { ascending: true }),
    db
      .from("vbyb_assumptions")
      .select("*")
      .eq("validation_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    db.from("vbyb_evidence").select("*").eq("validation_id", id).order("created_at", { ascending: true }),
    listEvents(db, { validationId: id, orderId: validation.order_id, limit: 100 }),
  ]);

  throwIfError(submissionResult.error, "get submission");
  throwIfError(additionalResult.error, "list additional submissions");
  throwIfError(assumptionsResult.error, "list assumptions");
  throwIfError(evidenceResult.error, "list evidence");

  const additional = ((additionalResult.data ?? []) as ValidationWorkspace["additionalSubmissions"]).filter(
    (s) => s.id !== validation.submission_id,
  );

  return {
    validation,
    customer,
    order,
    submission: (submissionResult.data as VbybSubmission | null) ?? null,
    additionalSubmissions: additional,
    assumptions: (assumptionsResult.data ?? []) as VbybAssumption[],
    evidence: (evidenceResult.data ?? []) as VbybEvidence[],
    events,
  };
}

export type UnmatchedSubmission = Pick<
  VbybSubmission,
  "id" | "submitted_at" | "email" | "name" | "ref" | "fields" | "created_at"
>;

export async function listUnmatchedSubmissions(db: SupabaseClient): Promise<UnmatchedSubmission[]> {
  const { data, error } = await db
    .from("vbyb_submissions")
    .select("id, submitted_at, email, name, ref, fields, created_at")
    .eq("match_status", "unmatched")
    .order("submitted_at", { ascending: false })
    .limit(LIST_LIMIT);
  throwIfError(error, "list unmatched submissions");
  return (data ?? []) as UnmatchedSubmission[];
}

export interface LinkableOrder {
  id: string;
  label: string;
  hasSubmission: boolean;
  email: string | null;
}

/** Orders a submission can be linked to by hand. Refunded orders are excluded. */
export async function listLinkableOrders(db: SupabaseClient): Promise<LinkableOrder[]> {
  const { data, error } = await db
    .from("vbyb_orders")
    .select(
      "id, purchased_at, is_test, payment_status, customer:vbyb_customers!vbyb_orders_customer_id_fkey(email, name), validation:vbyb_validations!vbyb_validations_order_id_fkey(submission_id)",
    )
    .neq("payment_status", "refunded")
    .order("purchased_at", { ascending: false })
    .limit(LIST_LIMIT);
  throwIfError(error, "list linkable orders");

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const customer = firstOf(r.customer as { email: string; name: string | null } | null);
    const validation = firstOf(r.validation as { submission_id: string | null } | null);
    const who = customer ? (customer.name ? `${customer.name} <${customer.email}>` : customer.email) : "Unknown customer";
    const date = String(r.purchased_at ?? "").slice(0, 10);
    const hasSubmission = Boolean(validation?.submission_id);
    return {
      id: String(r.id),
      label: `${who} · ${date}${r.is_test ? " · test" : ""}${hasSubmission ? " · has submission" : ""}`,
      hasSubmission,
      email: customer?.email ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Submission linking and status
// ---------------------------------------------------------------------------

export async function linkSubmissionManually(
  db: SupabaseClient,
  userId: string,
  submissionId: string,
  orderId: string,
): Promise<string> {
  if (!isUuid(submissionId)) throw new VbybUserError("Submission not found.");
  if (!isUuid(orderId)) throw new VbybUserError("Choose an order to link.");
  return linkSubmission(db, submissionId, orderId, "manual", { actorType: "user", actorId: userId });
}

const STATUS_SOURCE_COLUMNS =
  "id, order_id, customer_id, status, submitted_at, started_at, delivered_at, decision, decided_at, decision_rationale";

export async function changeValidationStatus(
  db: SupabaseClient,
  userId: string,
  validationId: string,
  to: string,
): Promise<ValidationStatus> {
  if (!isUuid(validationId)) throw new VbybUserError("Validation not found.");
  if (!(VALIDATION_STATUSES as readonly string[]).includes(to)) throw new VbybUserError("Invalid status.");

  const { data: current, error } = await db
    .from("vbyb_validations")
    .select(STATUS_SOURCE_COLUMNS)
    .eq("id", validationId)
    .maybeSingle();
  throwIfError(error, "load validation status");
  if (!current) throw new VbybUserError("Validation not found.");

  const source = current as VbybValidation;
  const plan = planTransition(source, to as ValidationStatus);
  // `ok` cannot narrow the union under `strict: false`, hence the explicit cast.
  if (plan.ok === false) throw new VbybUserError((plan as { ok: false; error: string }).error);

  // Conditional on the status we read, so two tabs cannot both apply a transition.
  const { data: updated, error: updateError } = await db
    .from("vbyb_validations")
    .update(plan.patch)
    .eq("id", validationId)
    .eq("status", source.status)
    .select("id");
  throwIfError(updateError, "change validation status");
  if (!(updated ?? []).length) {
    throw new VbybUserError("This validation changed in the meantime. Reload and try again.");
  }

  await recordEvent(db, {
    eventType: plan.eventType,
    validationId,
    orderId: source.order_id,
    customerId: source.customer_id,
    actorType: "user",
    actorId: userId,
    metadata: { from: source.status, to },
  });
  return to as ValidationStatus;
}

// ---------------------------------------------------------------------------
// Workspace sections
// ---------------------------------------------------------------------------

type FieldSpec =
  | { kind: "text"; max: number; column?: string }
  | { kind: "date"; column?: string; asTimestamp?: boolean }
  | { kind: "enum"; values: readonly string[]; nullable: boolean; column?: string };

export const VALIDATION_SECTIONS = {
  idea: Object.fromEntries(IDEA_FIELDS.map((f) => [f.key, { kind: "text", max: 20_000 } as FieldSpec])) as Record<
    string,
    FieldSpec
  >,
  test: {
    key_risk: { kind: "text", max: 5000 },
    falsifier: { kind: "text", max: 5000 },
    test_description: { kind: "text", max: 5000 },
    test_hypothesis: { kind: "text", max: 5000 },
    test_success_threshold: { kind: "text", max: 2000 },
    test_kill_threshold: { kind: "text", max: 2000 },
    test_deadline: { kind: "date" },
    test_result: { kind: "text", max: 10_000 },
    test_status: { kind: "enum", values: TEST_STATUSES, nullable: false },
    test_notes: { kind: "text", max: 5000 },
  } as Record<string, FieldSpec>,
  decision: {
    decision: { kind: "enum", values: DECISIONS, nullable: true },
    decided_on: { kind: "date", column: "decided_at", asTimestamp: true },
    decision_rationale: { kind: "text", max: 10_000 },
    decision_confidence: { kind: "enum", values: CONFIDENCE_LEVELS, nullable: true },
    evidence_summary: { kind: "text", max: 10_000 },
  } as Record<string, FieldSpec>,
  notes: {
    internal_notes: { kind: "text", max: 20_000 },
  } as Record<string, FieldSpec>,
};

export type ValidationSection = keyof typeof VALIDATION_SECTIONS;

/** Pure: turns submitted form strings into a column patch for one section. */
export function buildSectionPatch(
  section: ValidationSection,
  values: Record<string, unknown>,
): { patch: Record<string, unknown>; fieldErrors: Record<string, string> } {
  const specs = VALIDATION_SECTIONS[section];
  const patch: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  if (!specs) return { patch, fieldErrors: { _form: "Unknown section" } };

  for (const [name, spec] of Object.entries(specs)) {
    if (!(name in values)) continue;
    const raw = values[name];
    const text = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
    const column = spec.column ?? name;

    if (spec.kind === "text") {
      if (text.length > spec.max) fieldErrors[name] = `Must be ${spec.max} characters or fewer`;
      else patch[column] = textOrNull(text);
    } else if (spec.kind === "date") {
      const trimmed = text.trim();
      if (trimmed === "") patch[column] = null;
      else if (!isIsoDate(trimmed)) fieldErrors[name] = "Enter a valid date";
      else patch[column] = spec.asTimestamp ? dateInputToIso(trimmed) : trimmed;
    } else {
      const trimmed = text.trim();
      if (trimmed === "" && spec.nullable) patch[column] = null;
      else if (!spec.values.includes(trimmed)) fieldErrors[name] = "Choose a valid option";
      else patch[column] = trimmed;
    }
  }
  return { patch, fieldErrors };
}

export async function updateValidationSection(
  db: SupabaseClient,
  userId: string,
  validationId: string,
  section: string,
  values: Record<string, unknown>,
): Promise<void> {
  if (!isUuid(validationId)) throw new VbybUserError("Validation not found.");
  if (!(section in VALIDATION_SECTIONS)) throw new VbybUserError("Unknown section.");
  const typedSection = section as ValidationSection;

  const { patch, fieldErrors } = buildSectionPatch(typedSection, values);
  if (Object.keys(fieldErrors).length > 0) throw new VbybUserError("Check the highlighted fields.", fieldErrors);
  if (Object.keys(patch).length === 0) return;

  const { data: current, error } = await db
    .from("vbyb_validations")
    .select("id, order_id, customer_id, status, decision, decided_at, decision_rationale")
    .eq("id", validationId)
    .maybeSingle();
  throwIfError(error, "load validation");
  if (!current) throw new VbybUserError("Validation not found.");
  const before = current as VbybValidation;

  let eventType: "VALIDATION_UPDATED" | "DECISION_RECORDED" = "VALIDATION_UPDATED";

  if (typedSection === "decision") {
    const nextDecision = ("decision" in patch ? patch.decision : before.decision) as string | null;
    const nextRationale = ("decision_rationale" in patch ? patch.decision_rationale : before.decision_rationale) as
      | string
      | null;

    if (!nextDecision) {
      if (before.status === "delivered") {
        throw new VbybUserError("Reopen this validation before clearing its decision.");
      }
      patch.decided_at = null;
    } else if (!patch.decided_at) {
      // Keep the original date when the decision itself did not change.
      patch.decided_at = before.decision === nextDecision && before.decided_at ? before.decided_at : new Date().toISOString();
    }

    if (before.status === "delivered" && !nextRationale) {
      throw new VbybUserError("A delivered validation must keep its decision rationale.");
    }

    const decisionChanged =
      nextDecision !== before.decision ||
      nextRationale !== before.decision_rationale ||
      patch.decided_at !== before.decided_at;
    if (nextDecision && decisionChanged) eventType = "DECISION_RECORDED";
  }

  const { error: updateError } = await db.from("vbyb_validations").update(patch).eq("id", validationId);
  throwIfError(updateError, "update validation");

  await recordEvent(db, {
    eventType,
    validationId,
    orderId: before.order_id,
    customerId: before.customer_id,
    actorType: "user",
    actorId: userId,
    metadata:
      eventType === "DECISION_RECORDED"
        ? { decision: patch.decision ?? before.decision }
        : { section: typedSection, fields: Object.keys(patch) },
  });
}

export async function setKillerAssumption(
  db: SupabaseClient,
  userId: string,
  validationId: string,
  assumptionId: string | null,
): Promise<void> {
  if (!isUuid(validationId)) throw new VbybUserError("Validation not found.");
  if (assumptionId !== null && !isUuid(assumptionId)) throw new VbybUserError("Assumption not found.");

  // The composite foreign key rejects an assumption from another validation.
  const { data, error } = await db
    .from("vbyb_validations")
    .update({ killer_assumption_id: assumptionId })
    .eq("id", validationId)
    .select("id, order_id, customer_id");
  throwIfError(error, "set killer assumption");
  const row = (data ?? [])[0] as { order_id: string; customer_id: string } | undefined;
  if (!row) throw new VbybUserError("Validation not found.");

  await recordEvent(db, {
    eventType: "VALIDATION_UPDATED",
    validationId,
    orderId: row.order_id,
    customerId: row.customer_id,
    actorType: "user",
    actorId: userId,
    metadata: { section: "killer_assumption", assumption_id: assumptionId },
  });
}

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

export interface AssumptionInput {
  assumption: string;
  why_it_matters: string;
  confidence: string;
  risk_level: string;
  falsifier: string;
  test_required: string;
  status: string;
}

/** Pure: validates an assumption form into a row. */
export function buildAssumptionRow(input: AssumptionInput): {
  row: Omit<VbybAssumption, "id" | "validation_id" | "sort_order" | "created_at" | "updated_at">;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  const assumption = textOrNull(input.assumption);
  if (!assumption) fieldErrors.assumption = "Describe the assumption";
  else if (assumption.length > 2000) fieldErrors.assumption = "Must be 2000 characters or fewer";

  for (const key of ["why_it_matters", "falsifier", "test_required"] as const) {
    if ((input[key] ?? "").length > 5000) fieldErrors[key] = "Must be 5000 characters or fewer";
  }

  const risk = (input.risk_level ?? "").trim();
  if (!(RISK_LEVELS as readonly string[]).includes(risk)) fieldErrors.risk_level = "Choose a risk level";

  const confidence = (input.confidence ?? "").trim();
  if (confidence && !(CONFIDENCE_LEVELS as readonly string[]).includes(confidence)) {
    fieldErrors.confidence = "Choose a confidence level";
  }

  const status = (input.status ?? "").trim() || "untested";
  if (!(ASSUMPTION_STATUSES as readonly string[]).includes(status)) fieldErrors.status = "Choose a status";

  return {
    row: {
      assumption: assumption ?? "",
      why_it_matters: textOrNull(input.why_it_matters),
      confidence: (confidence || null) as VbybAssumption["confidence"],
      risk_level: risk as VbybAssumption["risk_level"],
      falsifier: textOrNull(input.falsifier),
      test_required: textOrNull(input.test_required),
      status: status as VbybAssumption["status"],
    },
    fieldErrors,
  };
}

async function loadValidationRefs(db: SupabaseClient, validationId: string) {
  const { data, error } = await db
    .from("vbyb_validations")
    .select("id, order_id, customer_id")
    .eq("id", validationId)
    .maybeSingle();
  throwIfError(error, "load validation");
  if (!data) throw new VbybUserError("Validation not found.");
  return data as { id: string; order_id: string; customer_id: string };
}

export async function saveAssumption(
  db: SupabaseClient,
  userId: string,
  validationId: string,
  assumptionId: string | null,
  input: AssumptionInput,
): Promise<void> {
  if (!isUuid(validationId)) throw new VbybUserError("Validation not found.");
  if (assumptionId !== null && !isUuid(assumptionId)) throw new VbybUserError("Assumption not found.");

  const { row, fieldErrors } = buildAssumptionRow(input);
  if (Object.keys(fieldErrors).length > 0) throw new VbybUserError("Check the highlighted fields.", fieldErrors);

  const refs = await loadValidationRefs(db, validationId);

  if (assumptionId) {
    const { data, error } = await db
      .from("vbyb_assumptions")
      .update(row)
      .eq("id", assumptionId)
      .eq("validation_id", validationId)
      .select("id");
    throwIfError(error, "update assumption");
    if (!(data ?? []).length) throw new VbybUserError("Assumption not found.");
  } else {
    const { count, error: countError } = await db
      .from("vbyb_assumptions")
      .select("id", { count: "exact", head: true })
      .eq("validation_id", validationId);
    throwIfError(countError, "count assumptions");
    const { error } = await db
      .from("vbyb_assumptions")
      .insert({ ...row, validation_id: validationId, sort_order: count ?? 0 });
    throwIfError(error, "create assumption");
  }

  await recordEvent(db, {
    eventType: "VALIDATION_UPDATED",
    validationId,
    orderId: refs.order_id,
    customerId: refs.customer_id,
    actorType: "user",
    actorId: userId,
    metadata: { section: "assumptions", action: assumptionId ? "updated" : "created", risk_level: row.risk_level },
  });
}

export async function deleteAssumption(db: SupabaseClient, userId: string, assumptionId: string): Promise<string> {
  if (!isUuid(assumptionId)) throw new VbybUserError("Assumption not found.");
  const { data, error } = await db.from("vbyb_assumptions").select("id, validation_id").eq("id", assumptionId).maybeSingle();
  throwIfError(error, "load assumption");
  if (!data) throw new VbybUserError("Assumption not found.");
  const validationId = (data as { validation_id: string }).validation_id;
  const refs = await loadValidationRefs(db, validationId);

  const { error: deleteError } = await db.from("vbyb_assumptions").delete().eq("id", assumptionId);
  throwIfError(deleteError, "delete assumption");

  await recordEvent(db, {
    eventType: "VALIDATION_UPDATED",
    validationId,
    orderId: refs.order_id,
    customerId: refs.customer_id,
    actorType: "user",
    actorId: userId,
    metadata: { section: "assumptions", action: "deleted" },
  });
  return validationId;
}

// ---------------------------------------------------------------------------
// Evidence ledger
// ---------------------------------------------------------------------------

export interface EvidenceInput {
  evidence_text: string;
  source: string;
  source_url: string;
  evidence_date: string;
  strength: string;
  origin: string;
  provided_by_customer: boolean;
  assumption_id: string;
  notes: string;
}

/**
 * Pure: validates an evidence form into a row. The origin must be one of the
 * non-AI origins; strength defaults to UNKNOWN when not chosen.
 */
export function buildEvidenceRow(input: EvidenceInput): {
  row: Omit<VbybEvidence, "id" | "validation_id" | "created_at" | "updated_at">;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const evidenceText = textOrNull(input.evidence_text);
  if (!evidenceText) fieldErrors.evidence_text = "Describe the evidence";
  else if (evidenceText.length > 10_000) fieldErrors.evidence_text = "Must be 10000 characters or fewer";

  const source = textOrNull(input.source);
  if (!source) fieldErrors.source = "Name the source — evidence without a source is not evidence";
  else if (source.length > 500) fieldErrors.source = "Must be 500 characters or fewer";

  const sourceUrl = textOrNull(input.source_url);
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") fieldErrors.source_url = "Enter an http(s) URL";
    } catch {
      fieldErrors.source_url = "Enter a valid URL";
    }
  }

  const evidenceDate = textOrNull(input.evidence_date);
  if (evidenceDate && !isIsoDate(evidenceDate)) fieldErrors.evidence_date = "Enter a valid date";

  const strength = textOrNull(input.strength) ?? "unknown";
  if (!(EVIDENCE_STRENGTHS as readonly string[]).includes(strength)) fieldErrors.strength = "Choose a strength";

  const origin = textOrNull(input.origin) ?? "";
  if (!(EVIDENCE_ORIGINS as readonly string[]).includes(origin)) {
    fieldErrors.origin = "Choose where this came from. AI output cannot be recorded as evidence.";
  }

  const assumptionId = textOrNull(input.assumption_id);
  if (assumptionId && !isUuid(assumptionId)) fieldErrors.assumption_id = "Choose a valid assumption";

  if ((input.notes ?? "").length > 5000) fieldErrors.notes = "Must be 5000 characters or fewer";

  return {
    row: {
      evidence_text: evidenceText ?? "",
      source: source ?? "",
      source_url: sourceUrl,
      evidence_date: evidenceDate,
      strength: strength as VbybEvidence["strength"],
      origin: origin as VbybEvidence["origin"],
      provided_by_customer: Boolean(input.provided_by_customer),
      assumption_id: assumptionId,
      notes: textOrNull(input.notes),
    },
    fieldErrors,
  };
}

export async function saveEvidence(
  db: SupabaseClient,
  userId: string,
  validationId: string,
  evidenceId: string | null,
  input: EvidenceInput,
): Promise<void> {
  if (!isUuid(validationId)) throw new VbybUserError("Validation not found.");
  if (evidenceId !== null && !isUuid(evidenceId)) throw new VbybUserError("Evidence not found.");

  const { row, fieldErrors } = buildEvidenceRow(input);
  if (Object.keys(fieldErrors).length > 0) throw new VbybUserError("Check the highlighted fields.", fieldErrors);

  const refs = await loadValidationRefs(db, validationId);

  if (evidenceId) {
    const { data, error } = await db
      .from("vbyb_evidence")
      .update(row)
      .eq("id", evidenceId)
      .eq("validation_id", validationId)
      .select("id");
    throwIfError(error, "update evidence");
    if (!(data ?? []).length) throw new VbybUserError("Evidence not found.");
  } else {
    const { error } = await db.from("vbyb_evidence").insert({ ...row, validation_id: validationId });
    throwIfError(error, "create evidence");
  }

  await recordEvent(db, {
    eventType: "VALIDATION_UPDATED",
    validationId,
    orderId: refs.order_id,
    customerId: refs.customer_id,
    actorType: "user",
    actorId: userId,
    metadata: { section: "evidence", action: evidenceId ? "updated" : "created", strength: row.strength },
  });
}

export async function deleteEvidence(db: SupabaseClient, userId: string, evidenceId: string): Promise<string> {
  if (!isUuid(evidenceId)) throw new VbybUserError("Evidence not found.");
  const { data, error } = await db.from("vbyb_evidence").select("id, validation_id").eq("id", evidenceId).maybeSingle();
  throwIfError(error, "load evidence");
  if (!data) throw new VbybUserError("Evidence not found.");
  const validationId = (data as { validation_id: string }).validation_id;
  const refs = await loadValidationRefs(db, validationId);

  const { error: deleteError } = await db.from("vbyb_evidence").delete().eq("id", evidenceId);
  throwIfError(deleteError, "delete evidence");

  await recordEvent(db, {
    eventType: "VALIDATION_UPDATED",
    validationId,
    orderId: refs.order_id,
    customerId: refs.customer_id,
    actorType: "user",
    actorId: userId,
    metadata: { section: "evidence", action: "deleted" },
  });
  return validationId;
}
