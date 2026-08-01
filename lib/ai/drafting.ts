import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiGateway } from "@/lib/ai/gateway";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import { createApproval, DuplicateApprovalError } from "@/lib/approvals";
import type { Approval, EmailReplyPayload } from "@/types/approval";

/**
 * Email draft generation (Phase 3 · M9).
 *
 * The decision layer for AI-drafted replies: eligibility, source bounding,
 * recipient derivation, the gateway call, and the write into `ai_approvals`.
 * Callers are thin; nothing but this module decides whether a draft happens.
 *
 * It produces a *proposal*, never an effect. The only thing that leaves here is
 * a `pending` approval row — sending is `lib/ai/send.ts`, behind an explicit
 * human decision (ADR-006).
 *
 * RECIPIENTS ARE NEVER MODEL OUTPUT. They are derived from the synced message
 * being replied to, so nothing written inside an email the operator received
 * can redirect the reply that answers it. The model chooses words; this module
 * chooses who receives them.
 *
 * Dual execution context (H5): every query carries `owner_id` explicitly rather
 * than trusting the client to scope it.
 */

const TEMPLATE_ID = "email_reply";

/** Per-call input ceiling: bounds cost and the injection surface alike. */
const MAX_SOURCE_CHARS = 12_000;

/** Output ceilings applied before the write, guarding pathological output. */
const MAX_SUBJECT_CHARS = 300;
const MAX_BODY_CHARS = 8_000;

/** Operator instructions are free text; bound them like any other prompt input. */
const MAX_INSTRUCTION_CHARS = 1_000;

const TRUNCATION_NOTE =
  "(The thread above was shortened for length. Reply to only what is shown.)";

/** Why a draft did not happen. Each is a deliberate outcome, not a failure. */
export type DraftSkipReason =
  | "not_found"
  | "outbound"
  | "archived"
  | "no_recipient"
  | "already_drafted"
  | "refused"
  | "empty_output";

export type DraftResult =
  | { status: "drafted"; approval: Approval }
  | { status: "skipped"; reason: DraftSkipReason };

export interface DraftOptions {
  ownerId: string;
  /** What the operator wants the reply to say. */
  instruction: string;
  /** Name the reply is signed with. */
  operatorName: string;
}

interface MessageRow {
  id: string;
  owner_id: string | null;
  direction: string;
  archived_at: string | null;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  body_text: string | null;
  snippet: string | null;
  thread_id: string | null;
  metadata: unknown;
  opportunity_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  opportunity: { title?: string | null; company?: { name?: string | null } | null } | null;
}

const MESSAGE_SELECT =
  "id, owner_id, direction, archived_at, subject, from_name, from_address, to_addresses, " +
  "cc_addresses, body_text, snippet, thread_id, metadata, opportunity_id, contact_id, company_id, " +
  "opportunity:opportunities(title, company:companies(name))";

interface DraftOutput {
  subject: string;
  body: string;
  rationale: string;
  confidence: number;
}

/**
 * The RFC 5322 Message-ID of the message being answered.
 *
 * Stored by the sync in `metadata.headers` when present. Absent is fine — the
 * reply still threads on `threadId`; it just relies on the provider rather than
 * on the receiving client.
 */
