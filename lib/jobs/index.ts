/**
 * Background job platform (Phase 3 · M1) — public surface.
 *
 * Server-only modules (queue/runner/context) are re-exported for convenient
 * server-side imports; the pure types come from `./types`.
 */

export type {
  JobStatus,
  JobType,
  JobRow,
  JobHandler,
  EnqueueOptions,
  JobsHealth,
} from "./types";

export type { JobContext } from "./context";
export { createJobContext } from "./context";

export {
  enqueueJob,
  claimJobs,
  markJobDone,
  markJobFailed,
  getJobsHealth,
} from "./queue";

export {
  runJobs,
  registerJobHandler,
  hasJobHandler,
  computeBackoffMs,
  type BackoffOptions,
  type RunResult,
} from "./runner";
