import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiGateway } from "@/lib/ai/gateway";

/**
 * Inbox triage (AI Inbox Assistant).
 *
 * The whole decision layer for the digest: which messages are candidates, how
 * they are bounded, the gateway call, and — most importantly — mapping the
 * model's answer back onto real records. Callers are thin.
 *
 * Nothing is persisted. The digest is recomputed on request and returned to the
 * caller; the only durable trace is the `ai_audit_log` row the gateway writes,
 * which is the same trace every other AI call leaves.
 *
 * Dual execution context (H5): every query carries `owner_id` explicitly rather
 * than trusting the client to scope it.
 */

const TEMPLATE_ID = "inbox_triage";

/** Messages considered in one pass. Bounds cost and the injection surface. */
const MAX_CANDIDATES = 25;

/** How far back to look. Older mail is history, not a to-do list. */
const LOOKBACK_DAYS = 14;

/** Per-message excerpt. Enough to triage, far short of enough to read. */
const EXCERPT_CHARS = 400;

/** Output ceilings applied before returning, guarding pathological output. */
const MAX_TEXT_CHARS = 300;

const TRUNCATION_NOTE =
  "(Some messages were shortened for length. Triage only what is shown.)";

export type TriagePriority = "high" | "normal";

/** One actionable message, resolved back to a real record. */
export interface TriageItem {
  messageId: string;
  subject: string | null;
  from: string | null;
  receivedAt: string | null;
  priority: TriagePriority;
  headline: string;
  why: string;
  nextStep: string;
}

export interface InboxDigest {
  items: TriageItem[];
  /** Candidates the model judged to need nothing. */
  noActionCount: number;
  /** Candidates examined in this pass. */
  consideredCount: number;
  generatedAt: string;
}

export type TriageSkipReason = "empty_inbox" | "refused" | "empty_output";

export type TriageResult =
  | { status: "ok"; digest: InboxDigest }
  | { status: "skipped"; reason: TriageSkipReason };

interface CandidateRow {
  id: string;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  ai_summary: string | null;
  from_name: string | null;
  from_address: string | null;
  received_at: string | null;
  is_read: boolean;
  opportunity_id: string | null;
  owner_id: string | null;
}

const CANDIDATE_SELECT =
  "id, subject, snippet, body_text, ai_summary, from_name, from_address, received_at, " +
  "is_read, opportunity_id, owner_id";

interface TriageOutput {
  items: { ref: number; priority: string; headline: string; why: string; nextStep: string }[];
  noActionCount: number;
}

/** Collapse whitespace and bound length. Prompt context, not a document store. */
function excerpt(value: string | null, limit: number): string {
  if (!value) return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function senderOf(row: CandidateRow): string | null {
  if (row.from_name && row.from_address) return `${row.from_name} <${row.from_address}>`;
  return row.from_name ?? row.from_address;
}

/**
 * Render the candidates as a numbered block.
 *
 * The AI summary is preferred over the raw body where one exists: it is shorter,
 * already redacted by M7, and says the same thing. Read state and linkage travel
 * too — "unread, and tied to an opportunity" is exactly the signal that separates
 * a message needing action from one that does not.
 */
function renderCandidates(rows: CandidateRow[]): { text: string; truncated: boolean } {
  let truncated = false;

  const blocks = rows.map((row, index) => {
    const source = row.ai_summary ?? row.body_text ?? row.snippet ?? "";
    if (source.length > EXCERPT_CHARS) truncated = true;

    return [
      `[ref ${index + 1}]`,
      `From: ${senderOf(row) ?? "unknown"}`,
      `Subject: ${row.subject?.trim() || "(no subject)"}`,
      `Received: ${row.received_at?.slice(0, 10) ?? "unknown"}`,
      `Status: ${row.is_read ? "read" : "unread"}${row.opportunity_id ? ", linked to an opportunity" : ""}`,
      excerpt(source, EXCERPT_CHARS),
    ].join("\n");
  });

  return { text: blocks.join("\n\n"), truncated };
}

/** Bound a model-supplied string before it reaches the UI. */
function boundedText(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, MAX_TEXT_CHARS);
}

/**
 * Load the messages worth triaging.
 *
 * Inbound only — a rule about mail the operator sent is not a to-do — and
 * unarchived, since archiving is how they say "handled". Newest first so a busy
 * inbox truncates to the most recent rather than the oldest.
 */
async function loadCandidates(
  client: SupabaseClient,
  ownerId: string,
): Promise<CandidateRow[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const { data, error } = await client
    .from("messages")
    .select(CANDIDATE_SELECT)
    .eq("owner_id", ownerId)
    .eq("direction", "inbound")
    .is("archived_at", null)
    .gte("received_at", since)
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(MAX_CANDIDATES);

  if (error) throw error;
  return (data ?? []) as unknown as CandidateRow[];
}

export interface TriageOptions {
  ownerId: string;
  actor?: "user" | "agent" | "system";
}

/**
 * Produce a triage digest for the inbox.
 *
 * The mapping step at the end is the load-bearing one. Every `ref` the model
 * returns is looked up in the candidate list it was given; anything unknown,
 * duplicated, or out of range is dropped rather than rendered. A digest that
 * cites a message the operator cannot open would be worse than no digest, and
 * silently trusting the index is how that happens.
 */
export async function triageInbox(
  client: SupabaseClient,
  gateway: AiGateway,
  options: TriageOptions,
): Promise<TriageResult> {
  const candidates = await loadCandidates(client, options.ownerId);
  if (candidates.length === 0) return { status: "skipped", reason: "empty_inbox" };

  const { text, truncated } = renderCandidates(candidates);

  const completion = await gateway.complete<TriageOutput>({
    templateId: TEMPLATE_ID,
    variables: {
      today: new Date().toISOString().slice(0, 10),
      messages: text,
      truncationNote: truncated ? TRUNCATION_NOTE : "",
    },
    ownerId: options.ownerId,
    actor: options.actor ?? "user",
    action: "inbox_triage",
    entityType: "inbox",
    entityId: null,
  });

  if (completion.stopReason === "refused") return { status: "skipped", reason: "refused" };

  const parsed = completion.parsed;
  if (!parsed || !Array.isArray(parsed.items)) return { status: "skipped", reason: "empty_output" };

  const seen = new Set<number>();
  const items: TriageItem[] = [];

  for (const raw of parsed.items) {
    const ref = typeof raw?.ref === "number" ? Math.trunc(raw.ref) : NaN;
    // Out of range, non-numeric, or a repeat: the model invented or duplicated
    // an index, and there is no honest way to render it.
    if (!Number.isInteger(ref) || ref < 1 || ref > candidates.length) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);

    const row = candidates[ref - 1];
    items.push({
      messageId: row.id,
      subject: row.subject,
      from: senderOf(row),
      receivedAt: row.received_at,
      priority: raw.priority === "high" ? "high" : "normal",
      headline: boundedText(raw.headline, row.subject?.trim() || "(no subject)"),
      why: boundedText(raw.why, "Flagged for review."),
      nextStep: boundedText(raw.nextStep, "Open the message."),
    });
  }

  // High first, then by recency — the order the operator would work through them.
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return (b.receivedAt ?? "").localeCompare(a.receivedAt ?? "");
  });

  // Derived, not trusted: the model's own count can disagree with what it
  // actually returned, and the arithmetic here is the version that adds up.
  const noActionCount = Math.max(0, candidates.length - items.length);

  return {
    status: "ok",
    digest: {
      items,
      noActionCount,
      consideredCount: candidates.length,
      generatedAt: new Date().toISOString(),
    },
  };
}
