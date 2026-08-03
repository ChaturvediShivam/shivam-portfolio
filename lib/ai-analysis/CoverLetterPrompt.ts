import "server-only";
import type { AiGateway } from "@/lib/ai/gateway";
import type { InsightRequest } from "@/lib/ai-analysis/AIAnalysisTypes";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import { items, prose, text } from "@/lib/ai-analysis/grounding";
import {
  COVER_LETTER_LENGTH_RULES,
  COVER_LETTER_TONE_RULES,
} from "@/lib/ai-analysis/prompts/cover-letter";
import {
  DEFAULT_COVER_LETTER_OPTIONS,
  type CoverLetterOptions,
} from "@/lib/ai-analysis/CoverLetterTypes";

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

/**
 * Salutation.
 *
 * A supplied name is used verbatim; nothing is guessed. "Dear Hiring Manager"
 * is a neutral, universally acceptable fallback, and it is strictly better than
 * a confidently wrong name on a letter the candidate signs.
 */
function salutationFor(hiringManager: string | null): string {
  const name = hiringManager?.trim();
  return name ? `Dear ${name},` : "Dear Hiring Manager,";
}

export async function draftCoverLetter(
  gateway: AiGateway,
  request: InsightRequest,
  options: CoverLetterOptions = DEFAULT_COVER_LETTER_OPTIONS,
): Promise<CoverLetterDraft | null> {
  const completion = await gateway.complete<CoverLetterOutput>({
    templateId: TEMPLATE_ID,
    // Pinned. The registry resolves the highest version when this is omitted,
    // so a future 3.0.0 would silently change this call's contract.
    templateVersion: "2.0.0",
    ownerId: request.ownerId,
    actor: "user",
    action: "resume_cover_letter",
    entityType: "resume",
    variables: {
      jobTitle: request.jobTitle,
      // The operator's override wins: the parser's company guess is frequently
      // absent or wrong, and they are looking at the posting.
      company: options.company?.trim() || request.company || "the company",
      candidateName: request.candidateName ?? "the candidate",
      matchedSkills: request.matchedSkills.join(", ") || "none detected",
      jobDescription: request.jobDescriptionText,
      resume: request.resumeText,
      tone: options.tone,
      toneRule: COVER_LETTER_TONE_RULES[options.tone] ?? COVER_LETTER_TONE_RULES.professional,
      length: options.length,
      lengthRule: COVER_LETTER_LENGTH_RULES[options.length] ?? COVER_LETTER_LENGTH_RULES.standard,
      recipient: salutationFor(options.hiringManager),
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
    aiPromptVersion: getPromptTemplate(TEMPLATE_ID, "2.0.0").version,
    generatedAt: new Date().toISOString(),
  };
}
