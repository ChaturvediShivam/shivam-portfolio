import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * TEMPORARY — Sentry end-to-end verification (Phase 6 · Sprint 1).
 *
 * Two modes, both gated:
 *   ?key=...           reports server-side SDK state as JSON
 *   ?key=...&throw=1   throws, so a real error traverses the pipeline
 *
 * The state mode exists because absence of a log line is weak evidence — a
 * serverless cold-start `console.log` may simply never reach the log stream.
 * Returning the state in the response body proves what the server actually has.
 *
 * Inert unless SENTRY_TEST_KEY is set AND supplied; otherwise 404, so it is
 * indistinguishable from a route that does not exist. Remove once verified.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.SENTRY_TEST_KEY;
  const url = new URL(request.url);

  if (!expected || url.searchParams.get("key") !== expected) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (url.searchParams.get("throw") === "1") {
    throw new Error("Sentry production verification — deliberate test error (Phase 6 Sprint 1)");
  }

  // Explicit capture + awaited flush. If this delivers but `throw=1` does not,
  // the SDK and transport are fine and the gap is that nothing keeps the
  // serverless function alive long enough for the automatic path to flush.
  if (url.searchParams.get("capture") === "1") {
    const eventId = Sentry.captureException(
      new Error("Sentry production verification — explicit capture (Phase 6 Sprint 1)"),
    );
    const flushed = await Sentry.flush(5000);
    return NextResponse.json({ eventId, flushed });
  }

  const client = Sentry.getClient();

  return NextResponse.json({
    // The decisive field: a client exists only if Sentry.init actually ran,
    // which on the server happens only via instrumentation.ts register().
    sdkInitialised: Boolean(client),
    dsnConfiguredOnServer: Boolean(client?.getOptions().dsn),
    enabled: client?.getOptions().enabled ?? null,
    environment: client?.getOptions().environment ?? null,
    release: client?.getOptions().release ?? null,
    runtime: process.env.NEXT_RUNTIME ?? null,
    dsnEnvVarPresent: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
