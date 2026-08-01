"use server";

import { revalidatePath } from "next/cache";
import {
  withAdminAction,
  actionSuccess,
  actionError,
  getAdminActionContext,
  type ActionResult,
} from "@/lib/actions";
import {
  setMessageRead,
  setMessageArchived,
  linkMessage,
  searchActiveCompanies,
  searchActiveContacts,
  searchActiveOpportunities,
} from "@/lib/messages";
import { getGmailAccount } from "@/lib/integrations";
import { featureEnabled } from "@/lib/featureFlags";
import { enqueueGmailSyncNow } from "@/lib/sync/gmail-sync";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { AiError } from "@/lib/ai/errors";
import { summarizeMessage, type SummarizeSkipReason } from "@/lib/ai/summarize";
import { triageInbox, type InboxDigest, type TriageSkipReason } from "@/lib/ai/inbox";
import type { MessageLinkInput } from "@/types/message";

export async function markReadAction(id: string, read: boolean): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setMessageRead(supabase, id, read);
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return actionSuccess({ id });
  });
}

export async function archiveMessageAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setMessageArchived(supabase, id, true);
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return actionSuccess({ id });
  });
}

export async function restoreMessageAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await setMessageArchived(supabase, id, false);
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return actionSuccess({ id });
  });
}

/**
 * Server Actions are POST endpoints addressable by action id, so they stay
 * callable when the feature is off and the button that invokes them is not
 * rendered — a stale browser tab is the realistic case, exactly during a
 * rollback. Actions that start background work re-check the flag themselves.
 */
export async function syncNowAction(): Promise<ActionResult<{ enqueued: boolean }>> {
  return withAdminAction(async ({ supabase }) => {
    if (!featureEnabled("FEATURE_GMAIL_SYNC")) {
      return actionError({ formError: "Gmail sync is not enabled." });
    }
    const account = await getGmailAccount(supabase);
    if (!account || account.status !== "connected") {
      return actionError({ formError: "Connect a Gmail account first." });
    }
    await enqueueGmailSyncNow(supabase, account.id);
    revalidatePath("/admin/messages");
    return actionSuccess({ enqueued: true });
  });
}

/**
 * Why nothing was written, in words the operator can act on.
 *
 * Partial because the skip reasons are shared across entity types: `no_history`
 * belongs to opportunity rollups and cannot arise for a single message.
 */
const SKIP_MESSAGES: Partial<Record<SummarizeSkipReason, string>> = {
  not_found: "Message not found.",
  outbound: "Only received messages are summarized.",
  archived: "Restore this message before summarizing it.",
  too_short: "This message is short enough to read in full.",
  bulk_mail: "Bulk and promotional mail is not summarized.",
  already_summarized: "This message already has a summary.",
  claim_lost: "A summary was just written by another request.",
  refused: "The AI declined to summarize this message.",
};

/**
 * Summarize one message on demand (Phase 3 · M7).
 *
 * Runs the whole call inline rather than enqueuing: the operator asked for this
 * and a single completion is well inside the request budget, so waiting a few
 * seconds beats waiting a cron cycle with nothing on screen. Background
 * summarization is a separate path (M7.2) and is not reachable from here.
 *
 * `force` is set because the button exists precisely to refresh a summary the
 * operator is not satisfied with; the flag re-check above is what stops a stale
 * tab from spending after a rollback.
 */
export async function summarizeMessageAction(id: string): Promise<ActionResult<{ summary: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_AI_SUMMARIES")) {
      return actionError({ formError: "AI summaries are not enabled." });
    }

    try {
      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
      const result = await summarizeMessage(supabase, gateway, id, {
        ownerId: userId,
        force: true,
        actor: "user",
      });

      if (result.status === "skipped") {
        return actionError({
          formError: SKIP_MESSAGES[result.reason] ?? "Could not summarize this message.",
        });
      }

      revalidatePath("/admin/messages");
      revalidatePath(`/admin/messages/${id}`);
      return actionSuccess({ summary: result.summary });
    } catch (error) {
      // Our own taxonomy's messages are provider-agnostic and free of request
      // content; anything else stays generic.
      const message =
        error instanceof AiError ? error.message : "Could not summarize this message.";
      console.error("[ai summarize] message failed:", error);
      return actionError({ formError: message });
    }
  });
}

export async function linkMessageAction(id: string, links: MessageLinkInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await linkMessage(supabase, id, links);
    revalidatePath("/admin/messages");
    revalidatePath(`/admin/messages/${id}`);
    return actionSuccess({ id });
  });
}

export async function searchCompaniesAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveCompanies(context.supabase, query);
}
export async function searchContactsAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveContacts(context.supabase, query);
}
export async function searchOpportunitiesAction(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveOpportunities(context.supabase, query);
}

/**
 * Why a digest was not produced, in words the operator can act on.
 *
 * `empty_inbox` is deliberately not an error: nothing to triage is a valid and
 * common state, and reporting it as a failure would train the operator to
 * ignore the panel.
 */
const TRIAGE_MESSAGES: Record<TriageSkipReason, string> = {
  empty_inbox: "No recent inbound mail to review.",
  refused: "The AI declined to review this inbox.",
  empty_output: "The AI returned nothing usable. Try again.",
};

/**
 * AI Inbox Assistant — triage recent inbound mail on demand.
 *
 * Computes nothing until asked and stores nothing afterwards: the digest is
 * returned to the caller and held in page state. The durable trace is the
 * `ai_audit_log` row the gateway writes, same as every other AI call.
 *
 * Runs inline rather than enqueuing, for the same reason the M7 manual summary
 * does: the operator asked and is watching, so a few seconds beats a cron cycle
 * with nothing on screen.
 */
export async function triageInboxAction(): Promise<
  ActionResult<{ digest: InboxDigest | null; note: string | null }>
> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_INBOX_ASSISTANT")) {
      return actionError({ formError: "The inbox assistant is not enabled." });
    }

    try {
      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
      const result = await triageInbox(supabase, gateway, { ownerId: userId, actor: "user" });

      if (result.status === "skipped") {
        // A skip is a real answer, not a failure — returned as success with a
        // note so the panel can say what happened without an error style.
        return actionSuccess({ digest: null, note: TRIAGE_MESSAGES[result.reason] });
      }

      return actionSuccess({ digest: result.digest, note: null });
    } catch (error) {
      // Our own taxonomy's messages are provider-agnostic and free of request
      // content; anything else stays generic.
      const message = error instanceof AiError ? error.message : "Could not review the inbox.";
      console.error("[inbox assistant] triage failed:", error);
      return actionError({ formError: message });
    }
  });
}
