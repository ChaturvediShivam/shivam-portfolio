import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";
import { featureEnabled } from "@/lib/featureFlags";
import { dailyTokenBudget } from "@/lib/ai/budget";
import { getGoogleOAuthConfig } from "@/lib/integrations/google/oauth";
import { getFreshAccessToken } from "@/lib/integrations/google/tokens";
import {
  GmailAuthError,
  GmailHistoryExpiredError,
  GmailRateLimitError,
  getMessage,
  getProfile,
  listHistory,
  listRecentMessageIds,
  parseGmailMessage,
  extractEmailDomain,
  type ParsedMessage,
} from "@/lib/integrations/google/gmail";

/**
 * Gmail incremental sync engine (Phase 3 · M3).
 *
 * Poll-based, cron-driven. Idempotent by the Phase-1 unique index
 * (integration_account_id, external_message_id); the cursor (Gmail historyId)
 * advances only after a fully successful run; an expired historyId falls back to
 * a bounded backfill. Runs under the service-role job client with NO session,
 * so every query/write is scoped to the account's owner_id explicitly (H5).
 */

const BACKFILL_LIMIT = 25; // bounded initial backfill
const MAX_MESSAGES_PER_RUN = 50; // bound per-run work to stay under the function limit
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // continuous cadence
const UNIQUE_VIOLATION = "23505";

interface SyncAccount {
  id: string;
  owner_id: string | null;
  sync_cursor: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  archived_at: string | null;
  status: string | null;
}

/** An account no longer eligible for sync: gone, archived, or disconnected. */
function isInactive(account: SyncAccount | null): boolean {
  return !account || Boolean(account.archived_at) || account.status === "disconnected";
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export async function syncGmailAccount(
  client: SupabaseClient,
  accountId: string,
): Promise<{ processed: number; caughtUp: boolean; active: boolean }> {
  const { data: account, error } = await client
    .from("integration_accounts")
    .select(
      "id, owner_id, sync_cursor, access_token_encrypted, refresh_token_encrypted, token_expires_at, archived_at, status",
    )
    .eq("id", accountId)
    .eq("provider", "gmail")
    .maybeSingle();
  if (error) throw error;

  // `active` is reported separately from `caughtUp` so the handler can tell
  // "nothing left to do right now" (reschedule) apart from "this account is
  // finished" (stop). Collapsing the two into caughtUp:true made a dead account
  // re-enqueue itself forever — a no-op chain with no terminating condition.
  if (isInactive(account as SyncAccount | null)) {
    return { processed: 0, caughtUp: true, active: false };
  }

  const acct = account as SyncAccount;
  const config = getGoogleOAuthConfig();
  if (!config) throw new Error("Google OAuth is not configured.");

  const accessToken = await getFreshAccessToken(client, acct, config);

  // Determine the set of message ids to fetch + the new cursor.
  let messageIds: string[];
  let newHistoryId: string | null;

  if (acct.sync_cursor) {
    try {
      const result = await listHistory(accessToken, acct.sync_cursor);
      messageIds = result.messageIds;
      newHistoryId = result.historyId ?? acct.sync_cursor;
    } catch (err) {
      if (err instanceof GmailHistoryExpiredError) {
        messageIds = await listRecentMessageIds(accessToken, BACKFILL_LIMIT);
        newHistoryId = (await getProfile(accessToken)).historyId;
      } else {
        throw err;
      }
    }
  } else {
    messageIds = await listRecentMessageIds(accessToken, BACKFILL_LIMIT);
    newHistoryId = (await getProfile(accessToken)).historyId;
  }

  // Bound per-run work to stay under the serverless function limit. A larger
  // delta is drained across runs; the cursor advances only once fully caught up.
  const remaining = await filterUningested(client, acct.id, messageIds);
  const toFetch = remaining.slice(0, MAX_MESSAGES_PER_RUN);
  const caughtUp = remaining.length <= MAX_MESSAGES_PER_RUN;

  let processed = 0;
  for (const id of toFetch) {
    try {
      const parsed = parseGmailMessage(await getMessage(accessToken, id));
      const ingested = await ingestMessage(client, acct, parsed);
      if (ingested) processed += 1;
    } catch (err) {
      // Auth/rate errors must abort so the whole job backs off + retries
      // (cursor is not advanced). A single malformed message is skipped.
      if (err instanceof GmailAuthError || err instanceof GmailRateLimitError) throw err;
      console.error(`[gmail-sync] skipping message ${id}:`, err);
    }
  }

  // Advance the cursor only after a fully complete pass. When draining a large
  // delta in slices, keep the old cursor so the next run re-lists and continues
  // (message upserts are idempotent) — no messages are lost.
  const update: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    status: "connected",
  };
  if (caughtUp) update.sync_cursor = newHistoryId;

  const { error: cursorError } = await client
    .from("integration_accounts")
    .update(update)
    .eq("id", acct.id);
  if (cursorError) throw cursorError;

  return { processed, caughtUp, active: true };
}

