/**
 * Sentry — Edge runtime (Phase 6 · Sprint 1).
 *
 * Loaded by `instrumentation.ts` when the runtime is `edge`. `middleware.ts`
 * runs here, so this is what captures a failure in the auth gate that fronts
 * every `/admin/*` route — the one place an error blocks the whole product.
 */
import * as Sentry from "@sentry/nextjs";
import { isExpectedAiError, sharedSentryOptions } from "@/lib/observability/sentryOptions";

Sentry.init({
  ...sharedSentryOptions,

  beforeSend(event, hint) {
    if (isExpectedAiError(hint?.originalException)) return null;
    return event;
  },
});
