/**
 * Sentry — Node.js server runtime (Phase 6 · Sprint 1).
 *
 * Loaded by `instrumentation.ts` when the runtime is `nodejs`. This is the file
 * that covers Server Actions, Route Handlers and API routes, all of which the
 * SDK wraps automatically during the build.
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
