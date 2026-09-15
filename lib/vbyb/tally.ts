import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { throwIfError } from "@/lib/vbyb/errors";
import { recordEvent } from "@/lib/vbyb/events";
import { decideMatch, findEmailCandidates, findOrderByRef, linkSubmission } from "@/lib/vbyb/matching";
import { safeEqual } from "@/lib/vbyb/webhooks";
import type { IdeaFieldKey, MatchedBy, UnmappedSubmissionField } from "@/types/vbyb";

/**
 * Tally integration (https://tally.so/help/webhooks).
 *
 * Payload: `{ eventId, eventType: "FORM_RESPONSE", createdAt, data: { responseId,
 * submissionId, respondentId, formId, formName, createdAt, fields: [{ key, label,
 * type, value }] } }`. Hidden fields populated from URL parameters arrive with
 * `type: "HIDDEN_FIELDS"`.
 *
 * Signature: `Tally-Signature` is the base64 HMAC-SHA256 of the payload with the
 * signing secret. Tally's own example signs `JSON.stringify(payload)`, so the raw
 * body is checked first and the re-serialized JSON second — both constant-time.
 *
 * Fields are mapped by question label because Tally field keys are opaque ids.
 * A renamed question is not lost: it is kept under `unmapped`, and the full raw
 * payload is always stored.
 */

export interface TallyConfig {
  signingSecret: string;
  formId: string;
}

export const TALLY_ENV_VARS = ["TALLY_SIGNING_SECRET", "TALLY_FORM_ID"] as const;

export function readTallyConfig(
  env: Record<string, string | undefined> = process.env,
): { config: TallyConfig; missing: null } | { config: null; missing: string[] } {
  const missing = TALLY_ENV_VARS.filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { config: null, missing: [...missing] };
  return {
    config: { signingSecret: env.TALLY_SIGNING_SECRET!.trim(), formId: env.TALLY_FORM_ID!.trim() },
    missing: null,
  };
}

function hmacBase64(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64");
}

export function verifyTallySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const provided = signature.trim();
  if (safeEqual(provided, hmacBase64(secret, rawBody))) return true;
  try {
    return safeEqual(provided, hmacBase64(secret, JSON.stringify(JSON.parse(rawBody))));
  } catch {
    return false;
  }
}

type CanonicalKey = IdeaFieldKey | "name" | "email" | "ref";

/** Normalized question label → canonical field. Labels match the live Tally form. */
const LABEL_MAP: Record<string, CanonicalKey> = {
  name: "name",
  "your name": "name",
  "full name": "name",
  email: "email",
  "email address": "email",
  "your email": "email",
  "what are you building": "idea_what",
  "who is it for": "idea_who",
  "what problem does it solve": "idea_problem",
  "what have you already built or done": "idea_done",
  "what evidence do you already have that people want this": "idea_evidence",
  "where did that evidence come from": "idea_evidence_source",
  "what are you planning to do next": "idea_next",
  "what would make you stop building this idea": "idea_stop",
  "what are people using instead today": "idea_alternatives",
  "anything else we should know": "idea_context",
  ref: "ref",
};

export function normalizeLabel(label: string): string {
  return label
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?:.!\s]+$/, "");
}

const MAX_FIELD_LENGTH = 20_000;

function fieldValueToText(field: Record<string, unknown>): string {
  const value = field.value;
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  const options = Array.isArray(field.options) ? (field.options as { id?: unknown; text?: unknown }[]) : null;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (options && typeof item === "string") {
          const option = options.find((o) => o.id === item);
          if (option && typeof option.text === "string") return option.text;
        }
        return typeof item === "string" ? item : JSON.stringify(item);
      })
      .join(", ");
  }
  return JSON.stringify(value);
}

export interface TallyEnvelope {
  eventId: string;
  eventType: string;
  formId: string | null;
}

export function parseTallyEnvelope(json: unknown): TallyEnvelope | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const root = json as Record<string, unknown>;
  if (typeof root.eventId !== "string" || !root.eventId || typeof root.eventType !== "string") return null;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : null;
  return {
    eventId: root.eventId,
    eventType: root.eventType,
    formId: data && typeof data.formId === "string" ? data.formId : null,
  };
}

export interface TallySubmission {
  eventId: string;
  formId: string | null;
  submissionId: string;
  responseId: string | null;
  respondentId: string | null;
  submittedAt: string;
  email: string | null;
  name: string | null;
  ref: string | null;
  fields: Partial<Record<IdeaFieldKey | "name" | "email", string>>;
  unmapped: UnmappedSubmissionField[];
}

