/**
 * Sentry — browser runtime (Phase 6 · Sprint 1).
 *
 * The v10 convention for App Router. Next.js loads this on the client before
 * hydration, which is what lets it catch errors thrown during render in React
 * components, not only after mount.
 *
 * Errors from the client half of a Server Action call surface here; the server
 * half surfaces in `sentry.server.config.ts`. Both carry the same release, so a
 * single failure that crosses the boundary correlates.
 */
import * as Sentry from "@sentry/nextjs";
import { isExpectedAiError, sharedSentryOptions } from "@/lib/observability/sentryOptions";

Sentry.init({
  ...sharedSentryOptions,

  beforeSend(event, hint) {
    // Deliberate control flow, not a defect — see sentryOptions.
    if (isExpectedAiError(hint?.originalException)) return null;
    return event;
  },
});

/** Required by Next.js to report navigation errors from the App Router. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