/** Return the subset of ids not already stored for this account (quota saver). */
async function filterUningested(client: SupabaseClient, accountId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from("messages")
    .select("external_message_id")
    .eq("integration_account_id", accountId)
    .in("external_message_id", ids);
  if (error) throw error;
  const seen = new Set((data ?? []).map((r) => r.external_message_id as string));
  return ids.filter((id) => !seen.has(id));
}

// ---------------------------------------------------------------------------
// Ingest + auto-link
// ---------------------------------------------------------------------------

async function ingestMessage(
  client: SupabaseClient,
  account: SyncAccount,
  parsed: ParsedMessage,
): Promise<boolean> {
  const links = await autoLink(client, account, parsed);

  const record = {
    integration_account_id: account.id,
    source: "gmail" as const,
    direction: parsed.direction,
    external_message_id: parsed.externalMessageId,
    thread_id: parsed.threadId,
    in_reply_to: parsed.inReplyTo,
    subject: parsed.subject,
    snippet: parsed.snippet,
    body_text: parsed.bodyText,
    body_html: parsed.bodyHtml,
    from_name: parsed.fromName,
    from_address: parsed.fromAddress,
    to_addresses: parsed.toAddresses,
    cc_addresses: parsed.ccAddresses,
    is_read: parsed.isRead,
    sent_at: parsed.sentAt,
    received_at: parsed.receivedAt,
    metadata: { labelIds: parsed.labelIds },
    owner_id: account.owner_id,
    contact_id: links.contactId,
    company_id: links.companyId,
    opportunity_id: links.opportunityId,
  };

  const { data, error } = await client.from("messages").insert(record).select("id").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false; // already ingested (idempotent)
    throw error;
  }
  const messageId = data.id as string;

  // Attachment metadata (blob storage is a follow-up — file_url stays null).
  for (const att of parsed.attachments) {
    const { error: attError } = await client.from("message_attachments").insert({
      message_id: messageId,
      file_name: att.fileName,
      mime_type: att.mimeType,
      file_size_bytes: att.sizeBytes,
      is_inline: att.isInline,
      external_attachment_id: att.externalAttachmentId,
      owner_id: account.owner_id,
    });
    if (attError && attError.code !== UNIQUE_VIOLATION) throw attError;
  }

  // Opportunity-linked inbound mail lands on the timeline (existing enum value).
  if (links.opportunityId) {
    await client.from("opportunity_events").insert({
      opportunity_id: links.opportunityId,
      event_type: "message_received",
      actor_type: "system",
      detail: null,
      metadata: { message_id: messageId, external_message_id: parsed.externalMessageId },
      owner_id: account.owner_id,
    });
  }

  // Only reached for a genuinely new row — the unique-violation path returned
  // false above — so a message is never enqueued for summary twice.
  if (account.owner_id) await requestMessageSummary(client, account.owner_id, messageId);

  return true;
}

/**
 * Request an AI summary for a newly ingested message (Phase 3 · M7).
 *
 * Fire-and-forget: this must never fail the sync job. The message row is
 * already committed and `filterUningested` will not revisit it, so throwing
 * here would trade a missing summary for a stalled inbox. A lost enqueue is
 * recovered by the operator backfill instead.
 *
 * Gated here as well as in the handler so that flipping the flag off stops new
 * work being created, not just work being done.
 */
export async function requestMessageSummary(
  client: SupabaseClient,
  ownerId: string,
  messageId: string,
): Promise<void> {
  if (!featureEnabled("FEATURE_AI_SUMMARIES")) return;

  // Automatic summarization spends without a human in the loop, and an unset
  // budget means unlimited (lib/ai/budget.ts). Refusing to enqueue turns a
  // silent uncapped cost into a loud no-op that the operator fixes with one
  // environment variable. The manual path is unaffected: a person is deciding.
  if (dailyTokenBudget() === null) {
    console.error(
      `[gmail-sync] AI_DAILY_TOKEN_BUDGET is not set; refusing to enqueue automatic summary for message ${messageId}.`,
    );
    return;
  }

  try {
    await enqueueJob(client, {
      type: "ai_summarize",
      // The handler receives only the payload, never the job row, so the owner
      // it must scope to travels here rather than in the jobs.owner_id column.
      payload: { entityType: "message", entityId: messageId, ownerId },
      ownerId,
    });
  } catch (err) {
    console.error(`[gmail-sync] could not enqueue summary for message ${messageId}:`, err);
  }
}

