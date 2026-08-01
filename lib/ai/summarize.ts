import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiPermanentError } from "@/lib/ai/errors";
import type { AiGateway } from "@/lib/ai/gateway";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import { humanize } from "@/types/opportunity";

/**
 * Summary generation (Phase 3 · M7).
 *
 * The whole decision layer for AI summaries: eligibility, source bounding,
 * prompt resolution, the gateway call, outcome mapping and the write. Callers —
 * the Server Action today, the job handler in M7.2 — are thin; nothing but this
 * module decides whether a summary happens or what it costs.
 *
 * Dual execution context (H5): interactive callers pass the session client (RLS
 * applies), job callers will pass the service-role client (RLS bypassed). Every
 * query therefore carries `owner_id` explicitly rather than trusting the client
 * to scope it.
 *
 * Deliberate deviation: this module reads and writes `messages` directly instead
 * of going through `lib/messages.ts`. That layer accepts no owner filter and is
 * frozen from Phase 2, so routing through it would either weaken owner scoping
 * or require editing a shipped module. The projection below is narrower than the
 * UI's, which is the other reason not to share it.
 */

const MESSAGE_TEMPLATE_ID = "message_summary";
const OPPORTUNITY_TEMPLATE_ID = "opportunity_summary";

/** Most-recent messages and notes fed into a rollup. Fixed bounds, not retrieval. */
const ROLLUP_MESSAGE_LIMIT = 10;
const ROLLUP_NOTE_LIMIT = 5;

/** Below this, the list's snippet already says everything a summary could. */
const MIN_BODY_CHARS = 400;

/** Per-call input ceiling: bounds cost and the injection surface alike. */
const MAX_SOURCE_CHARS = 12_000;

/**
 * Output ceiling applied before the write. `maxOutputTokens` already bounds the
 * reply; this is the second guard required at the persistence boundary, and it
 * only fires on pathological output.
 */
const MAX_SUMMARY_CHARS = 2_000;

/**
 * Provider-supplied bulk-mail label. Marketing mail is long enough to defeat the
 * length filter, valueless to summarize, and the largest injection surface in an
 * inbox. Matched against whatever the sync stored in `metadata.labelIds`; this
 * module never asks which provider put it there.
 */
const EXCLUDED_LABEL = "CATEGORY_PROMOTIONS";

const TRUNCATION_NOTE =
  "(The message above was shortened for length. Summarize only what is shown.)";

/** Why a summary did not happen. Every value is a deliberate outcome, not a failure. */
export type SummarizeSkipReason =
  | "not_found"
  | "no_history"
  | "outbound"
  | "archived"
  | "too_short"
  | "bulk_mail"
  | "already_summarized"
  | "claim_lost"
  | "refused";

export type SummarizeResult =
  | { status: "written"; summary: string; promptVersion: string }
  | { status: "skipped"; reason: SummarizeSkipReason };

export interface SummarizeOptions {
  /** The owner every read and write is scoped to. */
  ownerId: string;
  /** Re-summarize an already-processed entity. Operator-initiated only. */
  force?: boolean;
  /** Attribution for the audit row. */
  actor?: "user" | "agent" | "system";
}

interface MessageRow {
  id: string;
  owner_id: string | null;
  direction: string;
  archived_at: string | null;
  subject: string | null;
  from_address: string | null;
  body_text: string | null;
  metadata: unknown;
  ai_processed_at: string | null;
}

const MESSAGE_SELECT =
  "id, owner_id, direction, archived_at, subject, from_address, body_text, metadata, ai_processed_at";

interface SummaryOutput {
  summary: string;
  confidence: number;
}

/** True when the sync recorded a bulk-mail label on this message. */
function isBulkMail(metadata: unknown): boolean {
  const labels = (metadata as { labelIds?: unknown } | null)?.labelIds;
  return Array.isArray(labels) && labels.includes(EXCLUDED_LABEL);
}

/**
 * The first reason this message may not be summarized, or null when it may.
 *
 * There is no owner check here: the read filters on `owner_id`, so a row with a
 * null or foreign owner never reaches this function — it is reported absent.
 */
function ineligibleBecause(row: MessageRow): SummarizeSkipReason | null {
  if (row.direction !== "inbound") return "outbound";
  if (row.archived_at) return "archived";
  if (isBulkMail(row.metadata)) return "bulk_mail";
  if ((row.body_text ?? "").trim().length < MIN_BODY_CHARS) return "too_short";
  return null;
}

/**
 * Bound the source text, and say so in the prompt when it was cut.
 *
 * `body_text` is non-empty by the time this runs — eligibility already rejected
 * anything below MIN_BODY_CHARS — so there is no fallback source to reach for.
 */
