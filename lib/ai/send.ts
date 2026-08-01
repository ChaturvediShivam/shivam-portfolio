import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAiCall } from "@/lib/ai/audit";
import { claimForSend, markFailed, markSent } from "@/lib/approvals";
import { getFreshAccessToken } from "@/lib/integrations/google/tokens";
import { sendMessage, GmailAuthError } from "@/lib/integrations/google/gmail";
import type { Approval, EmailReplyPayload } from "@/types/approval";

/**
 * Approved-action executor (Phase 3 · M9).
 *
 * The only path that sends mail. Everything here is ordered around one fact:
 * `sendMessage` is irreversible, so the code is arranged so that no failure
 * before it can send, and no failure after it can cause a second send.
 *
 * The ordering, and why each step is where it is:
 *
 *   1. CLAIM (approved -> sending). Nothing else happens until this succeeds.
 *      Losing the claim means another caller owns the send; we stop silently
 *      rather than erroring, because the operator's action did take effect —
 *      just not in this request.
 *   2. Resolve the account and token. Before the send, so an expired token
 *      fails the approval back to `failed` with nothing delivered.
 *   3. SEND. The irreversible step.
 *   4. Mark sent — BEFORE writing the CRM rows. If the message insert fails we
 *      must never report failure, because failure invites a retry and the mail
 *      is already gone. Bookkeeping errors are logged, not raised.
 *   5. Record the outbound message, the timeline event, and the audit row.
 *
 * Step 4 is the one that looks wrong and is not: it deliberately prefers a
 * correct approval state with incomplete CRM bookkeeping over the reverse.
 */

/** Marker for a send that was not attempted because another caller owns it. */
export type SendResult =
  | { status: "sent"; approval: Approval; messageId: string | null }
  | { status: "skipped"; reason: "claim_lost" | "wrong_action" | "no_account" }
  | { status: "failed"; reason: string };

export interface SendOptions {
  ownerId: string;
}

interface GmailAccountRow {
  id: string;
  email_address: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  status: string | null;
}

const ACCOUNT_SELECT =
  "id, email_address, access_token_encrypted, refresh_token_encrypted, token_expires_at, status";

function asEmailPayload(approval: Approval): EmailReplyPayload | null {
  const payload = approval.proposed_payload as EmailReplyPayload;
  if (!payload || typeof payload !== "object") return null;
  if (!Array.isArray(payload.to) || payload.to.length === 0) return null;
  if (typeof payload.bodyText !== "string" || !payload.bodyText.trim()) return null;
  return payload;
}

/**
 * Execute an approved email reply.
 *
 * The caller must have already approved it; this re-checks by claiming, so a
 * stale tab calling twice cannot send twice.
 */
