import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { featureEnabled } from "@/lib/featureFlags";
import { createJobContext } from "@/lib/jobs/context";
import { runJobs } from "@/lib/jobs/runner";

/**
 * Cron-triggered job drainer (Phase 3 · M1).
 *
 * `POST|GET /api/jobs/run` — invoked by Vercel Cron (which sends
 * `Authorization: Bearer <CRON_SECRET>`). Authenticated by a shared secret with
 * a constant-time compare — never a user session. Runs on the Node runtime
 * (crypto + Supabase SDK) and is always dynamic (never cached/prerendered).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 100;
const DEFAULT_BATCH = 25;

/** Constant-time check of the provided secret against `CRON_SECRET`. */
function isAuthorized(req: NextRequest, secret: string): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const provided = bearer || req.headers.get("x-cron-secret") || "";
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch — guard first (length is not
  // itself secret).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest): Promise<NextResponse> {
  // Flag off -> fully inert: acknowledge without draining.
  if (!featureEnabled("FEATURE_JOBS")) {
    return NextResponse.json({ processed: 0, failed: 0, skipped: true }, { status: 200 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Refuse to run an unauthenticated drainer rather than fail open.
    console.error("[jobs/run] CRON_SECRET is not configured; refusing to run.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const limitParam = Number(new URL(req.url).searchParams.get("limit"));
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), MAX_BATCH)
        : DEFAULT_BATCH;

    const result = await runJobs(createJobContext(), { limit });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[jobs/run] runner error:", err);
    return NextResponse.json({ error: "Job runner failed." }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

// Vercel Cron issues GET requests; support both verbs with identical handling.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
