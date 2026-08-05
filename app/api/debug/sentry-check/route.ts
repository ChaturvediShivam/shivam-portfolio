import { NextResponse } from "next/server";

/**
 * TEMPORARY — Sentry end-to-end verification (Phase 6 · Sprint 1).
 *
 * Deliberately throws so a real production error can be traced through the
 * pipeline: capture -> ingest -> symbolication against the uploaded source
 * maps. Remove once verified.
 *
 * Inert unless SENTRY_TEST_KEY is set AND the caller supplies it. An endpoint
 * that throws on request is a noise vector — anyone who found it could fill the
 * error quota — so the default answer is 404, indistinguishable from a route
 * that does not exist.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.SENTRY_TEST_KEY;
  const supplied = new URL(request.url).searchParams.get("key");

  if (!expected || supplied !== expected) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Distinctive message so it is unambiguous in Sentry which event this was.
  throw new Error("Sentry production verification — deliberate test error (Phase 6 Sprint 1)");
}
