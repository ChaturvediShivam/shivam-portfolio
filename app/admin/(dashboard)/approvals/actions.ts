"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction, actionSuccess, actionError, type ActionResult } from "@/lib/actions";
import { featureEnabled } from "@/lib/featureFlags";
import { AiError } from "@/lib/ai/errors";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { draftReply, type DraftSkipReason } from "@/lib/ai/drafting";
import { sendApprovedReply } from "@/lib/ai/send";
import { approve, dismiss, reject } from "@/lib/approvals";
import type { ApprovalStatus } from "@/types/approval";

/**
 * Approval workflow actions (Phase 3 · M9).
 *
 * Server Actions are POST endpoints addressable by action id, so they stay
 * callable when the feature is off and the button that invokes them is not
 * rendered — a stale browser tab is the realistic case, exactly during a
 * rollback. Every action here re-checks the flag itself.
 *
 * The send action deliberately does NOT trust that the caller approved first:
 * `sendApprovedReply` claims the row, so a row that is not `approved` cannot be
 * sent no matter what the client believed.
 */

function revalidate(): void {
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/messages");
}

const DRAFT_SKIP_MESSAGES: Record<DraftSkipReason, string> = {
  not_found: "Message not found.",
  outbound: "You can only draft replies to messages you received.",
  archived: "Restore this message before drafting a reply.",
  no_recipient: "This message has no sender address to reply to.",
  already_drafted: "A draft for this message is already waiting for review.",
  refused: "The AI declined to draft a reply to this message.",
  empty_output: "The AI returned an empty draft. Try again with a clearer instruction.",
};

const MAX_INSTRUCTION_CHARS = 1_000;

export async function draftReplyAction(
  messageId: string,
  instruction: string,
): Promise<ActionResult<{ approvalId: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_EMAIL_DRAFTING")) {
      return actionError({ formError: "Email drafting is not enabled." });
    }

    const trimmed = instruction.trim();
    if (!trimmed) {
      return actionError({ formError: "Tell the assistant what the reply should say." });
    }
    if (trimmed.length > MAX_INSTRUCTION_CHARS) {
      return actionError({
        formError: `Keep the instruction under ${MAX_INSTRUCTION_CHARS} characters.`,
      });
    }

    // The name the reply is signed with. Falls back to the account's local part
    // rather than leaving the model to invent one.
    const { data } = await supabase.auth.getUser();
    const operatorName =
      (data.user?.user_metadata?.full_name as string | undefined)?.trim() ||
      data.user?.email?.split("@")[0] ||
      "";

    try {
      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
      const result = await draftReply(supabase, gateway, messageId, {
        ownerId: userId,
        instruction: trimmed,
        operatorName,
      });

      if (result.status === "skipped") {
        return actionError({ formError: DRAFT_SKIP_MESSAGES[result.reason] });
      }

      revalidate();
      return actionSuccess({ approvalId: result.approval.id });
    } catch (error) {
      const message = error instanceof AiError ? error.message : "Could not draft a reply.";
      console.error("[m9 draft] failed:", error);
      return actionError({ formError: message });
    }
  });
}

export async function approveAction(id: string): Promise<ActionResult<{ status: ApprovalStatus }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_EMAIL_DRAFTING")) {
      return actionError({ formError: "Email drafting is not enabled." });
    }

    const updated = await approve(supabase, id, userId, userId);
    if (!updated) {
      return actionError({ formError: "This proposal has already been decided." });
    }

    revalidate();
    return actionSuccess({ status: updated.status });
  });
}

export async function rejectAction(id: string): Promise<ActionResult<{ status: ApprovalStatus }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    // Rejecting is not gated on the flag: withdrawing a proposal must stay
    // possible during a rollback, and it can only ever reduce what may be sent.
    const updated = await reject(supabase, id, userId, userId);
    if (!updated) {
      return actionError({ formError: "This proposal has already been decided." });
    }

    revalidate();
    return actionSuccess({ status: updated.status });
  });
}

/**
 * Set a proposal aside.
 *
 * Ungated like `rejectAction`, and for a stronger reason: this is the only way
 * out of a row stranded in `sending` by a crashed request. It sends nothing and
 * makes no claim about whether the mail went out.
 */
export async function dismissAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const updated = await dismiss(supabase, id, userId);
    if (!updated) {
      return actionError({ formError: "This proposal has already been set aside." });
    }

    revalidate();
    return actionSuccess({ id: updated.id });
  });
}

/**
 * Send an approved reply.
 *
 * Separate from approving on purpose: two deliberate steps for an irreversible
 * action, and the approve/send split is what lets an operator approve now and
 * still have the send fail safely if the account is disconnected.
 */
export async function sendAction(id: string): Promise<ActionResult<{ messageId: string | null }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_EMAIL_DRAFTING")) {
      return actionError({ formError: "Email drafting is not enabled." });
    }

    const result = await sendApprovedReply(supabase, id, { ownerId: userId });
    revalidate();

    if (result.status === "sent") return actionSuccess({ messageId: result.messageId });

    if (result.status === "failed") return actionError({ formError: result.reason });

    const reasons: Record<typeof result.reason, string> = {
      claim_lost: "This reply is already being sent.",
      wrong_action: "This proposal is not an email reply.",
      no_account: "Connect a Gmail account before sending.",
    };
    return actionError({ formError: reasons[result.reason] });
  });
}