function boundSource(row: MessageRow): { body: string; truncationNote: string } {
  const full = (row.body_text ?? "").trim();
  if (full.length <= MAX_SOURCE_CHARS) return { body: full, truncationNote: "" };
  return { body: full.slice(0, MAX_SOURCE_CHARS), truncationNote: TRUNCATION_NOTE };
}

/** `ai_confidence` is numeric(5,4); anything outside [0,1] would fail the insert. */
function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Summarize one message.
 *
 * Idempotency is the write, not the read: the pre-check avoids spending on an
 * already-summarized message, but the conditional claim is what guarantees a
 * single summary when a manual call and a queued job race.
 */
export async function summarizeMessage(
  client: SupabaseClient,
  gateway: AiGateway,
  messageId: string,
  options: SummarizeOptions,
): Promise<SummarizeResult> {
  const { ownerId, force = false, actor = "system" } = options;

  const { data, error } = await client
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("id", messageId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;

  // A row owned by someone else is reported absent rather than denied — the
  // same posture the M6 tools take, and it leaks nothing about what exists.
  const row = data as MessageRow | null;
  if (!row) return { status: "skipped", reason: "not_found" };

  const ineligible = ineligibleBecause(row);
  if (ineligible) return { status: "skipped", reason: ineligible };

  if (row.ai_processed_at && !force) {
    return { status: "skipped", reason: "already_summarized" };
  }

  const template = getPromptTemplate(MESSAGE_TEMPLATE_ID);
  const { body, truncationNote } = boundSource(row);

  const completion = await gateway.complete<SummaryOutput>({
    templateId: template.id,
    // Pinned to the version just resolved, so the row records the template that
    // actually produced it rather than whatever is newest at write time.
    templateVersion: template.version,
    variables: {
      subject: row.subject ?? "(no subject)",
      from: row.from_address ?? "(unknown sender)",
      body,
      truncationNote,
    },
    ownerId,
    actor,
    action: "summarize",
    entityType: "message",
    entityId: row.id,
  });

  // A refusal is a real outcome, not an error: it is deterministic for the same
  // content, so `ai_processed_at` stays null and the job path will not retry it.
  if (completion.stopReason === "refused") {
    return { status: "skipped", reason: "refused" };
  }

  // Truncation is permanent for a fixed prompt and model — raising the
  // template's ceiling is the operator fix, so it must not burn retries.
  if (completion.stopReason === "truncated" || !completion.parsed) {
    throw new AiPermanentError("AI summary exceeded the output ceiling.");
  }

  const summary = completion.parsed.summary.trim().slice(0, MAX_SUMMARY_CHARS);

  let update = client
    .from("messages")
    .update({
      ai_summary: summary,
      ai_model: completion.model,
      ai_prompt_version: template.version,
      ai_confidence: clampConfidence(completion.parsed.confidence),
      ai_processed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("owner_id", ownerId);

  // The claim. Without this predicate two concurrent callers would both write;
  // with it, the loser gets zero rows back and stops.
  if (!force) update = update.is("ai_processed_at", null);

  const { data: claimed, error: writeError } = await update.select("id");
  if (writeError) throw writeError;

  if (!claimed || (claimed as unknown[]).length === 0) {
    return { status: "skipped", reason: "claim_lost" };
  }

  return { status: "written", summary, promptVersion: template.version };
}

// ---------------------------------------------------------------------------
// Opportunity rollups (Phase 3 · M7.3)
// ---------------------------------------------------------------------------

interface OpportunityRow {
  id: string;
  owner_id: string | null;
  title: string;
  stage: string;
  archived_at: string | null;
  ai_processed_at: string | null;
  /** PostgREST types a many-to-one embed as an array; at runtime it is an object. */
  company: { name: string } | { name: string }[] | null;
}

function companyName(company: OpportunityRow["company"]): string {
  const record = Array.isArray(company) ? company[0] : company;
  return record?.name ?? "(unknown company)";
}

const OPPORTUNITY_SELECT =
  "id, owner_id, title, stage, archived_at, ai_processed_at, company:companies(name)";

interface RollupMessage {
  subject: string | null;
  from_address: string | null;
  direction: string;
  received_at: string | null;
  sent_at: string | null;
}

interface RollupNote {
  body: string;
  created_at: string;
}

/** Date only: the model needs sequence, not timestamps. */
function shortDate(value: string | null): string {
  return value ? value.slice(0, 10) : "undated";
}

function formatMessages(rows: RollupMessage[]): string {
  if (rows.length === 0) return "(none)";
  return rows
    .map(
      (row) =>
        `- ${shortDate(row.received_at ?? row.sent_at)} ${row.direction}: ` +
        `${row.subject ?? "(no subject)"} — ${row.from_address ?? "unknown sender"}`,
    )
    .join("\n");
}

function formatNotes(rows: RollupNote[]): string {
  if (rows.length === 0) return "(none)";
  return rows.map((row) => `- ${shortDate(row.created_at)}: ${row.body}`).join("\n");
}

/**
 * Summarize one opportunity from its own recent history.
 *
 * The history is a pair of fixed, bounded queries over the opportunity's own
 * children — not retrieval. There is no ranking and no semantic selection: the
 * newest N messages and notes, oldest-context-first, capped by the same
 * character ceiling the message path uses.
 *
 * Unlike a message, an opportunity keeps changing, so `ai_processed_at` marks
 * "summarized at least once" rather than "finished". Refreshing is the
 * operator's call and arrives as `force`; nothing refreshes a rollup on its own
 * in this milestone.
 */
export async function summarizeOpportunity(
  client: SupabaseClient,
  gateway: AiGateway,
  opportunityId: string,
  options: SummarizeOptions,
): Promise<SummarizeResult> {
  const { ownerId, force = false, actor = "system" } = options;

  const { data, error } = await client
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .eq("id", opportunityId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;

  const row = data as OpportunityRow | null;
  if (!row) return { status: "skipped", reason: "not_found" };

  // Any stage qualifies, including terminal ones: a summary of why a pursuit
  // ended is one of the more useful things this produces.
  if (row.archived_at) return { status: "skipped", reason: "archived" };

  if (row.ai_processed_at && !force) {
    return { status: "skipped", reason: "already_summarized" };
  }

  const { data: messageRows, error: messageError } = await client
    .from("messages")
    .select("subject, from_address, direction, received_at, sent_at")
    .eq("opportunity_id", row.id)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(ROLLUP_MESSAGE_LIMIT);
  if (messageError) throw messageError;

  const { data: noteRows, error: noteError } = await client
    .from("opportunity_notes")
    .select("body, created_at")
    .eq("opportunity_id", row.id)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(ROLLUP_NOTE_LIMIT);
  if (noteError) throw noteError;

  const messages = (messageRows ?? []) as RollupMessage[];
  const notes = (noteRows ?? []) as RollupNote[];

  // Nothing to synthesize from. Spending on "no history is available" would be
  // paying a provider to restate an empty screen.
  if (messages.length === 0 && notes.length === 0) {
    return { status: "skipped", reason: "no_history" };
  }

  const template = getPromptTemplate(OPPORTUNITY_TEMPLATE_ID);
  const recentMessages = formatMessages(messages);
  const noteText = formatNotes(notes);

  // The cap applies to the assembled history, which is where the volume is.
  const combined = `${recentMessages}\n${noteText}`;
  const truncationNote = combined.length > MAX_SOURCE_CHARS ? TRUNCATION_NOTE : "";

  const completion = await gateway.complete<SummaryOutput>({
    templateId: template.id,
    templateVersion: template.version,
    variables: {
      title: row.title,
      // Humanized: the raw enum ("on_hold") would otherwise reach the prompt.
      stage: humanize(row.stage),
      company: companyName(row.company),
      recentMessages: recentMessages.slice(0, MAX_SOURCE_CHARS),
      notes: noteText.slice(0, Math.max(0, MAX_SOURCE_CHARS - recentMessages.length)),
      truncationNote,
    },
    ownerId,
    actor,
    action: "summarize",
    entityType: "opportunity",
    entityId: row.id,
  });

  if (completion.stopReason === "refused") {
    return { status: "skipped", reason: "refused" };
  }

  if (completion.stopReason === "truncated" || !completion.parsed) {
    throw new AiPermanentError("AI summary exceeded the output ceiling.");
  }

  const summary = completion.parsed.summary.trim().slice(0, MAX_SUMMARY_CHARS);

  let update = client
    .from("opportunities")
    .update({
      ai_summary: summary,
      ai_model: completion.model,
      ai_prompt_version: template.version,
      ai_confidence: clampConfidence(completion.parsed.confidence),
      ai_processed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("owner_id", ownerId);

  if (!force) update = update.is("ai_processed_at", null);

  const { data: claimed, error: writeError } = await update.select("id");
  if (writeError) throw writeError;

  if (!claimed || (claimed as unknown[]).length === 0) {
    return { status: "skipped", reason: "claim_lost" };
  }

  return { status: "written", summary, promptVersion: template.version };
}
