"use server";

import { withAdminAction } from "@/lib/actions";
import { actionError, actionSuccess, type ActionResult } from "@/lib/action-result";
import { featureEnabled } from "@/lib/featureFlags";
import { AiError } from "@/lib/ai/errors";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { getCandidateProfile } from "@/lib/career-intelligence/candidate-profile";
import { matchJobToCandidate } from "@/lib/career-intelligence/job-match";
import { getJobs, type AiDevBoardJob } from "@/lib/integrations/aidevboard/client";
import type { JobMatchRecord } from "@/types/job-match";

/**
 * Job Feed server actions (Phase 2 · AI job matching).
 *
 * The trust boundary. Everything here runs on the server: the provider API key
 * is read by the provider factory in this process and never crosses to the
 * browser, and the client sends a job ID rather than a job.
 *
 * That last point is the reason this action re-fetches the posting instead of
 * accepting one. A client-supplied job object is attacker-controlled input to a
 * model prompt and to a database write — someone could post a fabricated
 * "job" whose description is an injection payload, or overwrite another job's
 * cached verdict by sending a mismatched id. Re-fetching by id from the API we
 * already trust costs one cached HTTP call and removes both.
 */

/** Mirrors the demo query in page.tsx: the analysable set is what is on screen. */
const FEED_QUERY = { q: "LLM", workplace: "remote", limit: 5 } as const;

/** Guards the id before it reaches an API call or a `.eq()` filter. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Re-fetch one posting from the feed by id.
 *
 * Scoped to the same query the page renders, so only a job the operator can
 * actually see can be analyzed. Returns null when the id is not in that set —
 * which also covers a posting that expired between render and click.
 */
async function findJob(jobId: string): Promise<AiDevBoardJob | null> {
  const page = await getJobs(FEED_QUERY);
  return page.jobs.find((job) => job.id === jobId) ?? null;
}

export interface AnalyzeJobFitInput {
  readonly jobId: string;
  /** Bypass the cached verdict and pay for a fresh assessment. */
  readonly refresh?: boolean;
}

/**
 * Assess one job against the candidate profile.
 *
 * Runs inline rather than enqueuing, matching the M7 manual summary and the
 * Resume AI review: the operator asked and is watching, so a few seconds beats
 * a cron cycle with nothing on screen.
 */
export async function analyzeJobFitAction(
  input: AnalyzeJobFitInput,
): Promise<ActionResult<{ record: JobMatchRecord }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    // Both flags, because this feature is the intersection of two: the job
    // board supplies the posting, the AI stack supplies the verdict.
    if (!featureEnabled("FEATURE_AIDEVBOARD") || !featureEnabled("FEATURE_JOB_MATCH")) {
      return actionError({ formError: "AI job matching is not enabled." });
    }

    const jobId = typeof input?.jobId === "string" ? input.jobId.trim() : "";
    if (!UUID.test(jobId)) {
      return actionError({ formError: "That job could not be identified." });
    }

    try {
      const job = await findJob(jobId);
      if (!job) {
        return actionError({
          formError: "That job is no longer in the feed. Refresh the page and try again.",
        });
      }

      const profile = await getCandidateProfile(supabase, userId);
      const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });

      const record = await matchJobToCandidate(gateway, supabase, {
        job,
        profile,
        ownerId: userId,
        refresh: input?.refresh === true,
      });

      return actionSuccess({ record });
    } catch (error) {
      // Our own taxonomy's messages are provider-agnostic and free of request
      // content — safe to show. Anything else stays generic so an internal
      // failure cannot describe itself to the browser.
      const message = error instanceof AiError ? error.message : "Could not analyze this job.";
      console.error("[job-feed] fit analysis failed:", error);
      return actionError({ formError: message });
    }
  });
}
