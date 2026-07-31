"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { withAdminAction, actionSuccess, actionError, type ActionResult } from "@/lib/actions";
import { disconnectAccount } from "@/lib/integrations";
import { featureEnabled } from "@/lib/featureFlags";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { AiError } from "@/lib/ai/errors";

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
