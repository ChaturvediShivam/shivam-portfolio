/**
 * Job queue types (Phase 3 · M1).
 *
 * Pure types — intentionally NOT `server-only` so both the server-only queue/
 * runner and any server component (e.g. the Settings health panel) can share
 * them. No runtime is imported here.
 */

import type { JobContext } from "./context";

/** Lifecycle of a queued job. Mirrors the `job_status` Postgres enum. */
export type JobStatus = "pending" | "running" | "done" | "failed";

/**
 * Known job types across Phase 3. The queue itself is type-agnostic; handlers
 * are registered by their owning milestone. M1 ships only the platform and the
 * internal `noop` self-test — the remaining types are declared for downstream
 * typing but have no handler until their milestone lands.
 */
export type JobType =
  | "noop"
  | "gmail_sync"
  | "calendar_sync"
  | "ai_summarize"
  | "ai_embed"
  | "notification_dispatch"
  | "automation_run";

/** A row of the `jobs` table as returned by PostgREST. */
export interface JobRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  priority: number;
  run_after: string;
  locked_at: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Options for enqueuing a job. */
export interface EnqueueOptions {
  /** Job type; dispatched to the matching handler by the runner. */
  type: JobType | (string & {});
  /** Handler-specific payload (defaults to `{}`). */
  payload?: Record<string, unknown>;
  /** Earliest time the job may run (defaults to now). */
  runAfter?: Date;
  /** Retry ceiling before dead-lettering (defaults to 5). */
  maxAttempts?: number;
  /** Dedupe key; a second enqueue with the same key is a no-op. */
  idempotencyKey?: string | null;
  /** Higher runs first (defaults to 0). */
  priority?: number;
  /** Owning user; null for system jobs. */
  ownerId?: string | null;
}

/** Aggregate queue health for the Settings panel. */
export interface JobsHealth {
  pending: number;
  running: number;
  done: number;
  /** Jobs that exhausted their retries (`status = 'failed'`). */
  failed: number;
}

/**
 * A job handler: an idempotent unit of async work. Handlers receive the job
 * payload and a {@link JobContext}. They must be safe to re-run (at-least-once
 * delivery) and — because jobs run without a user session — must scope every
 * read/write to `owner_id` explicitly (the service-role client bypasses RLS).
 */
export type JobHandler = (
  payload: Record<string, unknown>,
  ctx: JobContext,
) => Promise<void>;
