"use server";

import { headers } from "next/headers";
import { featureEnabled } from "@/lib/featureFlags";
import { demoDailyTokenBudget } from "@/lib/demo/config";
import { logDemoEvent, type AiSkipReason } from "@/lib/demo/telemetry";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { generateInsights } from "@/lib/ai-analysis/ResumeInsightsService";
import {
  withPublicDemoAction,
  demoSuccess,
  demoFailure,
  type DemoActionResult,
  type DemoContext,
} from "@/lib/demo/publicAction";
import {
  runDeterministicAnalysis,
  resolveDemoResume,
  validateDemoInput,
  AI_UNAVAILABLE_NOTE,
  type DemoAnalysisData,
  type DemoAnalysisInput,
} from "@/lib/demo/analysis";

/**
 * The public demo's only server entry point.
 *
 * Deliberately thin. Everything it does that is worth testing lives in
 * `lib/demo/*` — the gates in publicAction, the scoring in analysis — so this
 * file holds only the two things that genuinely belong to the request: reading
 * the visitor's address off the incoming headers, and mapping a validation
 * rejection onto a result the form can render.
 *
 * A Server Action rather than a route handler: Next gives these origin checks
 * for free, which is one fewer thing to get right on an endpoint with no session.
 */

/**
 * Resolve the visitor's address from proxy headers.
 *
 * Vercel sets x-forwarded-for, whose leftmost entry is the client and whose
 * remainder is the proxy chain. The chain is attacker-controllable — anyone can
 * send the header — so this is used only for throttling and Turnstile, never for
 * authorization. Worst case a visitor forges a fresh address per request and
 * buys themselves the per-visitor allowance again; the global budget still
 * bounds what that can cost.
 */
async function visitorAddress(): Promise<string | null> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return list.get("x-real-ip");
}

export async function analyzeDemoAction(
  input: DemoAnalysisInput & { turnstileToken: string | null },
): Promise<DemoActionResult<DemoAnalysisData>> {
  const visitorIp = await visitorAddress();

  return withPublicDemoAction({ turnstileToken: input.turnstileToken, visitorIp }, async (context) => {
    // Validated inside the wrapper rather than before it, so a malformed payload
    // still has to pass Turnstile and the visitor's allowance first. Otherwise
    // input validation becomes a free, unmetered oracle.
    const rejection = validateDemoInput(input);
    if (rejection) {
      logDemoEvent("invalid_input");
      return demoFailure("invalid_input", {
        formError: rejection.message,
        fieldErrors: { [rejection.field]: rejection.message },
      });
    }

    // The deterministic score is arithmetic over text and costs nothing, which
    // is why it runs first and unconditionally. Everything after this point is
    // additive: the visitor already has a complete, correct result.
    const data = runDeterministicAnalysis({
      resumeText: input.resumeText,
      jobDescription: input.jobDescription,
    });

    const started = Date.now();
    const enriched = await withAiReview(data, context, input);

    // Always emitted on success, so the deterministic half's health is visible
    // even when every review is being skipped.
    logDemoEvent("analysis_ok", {
      score: enriched.analysis.overallScore,
      sample: enriched.usedSampleResume && enriched.usedSampleJobDescription,
      ms: Date.now() - started,
    });

    return demoSuccess(enriched);
  });
}

/**
 * Add the AI review to a finished deterministic result.
 *
 * Never throws and never fails the request. Every way this can go wrong — the
 * budget is spent, a flag is off, the provider is down, the model returns
 * nothing gradeable — degrades to the same outcome: the scores the visitor came
 * for, plus one sentence saying the review is missing. A demo that shows a
 * blank page because the AI half was unaffordable demonstrates nothing.
 *
 * Budget, the burst limiter, redaction and the audit row are NOT handled here.
 * `AiGateway` already owns all four, so duplicating any of them would create a
 * second, divergent policy for the same call.
 */
async function withAiReview(
  data: DemoAnalysisData,
  context: DemoContext,
  input: DemoAnalysisInput,
): Promise<DemoAnalysisData> {
  // The shared ceiling is spent. Checked before the flags because it is the
  // reason a working demo stops mid-day, and it is worth logging as distinct
  // from never having been switched on.
  if (!context.aiBudgetAvailable) return skipAi(data, "budget");

  // The gateway throws AiDisabledError without FEATURE_AI. Checking both here
  // turns that into a graceful skip rather than a caught exception, and keeps
  // the demo's AI half switchable independently of the deterministic half.
  if (!featureEnabled("FEATURE_AI") || !featureEnabled("FEATURE_RESUME_AI")) {
    return skipAi(data, "flag_off");
  }

  try {
    const gateway = new AiGateway({ provider: getAiProvider(), client: context.supabase });

    const insights = await generateInsights(
      gateway,
      {
        resume: resolveDemoResume(input),
        jobDescription: data.posting,
        analysis: data.analysis,
        // Owned by the dedicated demo user, so demo spend is attributable and
        // never lands on the operator's ledger.
        ownerId: context.ownerId,
        // The ceiling the demo advertises, carried into the atomic reservation
        // rather than left to the preflight alone. Without it a burst of
        // concurrent visitors could each pass the preflight and then reserve
        // against the operator's much larger budget.
        budgetLimit: demoDailyTokenBudget(),
      },
      // No enrichment: that adds interview questions, LinkedIn copy and a
      // rewrite as three further provider calls. One call is what a demo needs
      // and four is what it costs, so this stays at one.
      {},
    );

    return insights
      ? { ...data, aiInsights: insights, aiNote: null }
      : // The model answered with nothing gradeable. Not an error — the score
        // on screen is unaffected and complete.
        skipAi(data, "ungradeable");
  } catch (error) {
    // Includes budget refusal, the burst limiter, provider outages and malformed
    // output. All of it is logged; none of it reaches the visitor, and none of
    // it costs them the analysis.
    console.error("[demo] ai review failed, returning deterministic result only:", error);
    logDemoEvent("provider_failed");
    return skipAi(data, "provider_error");
  }
}

/**
 * Record why the review is absent and attach the note.
 *
 * One place, so every skip is both visible in the logs and identical on screen:
 * a visitor learns nothing about which of the four reasons applied, and the
 * operator learns exactly which.
 */
function skipAi(data: DemoAnalysisData, reason: AiSkipReason): DemoAnalysisData {
  logDemoEvent("ai_unavailable", { reason });
  return { ...data, aiInsights: null, aiNote: AI_UNAVAILABLE_NOTE };
}