export function parseTallySubmission(json: unknown): TallySubmission | null {
  const envelope = parseTallyEnvelope(json);
  if (!envelope) return null;
  const root = json as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  if (!data || !Array.isArray(data.fields)) return null;

  const submissionId =
    (typeof data.submissionId === "string" && data.submissionId) ||
    (typeof data.responseId === "string" && data.responseId) ||
    null;
  if (!submissionId) return null;

  const fields: TallySubmission["fields"] = {};
  const unmapped: UnmappedSubmissionField[] = [];
  let ref: string | null = null;
  let emailFromType: string | null = null;

  for (const entry of data.fields) {
    if (!entry || typeof entry !== "object") continue;
    const field = entry as Record<string, unknown>;
    const label = typeof field.label === "string" ? field.label : "";
    const type = typeof field.type === "string" ? field.type : "";
    const text = fieldValueToText(field).slice(0, MAX_FIELD_LENGTH).trim();
    const canonical = LABEL_MAP[normalizeLabel(label)];

    if (canonical === "ref") {
      if (type === "HIDDEN_FIELDS" || type === "") ref = text || null;
      continue;
    }
    if (canonical) {
      if (text) fields[canonical] = text;
      continue;
    }
    if (type === "INPUT_EMAIL" && text && !emailFromType) {
      emailFromType = text;
      continue;
    }
    if (text) unmapped.push({ label: label.slice(0, 500), type, value: text });
  }

  const rawEmail = (fields.email ?? emailFromType ?? "").trim().toLowerCase();
  const email = rawEmail.includes("@") ? rawEmail : null;
  if (email) fields.email = email;

  const submittedAt =
    (typeof data.createdAt === "string" && data.createdAt) ||
    (typeof root.createdAt === "string" && root.createdAt) ||
    new Date().toISOString();

  return {
    eventId: envelope.eventId,
    formId: envelope.formId,
    submissionId,
    responseId: typeof data.responseId === "string" ? data.responseId : null,
    respondentId: typeof data.respondentId === "string" ? data.respondentId : null,
    submittedAt,
    email,
    name: fields.name ?? null,
    ref,
    fields,
    unmapped,
  };
}

export type TallyIngestOutcome =
  | { kind: "duplicate"; submissionId: string }
  | { kind: "matched"; submissionId: string; orderId: string; matchedBy: MatchedBy }
  | { kind: "unmatched"; submissionId: string; reason: string };

export async function ingestTallySubmission(
  db: SupabaseClient,
  submission: TallySubmission,
  rawPayload: unknown,
): Promise<TallyIngestOutcome> {
  const { data, error } = await db.rpc("vbyb_store_submission", {
    p_external_submission_id: submission.submissionId,
    p_external_response_id: submission.responseId,
    p_external_event_id: submission.eventId,
    p_form_id: submission.formId,
    p_respondent_id: submission.respondentId,
    p_submitted_at: submission.submittedAt,
    p_email: submission.email,
    p_name: submission.name,
    p_ref: submission.ref,
    p_fields: submission.unmapped.length ? { ...submission.fields, unmapped: submission.unmapped } : submission.fields,
    p_raw_payload: rawPayload,
  });
  throwIfError(error, "store submission");
  const row = (Array.isArray(data) ? data[0] : data) as { submission_id: string; created: boolean } | undefined;
  if (!row?.submission_id) throw new Error("[vbyb] store submission returned no row");

  if (!row.created) return { kind: "duplicate", submissionId: row.submission_id };

  const refOrder = submission.ref ? await findOrderByRef(db, submission.ref) : null;
  const emailCandidates = !refOrder && submission.email ? await findEmailCandidates(db, submission.email) : [];
  const decision = decideMatch({
    refProvided: Boolean(submission.ref),
    emailProvided: Boolean(submission.email),
    refOrder,
    emailCandidates,
  });

  if (decision.kind === "unmatched") {
    await recordEvent(db, {
      eventType: "SUBMISSION_UNMATCHED",
      actorType: "webhook",
      metadata: { submission_id: row.submission_id, reason: decision.reason },
    });
    return { kind: "unmatched", submissionId: row.submission_id, reason: decision.reason };
  }

  await linkSubmission(db, row.submission_id, decision.orderId, decision.kind, { actorType: "webhook", actorId: null });
  return { kind: "matched", submissionId: row.submission_id, orderId: decision.orderId, matchedBy: decision.kind };
}
