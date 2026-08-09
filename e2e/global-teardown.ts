import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { localEnv } from "./support/env";
import { FIXTURE_DIR } from "./global-setup";

/**
 * Remove the throttle rows this run created.
 *
 * The suite writes to the shared Supabase project, so it cleans up after
 * itself. Scoped by timestamp rather than truncating the table: deleting rows
 * this run did not create would be a different and worse habit, even on a table
 * that is currently empty in production.
 *
 * ai_audit_log and ai_usage_counters are deliberately NOT cleaned. Those record
 * real spend against the demo owner, and an audit trail that a test can erase
 * is not an audit trail.
 */
export default async function teardown() {
  const env = localEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[e2e teardown] Supabase not configured; leaving demo_usage untouched.");
    return;
  }

  let startedAt: string;
  try {
    startedAt = readFileSync(join(FIXTURE_DIR, "started-at.txt"), "utf8").trim();
  } catch {
    console.warn("[e2e teardown] no start marker; leaving demo_usage untouched.");
    return;
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await db.from("demo_usage").delete().gte("created_at", startedAt);

  if (error) {
    console.warn(`[e2e teardown] cleanup failed: ${error.message}`);
    return;
  }

  const { count } = await db.from("demo_usage").select("id", { count: "exact", head: true });
  console.log(`[e2e teardown] demo_usage rows remaining: ${count ?? 0}`);
}