interface AutoLinks {
  contactId: string | null;
  companyId: string | null;
  opportunityId: string | null;
}

/**
 * Conservative auto-linking: exact contact-email match and company-domain match
 * only; opportunity is linked only when the matched contact is the sole primary
 * contact of exactly one active opportunity. Ambiguous mail is left unlinked for
 * the operator to link in the Messages UI.
 */
async function autoLink(
  client: SupabaseClient,
  account: SyncAccount,
  parsed: ParsedMessage,
): Promise<AutoLinks> {
  const result: AutoLinks = { contactId: null, companyId: null, opportunityId: null };
  if (!account.owner_id) return result;

  const addresses = Array.from(
    new Set([parsed.fromAddress, ...parsed.toAddresses].filter((a): a is string => Boolean(a))),
  );
  if (addresses.length === 0) return result;

  // Contact by exact email. Addresses are lowercased (parseAddress) and contact
  // emails are stored lowercased (normalizeEmail), so `.in` is an exact match —
  // and it is parameterized, so sender-controlled addresses cannot inject into
  // the query filter.
  const { data: contacts } = await client
    .from("contacts")
    .select("id, company_id")
    .eq("owner_id", account.owner_id)
    .is("archived_at", null)
    .in("email", addresses)
    .limit(1);
  const contact = contacts?.[0];
  if (contact) {
    result.contactId = contact.id as string;
    result.companyId = (contact.company_id as string) ?? null;
  }

  // Company by domain (only if not already resolved via the contact).
  if (!result.companyId) {
    const domains = Array.from(new Set(addresses.map(extractEmailDomain).filter((d): d is string => Boolean(d))));
    if (domains.length > 0) {
      const { data: companies } = await client
        .from("companies")
        .select("id")
        .eq("owner_id", account.owner_id)
        .is("archived_at", null)
        .in("domain", domains)
        .limit(1);
      if (companies?.[0]) result.companyId = companies[0].id as string;
    }
  }

  // Opportunity only when the matched contact is the sole primary contact of one active opp.
  if (result.contactId) {
    const { data: opps } = await client
      .from("opportunities")
      .select("id")
      .eq("owner_id", account.owner_id)
      .eq("primary_contact_id", result.contactId)
      .is("archived_at", null)
      .limit(2);
    if (opps && opps.length === 1) result.opportunityId = opps[0].id as string;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Scheduling (single active sync per account)
// ---------------------------------------------------------------------------

async function activeGmailSyncJobs(client: SupabaseClient, accountId: string) {
  const { data } = await client
    .from("jobs")
    .select("id, status")
    .eq("type", "gmail_sync")
    .filter("payload->>accountId", "eq", accountId)
    .in("status", ["pending", "running"]);
  return data ?? [];
}

/** User-triggered sync: ensure a due sync exists without piling up duplicates. */
export async function enqueueGmailSyncNow(client: SupabaseClient, accountId: string): Promise<void> {
  const active = await activeGmailSyncJobs(client, accountId);
  if (active.some((j) => j.status === "running")) return; // already syncing

  const pending = active.find((j) => j.status === "pending");
  if (pending) {
    await client.from("jobs").update({ run_after: new Date().toISOString() }).eq("id", pending.id);
    return;
  }
  await enqueueJob(client, { type: "gmail_sync", payload: { accountId } });
}

/**
 * Continuous sync: schedule the next cycle if none is already pending. `delayMs`
 * is the normal cadence when caught up, or 0 to continue draining a large delta
 * promptly. Only 'pending' is checked (not the still-'running' current job), so
 * the caller can schedule the next cycle from inside the handler.
 */
export async function scheduleNextGmailSync(
  client: SupabaseClient,
  accountId: string,
  delayMs: number = SYNC_INTERVAL_MS,
): Promise<void> {
  const { data: pending } = await client
    .from("jobs")
    .select("id")
    .eq("type", "gmail_sync")
    .filter("payload->>accountId", "eq", accountId)
    .eq("status", "pending")
    .limit(1);
  if (pending && pending.length > 0) return;

  await enqueueJob(client, {
    type: "gmail_sync",
    payload: { accountId },
    runAfter: new Date(Date.now() + Math.max(0, delayMs)),
  });
}
