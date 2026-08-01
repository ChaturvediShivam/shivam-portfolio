"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { withAdminAction, actionSuccess, actionError, type ActionResult } from "@/lib/actions";
import { disconnectAccount } from "@/lib/integrations";
import { featureEnabled } from "@/lib/featureFlags";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { AiError } from "@/lib/ai/errors";
import { dailyTokenBudget } from "@/lib/ai/budget";
import { selectBackfillCandidates } from "@/lib/ai/summarize";
import { requestMessageSummary } from "@/lib/sync/gmail-sync";

/**
 * Settings Server Actions (Phase 3 · M2).
 *
 * Disconnect a connected Google account: revokes at Google and soft-deletes the
 * row (handled in the data layer). Auth + RLS enforced by `withAdminAction`.
 */
export async function disconnectGoogleAction(accountId: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    if (!accountId) return actionError({ formError: "Missing account id." });
    await disconnectAccount(supabase, accountId);
    revalidatePath("/admin/settings");
    return actionSuccess({ id: accountId });
  });
}

export interface BackfillSummariesResult {
  /** Rows examined this pass. */
  scanned: number;
  /** Of those, how many pass every current eligibility rule. */
  eligible: number;
  /** Scanned but not eligible — short, promotional, or otherwise excluded. */
  skipped: number;
  /** Summaries requested. Each runs through the existing job path. */
  enqueued: number;
  /** Eligible messages whose request could not be placed. */
  failed: number;
}

/**
 * Operator backfill (Phase 3 · M7.4).
 *
 * The recovery path for summaries that never happened: the flag was off, the
 * budget guard refused, a configuration error dead-lettered the job, or queued
 * work was discarded during a rollback. All four leave `ai_processed_at` null,
 * so one pass recovers all of them.
 *
 * Operator-triggered only. Nothing here scans on a schedule, retries on its own,
 * or enqueues more than one bounded batch per click — the operator checks the
 * spend between invocations, which is why the batch is small.
 *
 * It requests summaries rather than producing them: the existing job path
 * already owns budget accounting, audit, prompt versioning and the conditional
 * claim, and a queued job gets the runner's backoff on a transient provider
 * failure. Duplicating any of that here would be a second implementation to keep
 * correct.
 */
export async function backfillSummariesAction(): Promise<ActionResult<BackfillSummariesResult>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_AI_SUMMARIES")) {
      return actionError({ formError: "AI summaries are not enabled." });
    }

    // Checked here as well as per-message so the operator gets one actionable
    // message instead of a silent no-op with a zero count.
    if (dailyTokenBudget() === null) {
      return actionError({
        formError: "Set AI_DAILY_TOKEN_BUDGET before running a backfill.",
      });
    }

    try {
      const { scanned, eligible, skipped } = await selectBackfillCandidates(supabase, userId);

      let enqueued = 0;
      let failed = 0;
      for (const messageId of eligible) {
        // Isolated so one bad row cannot abandon the rest of the batch.
        try {
          await requestMessageSummary(supabase, userId, messageId);
          enqueued += 1;
        } catch (err) {
          console.error(`[ai backfill] could not request summary for ${messageId}:`, err);
          failed += 1;
        }
      }

      revalidatePath("/admin/settings");
      return actionSuccess({ scanned, eligible: eligible.length, skipped, enqueued, failed });
    } catch (error) {
      console.error("[ai backfill] failed:", error);
      return actionError({ formError: "Could not run the backfill. Check the server logs." });
    }
  });
}

export interface AiSelfTestResult {
  provider: string;
  model: string;
  tokens: number;
  latencyMs: number;
  /** True when the model echoed the nonce we generated for this run. */
  echoed: boolean;
}

/**
 * AI self-test (Phase 3 · M6).
 *
 * The AI layer's counterpart to M1's `noop` job: exercises render → budget →
 * provider → mapper → validation → audit end to end, using a fixed in-repo
 * template and a freshly generated nonce.
 *
 * It accepts no input by design. A self-test that took free-form text would be
 * a prompt surface, and M6 ships a milestone before any injection defences.
 */
export async function runAiSelfTestAction(): Promise<ActionResult<AiSelfTestResult>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_AI")) {
      return actionError({ formError: "AI is not enabled." });
    }

    const nonce = randomUUID();

    try {
      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
      const completion = await gateway.complete<{ echo: string; ok: boolean }>({
        templateId: "self_test",
        variables: { nonce },
        ownerId: userId,
        actor: "user",
        action: "self_test",
      });

      revalidatePath("/admin/settings");
      return actionSuccess({
        provider: completion.provider,
        model: completion.model,
        tokens: completion.usage.inputTokens + completion.usage.outputTokens,
        latencyMs: completion.latencyMs,
        echoed: completion.parsed?.echo === nonce,
      });
    } catch (error) {
      // Surface our own taxonomy's message (already provider-agnostic and free
      // of request content); anything else stays generic.
      const message =
        error instanceof AiError ? error.message : "AI self-test failed. Check the server logs.";
      console.error("[ai self-test] failed:", error);
      return actionError({ formError: message });
    }
  });
}
