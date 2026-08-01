import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { featureEnabled } from "@/lib/featureFlags";
import { AiError } from "@/lib/ai/errors";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { summarizeMessage } from "@/lib/ai/summarize";

/**
 * `ai_summarize` job handler (Phase 3 · M7.2).
 *
 * Thin by design: every decision about whether a summary happens, and what it
 * costs, lives in `lib/ai/summarize.ts`. This handler only gates, parses and
 * dispatches.
 *
 * Idempotent through the domain layer rather than through the queue. No `force`
 * is passed, so the conditional claim applies: a message summarized between
 * enqueue and execution is skipped without a provider call, and two jobs for the
 * same message produce one summary.
 *
 * Runs under the service-role client with no session, so `ownerId` travels in
 * the payload and every read and write is scoped to it explicitly (H5).
 *
 * The chain does not self-schedule — one job, one message — so the flag gate
 * below is the only thing needed to make a rollback complete. Jobs queued before
 * a flip are consumed and marked done; the operator backfill recovers them.
 */

/**
 * Whether a failure should be swallowed rather than returned to the runner.
 *
 * The runner retries anything that throws, five times with backoff. That is
 * right for a rate limit and wrong for everything else in the AI taxonomy: an
 * invalid output or an exhausted budget fails identically on every attempt, and
 * an invalid output has already been paid for once. Absorbing those completes
 * the job; the failure is still recorded in `ai_audit_log` with its taxonomy
 * code and surfaces in Settings → AI, which is where AI failures belong.
 */
export function isAbsorbable(error: unknown): boolean {
  return error instanceof AiError && !error.retryable;
}

registerJobHandler("ai_summarize", async (payload, ctx) => {
  if (!featureEnabled("FEATURE_AI_SUMMARIES")) return;

  const { entityType, entityId, ownerId } = payload;

  // A malformed payload can only come from a producer bug, and no retry fixes
  // one — but it must stay visible, so it dead-letters like M3's does rather
  // than completing quietly.
  if (entityType !== "message" || typeof entityId !== "string" || typeof ownerId !== "string") {
    throw new Error("ai_summarize: invalid payload");
  }

  try {
    const gateway = new AiGateway({ provider: getAiProvider(), client: ctx.client });
    await summarizeMessage(ctx.client, gateway, entityId, { ownerId, actor: "agent" });
  } catch (error) {
    if (isAbsorbable(error)) {
      console.error(`[ai-summarize] permanent failure for message ${entityId}:`, error);
      return;
    }
    throw error;
  }
});
