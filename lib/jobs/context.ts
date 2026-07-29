import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Execution context handed to every job handler (Phase 3 · M1).
 *
 * Freeze-review decision H5: background jobs are triggered by Vercel Cron and
 * therefore run with NO user session — RLS (`auth.role() = 'authenticated'`)
 * cannot scope them. They use the service-role client, which bypasses RLS, so
 * handlers MUST scope every read/write to `owner_id` explicitly. The
 * interactive AI copilot (a future milestone) keeps the session-bound,
 * RLS-scoped client instead; the two paths are deliberately distinct.
 */
export interface JobContext {
  /** Service-role Supabase client (RLS-bypassing — scope by owner_id in code). */
  readonly client: SupabaseClient;
}

/** Build the job execution context for a drainer run. */
export function createJobContext(): JobContext {
  return { client: createServiceClient() };
}