function messageIdHeader(metadata: unknown): string | null {
  const headers = (metadata as { headers?: Record<string, unknown> } | null)?.headers;
  const value = headers?.["Message-ID"] ?? headers?.["message-id"] ?? headers?.["Message-Id"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Deterministic key for "a reply to this message". Uniquely indexed. */
export function replyIdempotencyKey(messageId: string): string {
  return `email_reply:${messageId}`;
}

/**
 * Who receives the reply.
 *
 * The sender becomes the recipient; everyone else on the thread is carried to
 * Cc, minus the operator's own addresses so a reply cannot loop back into the
 * inbox it came from and re-trigger sync.
 */
function deriveRecipients(row: MessageRow): { to: string[]; cc: string[] } {
  const sender = row.from_address?.trim().toLowerCase();
  if (!sender) return { to: [], cc: [] };

  const ownAddresses = new Set((row.to_addresses ?? []).map((a) => a.trim().toLowerCase()));

  const cc = (row.cc_addresses ?? [])
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a && a !== sender && !ownAddresses.has(a));

  return { to: [sender], cc: [...new Set(cc)] };
}

/** "Re: x" without stacking prefixes on an already-replied subject. */
function replySubject(subject: string | null): string {
  const base = (subject ?? "").trim() || "(no subject)";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

/**
 * Draft a reply to one synced message.
 *
 * Writes a `pending` approval and returns it. Nothing is sent, and no external
 * call happens beyond the provider completion itself.
 */
export async function draftReply(
  client: SupabaseClient,
  gateway: AiGateway,
  messageId: string,
  options: DraftOptions,
): Promise<DraftResult> {
  const { data, error } = await client
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("id", messageId)
    .eq("owner_id", options.ownerId)
    .maybeSingle();

  if (error) throw error;
  const row = data as unknown as MessageRow | null;

  if (!row) return { status: "skipped", reason: "not_found" };
  // Replying to something the operator sent is almost never what was meant, and
  // the recipient derivation below would be wrong for it.
  if (row.direction === "outbound") return { status: "skipped", reason: "outbound" };
  if (row.archived_at) return { status: "skipped", reason: "archived" };

  const recipients = deriveRecipients(row);
  if (recipients.to.length === 0) return { status: "skipped", reason: "no_recipient" };

  const source = (row.body_text ?? row.snippet ?? "").slice(0, MAX_SOURCE_CHARS);
  const truncated = (row.body_text ?? row.snippet ?? "").length > MAX_SOURCE_CHARS;

  // PostgREST types a many-to-one embed as an array; at runtime it is an object.
  const opportunity = row.opportunity as unknown as
    | { title?: string | null; company?: { name?: string | null } | null }
    | null;

  const completion = await gateway.complete<DraftOutput>({
    templateId: TEMPLATE_ID,
    variables: {
      operatorName: options.operatorName,
      instruction: options.instruction.slice(0, MAX_INSTRUCTION_CHARS),
      opportunityTitle: opportunity?.title ?? "Not linked to a specific role",
      companyName: opportunity?.company?.name ?? "Unknown",
      subject: row.subject ?? "(no subject)",
      from: row.from_name ? `${row.from_name} <${row.from_address}>` : (row.from_address ?? "unknown"),
      body: source,
      truncationNote: truncated ? TRUNCATION_NOTE : "",
    },
    ownerId: options.ownerId,
    actor: "user",
    action: "email_draft",
    entityType: "message",
    entityId: row.id,
  });

  if (completion.stopReason === "refused") return { status: "skipped", reason: "refused" };

  const parsed = completion.parsed;
  const body = parsed?.body?.trim();
  if (!parsed || !body) return { status: "skipped", reason: "empty_output" };

  const payload: EmailReplyPayload = {
    to: recipients.to,
    cc: recipients.cc,
    // The model's subject is accepted but bounded; a missing one falls back to
    // the deterministic "Re: …" rather than sending with nothing.
    subject: (parsed.subject?.trim() || replySubject(row.subject)).slice(0, MAX_SUBJECT_CHARS),
    bodyText: body.slice(0, MAX_BODY_CHARS),
    threadId: row.thread_id,
    inReplyTo: messageIdHeader(row.metadata),
    replyToMessageId: row.id,
    opportunityId: row.opportunity_id,
    contactId: row.contact_id,
    companyId: row.company_id,
  };

  try {
    const approval = await createApproval(client, {
      agent: "email_drafter",
      actionType: "email_reply",
      entityType: "message",
      entityId: row.id,
      proposedPayload: payload as unknown as Record<string, unknown>,
      rationale: parsed.rationale?.trim() ?? null,
      aiProvider: completion.provider,
      aiModel: completion.model,
      aiPromptVersion: getPromptTemplate(TEMPLATE_ID).version,
      aiConfidence: Number.isFinite(parsed.confidence) ? parsed.confidence : null,
      idempotencyKey: replyIdempotencyKey(row.id),
      ownerId: options.ownerId,
    });

    return { status: "drafted", approval };
  } catch (err) {
    // One *open* proposal per message: two would be two approvable rows racing
    // to send two replies. Deciding the existing one frees the key — a rejected
    // or already-sent proposal no longer blocks, so re-drafting and follow-ups
    // both work.
    if (err instanceof DuplicateApprovalError) {
      return { status: "skipped", reason: "already_drafted" };
    }
    throw err;
  }
}
