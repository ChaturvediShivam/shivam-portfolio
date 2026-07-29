import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import { featureEnabled } from "@/lib/featureFlags";
import { getJobsHealth } from "@/lib/jobs/queue";

/**
 * Job queue health endpoint (Phase 3 · M1).
 *
 * `GET /api/jobs/health` — read-only queue health (pending / running / done /
 * dead-letter) for operators and external monitors. Guarded by the admin
 * session (`requireAdminSession`), read through the session-bound RLS client —
 * never the service role. Returns `{ enabled: false }` when the feature flag is
 * off and `health: null` when the queue table is not available yet (migration
 * not applied), so the endpoint never errors on those expected states.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  if (!featureEnabled("FEATURE_JOBS")) {
    return NextResponse.json({ enabled: false, health: null }, { status: 200 });
  }

  const health = await getJobsHealth(supabase);
  return NextResponse.json({ enabled: true, health }, { status: 200 });
}
