/**
 * Next.js instrumentation hook (Phase 6 · Sprint 1).
 *
 * Runs once per server runtime at startup. The dynamic imports are required
 * rather than stylistic: importing the Node config into an Edge bundle pulls in
 * Node built-ins the Edge runtime does not have, and the build fails.
 *
 * `onRequestError` is exported so React Server Component render errors are
 * reported. Without it those are logged by Next and never reach Sentry.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  // TEMPORARY diagnostic — proving whether Vercel invokes this hook at all.
  console.log(
    `[sentry-instrumentation] register() runtime=${process.env.NEXT_RUNTIME} dsn=${
      process.env.NEXT_PUBLIC_SENTRY_DSN ? "set" : "MISSING"
    }`,
  );

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
