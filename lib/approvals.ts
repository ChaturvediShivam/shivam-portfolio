import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Approval,
  ApprovalListFilters,
  ApprovalListResult,
  ApprovalStatus,
} from "@/types/approval";
import { OPEN_APPROVAL_STATUSES } from "@/types/approval";

/**
 * Approvals data layer (Phase 3 · M9).
 *
 * The queue that satisfies ADR-006: nothing external executes without a row
 * here in `approved`. Every state transition is expressed as a *conditional*
 * update — the predicate names the status the caller believes it is moving
 * from — so a stale browser tab, a double-click, or two concurrent requests
 * cannot drive the same approval through the same transition twice.
 *
 * That matters more here than anywhere else in the codebase: the effect being
 * gated is an email, and an email cannot be un-sent.
 *
 * Owner scoping is asserted in application code as well as by RLS, per H5 —
 * a job-side caller may hold a service-role client that bypasses RLS entirely.
 */

const SELECT =
  "id, agent, action_type, entity_type, entity_id, proposed_payload, rationale, " +
  "ai_provider, ai_model, ai_prompt_version, ai_confidence, conversation_id, status, " +
  "decided_by, decided_at, executed_at, result_message_id, last_error, idempotency_key, " +
  "metadata, owner_id, created_at, updated_at, archived_at";

const DEFAULT_PAGE_SIZE = 25;

export interface CreateApprovalInput {
  agent: string;
  actionType: string;
  entityType?: string | null;
  entityId?: string | null;
  proposedPayload: Record<string, unknown>;
  rationale?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiPromptVersion?: string | null;
  aiConfidence?: number | null;
  conversationId?: string | null;
  /**
   * Identifies the logical action. Uniquely indexed across the states that can
   * still produce a send, so only one *open* proposal per action may exist —
   * distinct from the one-send-per-approval guarantee, which is `claimForSend`.
   */
  idempotencyKey: string;
  ownerId: string;
}

/** Raised when an open proposal for the same action already exists. */
export class DuplicateApprovalError extends Error {
  readonly existingKey: string;
  constructor(key: string) {
    super("An approval for this action already exists.");
    this.name = "DuplicateApprovalError";
    this.existingKey = key;
  }
}

/** Postgres unique-violation. Distinguished so a race reads as a duplicate, not a crash. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createApproval(
  client: SupabaseClient,
  input: CreateApprovalInput,
): Promise<Approval> {
  const { data, error } = await client
    .from("ai_approvals")
    .insert({
      agent: input.agent,
      action_type: input.actionType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      proposed_payload: input.proposedPayload,
      rationale: input.rationale ?? null,
      ai_provider: input.aiProvider ?? null,
      ai_model: input.aiModel ?? null,
      ai_prompt_version: input.aiPromptVersion ?? null,
      ai_confidence: input.aiConfidence ?? null,
      conversation_id: input.conversationId ?? null,
      idempotency_key: input.idempotencyKey,
      status: "pending",
      owner_id: input.ownerId,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateApprovalError(input.idempotencyKey);
    throw error;
  }
  return data as unknown as Approval;
}

export async function getApproval(
  client: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<Approval | null> {
  const { data, error } = await client
    .from("ai_approvals")
    .select(SELECT)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as Approval) ?? null;
}

export async function listApprovals(
  client: SupabaseClient,
  ownerId: string,
  filters: ApprovalListFilters = {},
): Promise<ApprovalListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("ai_approvals")
    .select(SELECT, { count: "exact" })
    .eq("owner_id", ownerId);

  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  else if (filters.openOnly) query = query.in("status", OPEN_APPROVAL_STATUSES);

  query = query.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data ?? []) as unknown as Approval[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Count of proposals still awaiting a decision, for the nav badge. */
export async function countPendingApprovals(
  client: SupabaseClient,
  ownerId: string,
): Promise<number> {
  const { count, error } = await client
    .from("ai_approvals")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .is("archived_at", null);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Move an approval between states, but only from the status the caller expects.
 *
 * Returns the updated row, or null when the predicate did not match — which
 * means someone else already moved it. Callers must treat null as "lost the
 * race", never as an error to retry.
 */
async function transition(
  client: SupabaseClient,
  id: string,
  ownerId: string,
  from: ApprovalStatus[],
  patch: Record<string, unknown>,
): Promise<Approval | null> {
  const { data, error } = await client
    .from("ai_approvals")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .in("status", from)
    .select(SELECT);

  if (error) throw error;
  const rows = (data ?? []) as unknown as Approval[];
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Approve a proposal. Only a pending or previously-failed one — approving a
 * `sent` row again is exactly the double-send this table exists to prevent.
 */
export async function approve(
  client: SupabaseClient,
  id: string,
  ownerId: string,
  decidedBy: string,
): Promise<Approval | null> {
  return transition(client, id, ownerId, ["pending", "failed"], {
    status: "approved",
    decided_by: decidedBy,
    decided_at: new Date().toISOString(),
    last_error: null,
  });
}

export async function reject(
  client: SupabaseClient,
  id: string,
  ownerId: string,
  decidedBy: string,
): Promise<Approval | null> {
  return transition(client, id, ownerId, ["pending", "failed"], {
    status: "rejected",
    decided_by: decidedBy,
    decided_at: new Date().toISOString(),
  });
}

/**
 * Claim an approved proposal for execution.
 *
 * The single most important call in this module. Moving `approved -> sending`
 * conditionally is what guarantees one send: whoever wins the update owns the
 * effect, and every other caller gets null and must stop. Nothing may call the
 * Gmail API without holding a successful claim.
 */
export async function claimForSend(
  client: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<Approval | null> {
  return transition(client, id, ownerId, ["approved"], { status: "sending" });
}

export async function markSent(
  client: SupabaseClient,
  id: string,
  ownerId: string,
  resultMessageId: string | null,
): Promise<Approval | null> {
  return transition(client, id, ownerId, ["sending"], {
    status: "sent",
    executed_at: new Date().toISOString(),
    result_message_id: resultMessageId,
    last_error: null,
  });
}

/**
 * Record a failed execution.
 *
 * Lands in `failed`, which the operator can approve again — the send did not
 * happen, so a retry is safe. A send that *did* happen never reaches here: the
 * executor marks sent before surfacing any post-send bookkeeping failure.
 */
export async function markFailed(
  client: SupabaseClient,
  id: string,
  ownerId: string,
  message: string,
): Promise<Approval | null> {
  return transition(client, id, ownerId, ["sending"], {
    status: "failed",
    last_error: message.slice(0, 500),
  });
}
