import "server-only";
import type { AiGateway } from "@/lib/ai/gateway";
import type { InsightRequest, ResumeSummaryRewrite } from "@/lib/ai-analysis/AIAnalysisTypes";
import { items, prose, text } from "@/lib/ai-analysis/grounding";

/**
 * Professional summary rewrite (Resume AI · Phase 3 · Step 2).
 *
 * Scoped to the summary alone. Bullet-level edits already come back from the
 * review call anchored to a specific line, and a whole-resume rewrite would
 * hand the operator a document they must diff against their own before trusting
 * — which is more work than writing it themselves.
 *
 * `original` is carried through unchanged so the UI can show both. A rewrite
 * presented without the text it replaced is one the operator has to accept on
 * faith.
 *
 * Skipped entirely when the resume has no summary section: there is nothing to
 * rewrite, and inventing one would mean writing claims from whole cloth.
 */

const TEMPLATE_ID = "resume_summary_rewrite";
const MAX_CHANGES = 8;

interface RewriteOutput {
  rewritten: unknown;
  changes: unknown;
}

export async function rewriteSummary(
  gateway: AiGateway,
  request: InsightRequest,
): Promise<ResumeSummaryRewrite | null> {
  if (!request.currentSummary) return null;

  const completion = await gateway.complete<RewriteOutput>({
    templateId: TEMPLATE_ID,
    ownerId: request.ownerId,
    actor: "user",
    action: "resume_summary_rewrite",
    entityType: "resume",
    variables: {
      jobTitle: request.jobTitle,
      jobKeywords: request.jobKeywords.join(", ") || "none extracted",
      detectedSkills: request.detectedSkills.join(", ") || "none detected",
      currentSummary: request.currentSummary,
      resume: request.resumeText,
    },
  });

  if (completion.stopReason !== "completed" || !completion.parsed) return null;

  const rewritten = prose(completion.parsed.rewritten);
  if (!rewritten) return null;

  const changes = items(completion.parsed.changes, MAX_CHANGES)
    .map((change) => text(change))
    .filter((change): change is string => change !== null);

  return { original: request.currentSummary, rewritten, changes };
}