export async function sendApprovedReply(
  client: SupabaseClient,
  approvalId: string,
  options: SendOptions,
): Promise<SendResult> {
  // 1. Claim. The whole idempotency guarantee.
  const approval = await claimForSend(client, approvalId, options.ownerId);
  if (!approval) return { status: "skipped", reason: "claim_lost" };

  if (approval.action_type !== "email_reply") {
    await markFailed(client, approvalId, options.ownerId, "Unsupported action type.");
    return { status: "skipped", reason: "wrong_action" };
  }

  const payload = asEmailPayload(approval);
  if (!payload) {
    await markFailed(client, approvalId, options.ownerId, "Proposal payload is incomplete.");
    return { status: "failed", reason: "The proposal is missing a recipient or body." };
  }

  // 2. Account + token, before anything irreversible.
  const { data, error } = await client
    .from("integration_accounts")
    .select(ACCOUNT_SELECT)
    .eq("provider", "gmail")
    .eq("owner_id", options.ownerId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (error) {
    await markFailed(client, approvalId, options.ownerId, "Could not load the Gmail account.");
    throw error;
  }

  const account = data as unknown as GmailAccountRow | null;
  if (!account || account.status !== "connected") {
    await markFailed(client, approvalId, options.ownerId, "No connected Gmail account.");
    return { status: "skipped", reason: "no_account" };
  }

  let sentId: string;
  let sentThreadId: string;
  try {
    const accessToken = await getFreshAccessToken(client, account);

    // 3. The irreversible step.
    const sent = await sendMessage(accessToken, {
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      bodyText: payload.bodyText,
      threadId: payload.threadId,
      inReplyTo: payload.inReplyTo,
    });
    sentId = sent.id;
    sentThreadId = sent.threadId;
  } catch (err) {
    const reason =
      err instanceof GmailAuthError
        ? "Gmail rejected the send — reconnect the account to grant send access."
        : "The message could not be sent.";
    console.error("[ai/send] Gmail send failed:", err);
    await markFailed(client, approvalId, options.ownerId, reason);
    return { status: "failed", reason };
  }

  // 4. Mark sent BEFORE bookkeeping. Past this line the mail exists; reporting
  //    failure would invite a retry that could only duplicate it.
  const settled = await markSent(client, approvalId, options.ownerId, null);

  // 5. Bookkeeping. Every step logs and continues — none may fail the send.
  let messageId: string | null = null;
  try {
    messageId = await recordOutboundMessage(client, account, payload, sentId, sentThreadId, options.ownerId);
    if (messageId) {
      await client
        .from("ai_approvals")
        .update({ result_message_id: messageId })
        .eq("id", approvalId)
        .eq("owner_id", options.ownerId);
    }
  } catch (err) {
    console.error("[ai/send] outbound message bookkeeping failed:", err);
  }

  try {
    if (payload.opportunityId) {
      await client.from("opportunity_events").insert({
        opportunity_id: payload.opportunityId,
        event_type: "message_sent",
        actor_type: "agent",
        detail: `AI-drafted reply sent: ${payload.subject}`,
        metadata: { approval_id: approvalId, external_message_id: sentId },
        owner_id: options.ownerId,
      });
    }
  } catch (err) {
    console.error("[ai/send] timeline event failed:", err);
  }

  try {
    await recordAiCall(client, {
      actor: "user",
      action: "email_send",
      entityType: "approval",
      entityId: approvalId,
      aiProvider: approval.ai_provider ?? "none",
      aiModel: approval.ai_model ?? "none",
      aiPromptVersion: approval.ai_prompt_version,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costMicros: 0,
      latencyMs: 0,
      outcome: "success",
      errorCode: null,
      conversationId: approval.conversation_id,
      ownerId: options.ownerId,
    });
  } catch (err) {
    console.error("[ai/send] audit failed:", err);
  }

  return { status: "sent", approval: settled ?? approval, messageId };
}

const UNIQUE_VIOLATION = "23505";

/**
 * Record the sent mail as an outbound `messages` row.
 *
 * Stores the provider's returned id as `external_message_id`, so when Gmail
 * sync next sees this message under the SENT label it recognises it as already
 * ingested instead of creating a duplicate.
 *
 * Insert-then-catch rather than upsert, matching `ingestMessage` in
 * gmail-sync.ts: the uniqueness guarantee is a *partial* index
 * (`where external_message_id is not null`), which PostgREST's `onConflict`
 * cannot express, so an upsert would fail to infer a conflict target.
 */
async function recordOutboundMessage(
  client: SupabaseClient,
  account: GmailAccountRow,
  payload: EmailReplyPayload,
  externalMessageId: string,
  threadId: string,
  ownerId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("messages")
    .insert({
      integration_account_id: account.id,
      opportunity_id: payload.opportunityId,
      contact_id: payload.contactId,
      company_id: payload.companyId,
      source: "gmail",
      direction: "outbound",
      external_message_id: externalMessageId,
      thread_id: threadId,
      in_reply_to: payload.inReplyTo,
      subject: payload.subject,
      snippet: payload.bodyText.slice(0, 200),
      body_text: payload.bodyText,
      from_address: account.email_address,
      to_addresses: payload.to,
      cc_addresses: payload.cc,
      is_read: true,
      sent_at: new Date().toISOString(),
      metadata: { ai_drafted: true },
      owner_id: ownerId,
    })
    .select("id")
    .single();

  if (error) {
    // Sync got here first — the row exists, so resolve its id rather than
    // treating a benign race as a failure.
    if (error.code === UNIQUE_VIOLATION) {
      const { data: existing } = await client
        .from("messages")
        .select("id")
        .eq("integration_account_id", account.id)
        .eq("external_message_id", externalMessageId)
        .maybeSingle();
      return (existing?.id as string) ?? null;
    }
    throw error;
  }

  return (data?.id as string) ?? null;
}
