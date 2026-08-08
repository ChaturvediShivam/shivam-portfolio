"use server";

import { headers } from "next/headers";
import {
  withPublicDemoAction,
  demoSuccess,
  demoFailure,
  type DemoActionResult,
} from "@/lib/demo/publicAction";
import {
  runDeterministicAnalysis,
  validateDemoInput,
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

  return withPublicDemoAction({ turnstileToken: input.turnstileToken, visitorIp }, async () => {
    // Validated inside the wrapper rather than before it, so a malformed payload
    // still has to pass Turnstile and the visitor's allowance first. Otherwise
    // input validation becomes a free, unmetered oracle.
    const rejection = validateDemoInput(input);
    if (rejection) {
      return demoFailure("invalid_input", {
        formError: rejection.message,
        fieldErrors: { [rejection.field]: rejection.message },
      });
    }

    // No provider call in this step: the deterministic score is arithmetic over
    // text and costs nothing, which is exactly why it stays available when the
    // AI half is not. T9 adds the insight on top of this result.
    return demoSuccess(
      runDeterministicAnalysis({
        resumeText: input.resumeText,
        jobDescription: input.jobDescription,
      }),
    );
  });
}
