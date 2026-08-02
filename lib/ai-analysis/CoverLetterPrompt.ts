import "server-only";
import type { AiGateway } from "@/lib/ai/gateway";
import type { InsightRequest } from "@/lib/ai-analysis/AIAnalysisTypes";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import { items, prose, text } from "@/lib/ai-analysis/grounding";

/**
 * Cover letter draft (Resume AI · Phase 3 · Step 2).
 *
 * Deliberately not part of the unified analysis. The operator asked for a
 * score; producing outward-facing prose they will send under their own name is
 * a separate decision, so it is a separate action behind a separate button —
 * the same reasoning that keeps M9's email drafts from being written
 * automatically.
 *
 * `notes` exists so the model has somewhere to put what it does not know
 * (notice period, salary expectation, why this company) instead of inventing
 * it. Without that outlet a model asked for a complete letter will fill those
 * gaps confidently, and a fabricated sentence in a cover letter is one the
 * candidate has to defend out loud.
 */

const TEMPLATE_ID = "resume_cover_letter";
const MAX_NOTES = 6;

interface CoverLetterOutput {
  body: unknown;
  notes: unknown;
}

export interface CoverLetterDraft {
  body: string;
  notes: string[];
  aiProvider: string;
  aiModel: string;
  aiPromptVersion: string;
  generatedAt: string;
}

export async function draftCoverLetter(
  gateway: AiGateway,
  request: InsightRequest,
): Promise<CoverLetterDraft | null> {
  const completion = await gateway.complete<CoverLetterOutput>({
    templateId: TEMPLATE_ID,
    ownerId: request.ownerId,
    actor: "user",
    action: "resume_cover_letter",
    entityType: "resume",
    variables: {
      jobTitle: request.jobTitle,
      company: request.company ?? "the company",
      candidateName: request.candidateName ?? "the candidate",
      matchedSkills: request.matchedSkills.join(", ") || "none detected",
      jobDescription: request.jobDescriptionText,
      resume: request.resumeText,
    },
  });

  if (completion.stopReason !== "completed" || !completion.parsed) return null;

  const body = prose(completion.parsed.body);
  if (!body) return null;

  const notes = items(completion.parsed.notes, MAX_NOTES)
    .map((note) => text(note))
    .filter((note): note is string => note !== null);

  return {
    body,
    notes,
    aiProvider: completion.provider,
    aiModel: completion.model,
    aiPromptVersion: getPromptTemplate(TEMPLATE_ID).version,
    generatedAt: new Date().toISOString(),
  };
}
