import "server-only";
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { EnqueueOptions, JobRow, JobsHealth } from "./types";

/**
 * Job queue data layer (Phase 3 · M1).
 *
 * Every function accepts an explicit Supabase client so the caller controls the
 * auth context: the cron drainer passes a service-role client (no session), the
 * Settings health panel passes the session-bound client (RLS-scoped read).
 */

const MAX_ERROR_LEN = 2000;
const UNIQUE_VIOLATION = "23505";
const UNDEFINED_TABLE = "42P01";

/**
 * Enqueue a job. When an `idempotencyKey` is supplied and already exists, the
 * insert is a no-op and the existing row is returned — so at-least-once
 * producers can safely retry.
 */
export async function enqueueJob(
  client: SupabaseClient,
  options: EnqueueOptions,
): Promise<JobRow | null> {
  const row = {
    type: options.type,
    payload: options.payload ?? {},
    run_after: (options.runAfter ?? new Date()).toISOString(),
    max_attempts: options.maxAttempts ?? 5,
    idempotency_key: options.idempotencyKey ?? null,
    priority: options.priority ?? 0,
    owner_id: options.ownerId ?? null,
  };

  const { data, error } = await client.from("jobs").insert(row).select("*").single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION && row.idempotency_key) {
      const { data: existing } = await client
        .from("jobs")
        .select("*")
        .eq("idempotency_key", row.idempotency_key)
        .maybeSingle();
      return (existing as JobRow | null) ?? null;
    }
    throw error;
  }

  return data as JobRow;
}

/**
 * Atomically lease up to `batchSize` runnable jobs via the `claim_jobs` RPC
 * (FOR UPDATE SKIP LOCKED). Returns the leased rows in run order.
 */
export async function claimJobs(
  client: SupabaseClient,
  batchSize = 10,
): Promise<JobRow[]> {
  const { data, error } = await client.rpc("claim_jobs", { batch_size: batchSize });
  if (error) throw error;
  return (data as JobRow[] | null) ?? [];
}

/** Mark a job completed. */
export async function markJobDone(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from("jobs")
    .update({ status: "done", locked_at: null, last_error: null })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Record a failed attempt. If the job has exhausted `max_attempts` (or the
 * failure is fatal), it is dead-lettered (`status = 'failed'`); otherwise it is
 * rescheduled to `now + backoffMs` and returned to the pending pool.
 */
export async function markJobFailed(
  client: SupabaseClient,
  job: Pick<JobRow, "id" | "attempts" | "max_attempts">,
  message: string,
  options: { backoffMs?: number; fatal?: boolean } = {},
): Promise<void> {
  const lastError = message.slice(0, MAX_ERROR_LEN);
  const deadLetter = options.fatal === true || job.attempts >= job.max_attempts;

  const patch = deadLetter
    ? { status: "failed" as const, locked_at: null, last_error: lastError }
    : {
        status: "pending" as const,
        locked_at: null,
        last_error: lastError,
        run_after: new Date(Date.now() + (options.backoffMs ?? 0)).toISOString(),
      };

  const { error } = await client.from("jobs").update(patch).eq("id", job.id);
  if (error) throw error;
}

/**
 * Aggregate queue health for the Settings panel. Returns `null` when the queue
 * is not available yet (e.g. the M1 migration has not been applied), so the UI
 * degrades gracefully instead of erroring.
 */
export async function getJobsHealth(client: SupabaseClient): Promise<JobsHealth | null> {
  const statuses = ["pending", "running", "done", "failed"] as const;

  try {
    const results = await Promise.all(
      statuses.map((status) =>
        client.from("jobs").select("id", { count: "exact", head: true }).eq("status", status),
      ),
    );

    for (const r of results) {
      const err = r.error as PostgrestError | null;
      if (err) {
        if (err.code === UNDEFINED_TABLE) return null; // migration not applied yet
        throw err;
      }
    }

    return {
      pending: results[0].count ?? 0,
      running: results[1].count ?? 0,
      done: results[2].count ?? 0,
      failed: results[3].count ?? 0,
    };
  } catch {
    return null;
  }
}
