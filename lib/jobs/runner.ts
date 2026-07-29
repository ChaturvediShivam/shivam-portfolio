import "server-only";
import type { JobContext } from "./context";
import type { JobHandler } from "./types";
import { claimJobs, markJobDone, markJobFailed } from "./queue";

/**
 * Job runner (Phase 3 · M1).
 *
 * Claims a bounded batch, dispatches each job to its registered handler, and
 * resolves it: success -> done; retryable failure -> exponential backoff +
 * reschedule; exhausted / unknown type -> dead-letter. All handlers are
 * idempotent, so re-running a job (at-least-once delivery) is safe.
 */

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

const registry = new Map<string, JobHandler>();

/** Register (or replace) the handler for a job type. */
export function registerJobHandler(type: string, handler: JobHandler): void {
  registry.set(type, handler);
}

/** True when a handler is registered for `type`. */
export function hasJobHandler(type: string): boolean {
  return registry.has(type);
}

// Platform self-test handler: an idempotent no-op used to verify the pipeline
// (enqueue -> claim -> done) in smoke tests. Real handlers are registered by
// their owning milestone (M3+/M5/M7/M8/M10).
registerJobHandler("noop", async () => {
  /* intentionally does nothing */
});

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

export interface BackoffOptions {
  /** First-retry delay in ms (default 30s). */
  baseMs?: number;
  /** Growth factor per attempt (default 2). */
  factor?: number;
  /** Maximum delay in ms (default 1h). */
  capMs?: number;
  /** Fractional jitter, 0..1 (default 0.2 -> ±20%). */
  jitter?: number;
}

/**
 * Exponential backoff with jitter for the Nth failed attempt (1-based).
 * Pure and deterministic except for the jitter term — exported for testing.
 */
export function computeBackoffMs(attempts: number, options: BackoffOptions = {}): number {
  const { baseMs = 30_000, factor = 2, capMs = 3_600_000, jitter = 0.2 } = options;
  const exponent = Math.max(0, attempts - 1);
  const raw = Math.min(capMs, baseMs * Math.pow(factor, exponent));
  const jittered = raw * (1 + (Math.random() * 2 - 1) * jitter);
  return Math.max(0, Math.round(jittered));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunResult {
  /** Jobs that completed successfully this tick. */
  processed: number;
  /** Jobs that failed (rescheduled or dead-lettered) this tick. */
  failed: number;
}

/**
 * Drain a single bounded batch and return the outcome. Designed to run to
 * completion well within the serverless function time limit; the cron tick
 * re-invokes it to drain the remaining backlog.
 */
export async function runJobs(
  ctx: JobContext,
  options: { limit?: number } = {},
): Promise<RunResult> {
  const limit = options.limit ?? 10;
  const jobs = await claimJobs(ctx.client, limit);

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = registry.get(job.type);

    if (!handler) {
      // Unknown type is a permanent (fatal) failure — no amount of retrying
      // will register a handler at runtime.
      await markJobFailed(
        ctx.client,
        job,
        `No handler registered for job type "${job.type}"`,
        { fatal: true },
      );
      failed += 1;
      continue;
    }

    try {
      await handler(job.payload ?? {}, ctx);
      await markJobDone(ctx.client, job.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markJobFailed(ctx.client, job, message, { backoffMs: computeBackoffMs(job.attempts) });
      failed += 1;
    }
  }

  return { processed, failed };
}
