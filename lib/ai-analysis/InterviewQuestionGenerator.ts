import "server-only";
import type { AiGateway } from "@/lib/ai/gateway";
import {
  INTERVIEW_CATEGORIES,
  INTERVIEW_DIFFICULTIES,
  type InsightRequest,
  type InterviewQuestion,
} from "@/lib/ai-analysis/AIAnalysisTypes";
import { items, oneOf, text } from "@/lib/ai-analysis/grounding";

/**
 * Interview questions (Resume AI · Phase 3 · Step 2).
 *
 * A separate gateway call rather than more fields on the review, because the
 * two answer different questions and a single reply large enough for both is
 * one the model truncates. Splitting also means a failure here costs the
 * questions and nothing else.
 *
 * Nothing is dropped for grounding. A question is a prediction about what an
 * interviewer will ask, not a claim about the resume — there is no evidence for
 * it to misquote. The `kind` label is still validated, since the UI groups by
 * it.
 */

const TEMPLATE_ID = "resume_interview_questions";
/** Pinned: the registry resolves the highest version when this is omitted. */
const TEMPLATE_VERSION = "2.0.0";
const MAX_QUESTIONS = 12;

interface InterviewOutput {
  questions: unknown;
}

export async function generateInterviewQuestions(
  gateway: AiGateway,
  request: InsightRequest,
): Promise<InterviewQuestion[]> {
  const completion = await gateway.complete<InterviewOutput>({
    templateId: TEMPLATE_ID,
    templateVersion: TEMPLATE_VERSION,
    ownerId: request.ownerId,
    actor: "user",
    action: "resume_interview_questions",
    entityType: "resume",
    variables: {
      jobTitle: request.jobTitle,
      detectedSkills: request.detectedSkills.join(", ") || "none detected",
      missingSkills: request.missingSkills.join(", ") || "none",
      responsibilities: request.responsibilities.join("; ") || "none listed",
      resume: request.resumeText,
    },
  });

  if (completion.stopReason !== "completed" || !completion.parsed) return [];

  const questions: InterviewQuestion[] = [];

  for (const entry of items(completion.parsed.questions, MAX_QUESTIONS)) {
    const row = entry as Record<string, unknown>;
    const question = text(row.question);
    const rationale = text(row.rationale);
    if (!question || !rationale) continue;

    questions.push({
      question,
      rationale,
      // An unrecognised label falls back rather than dropping the question: the
      // question itself is the value, and the label only decides which heading
      // it renders under.
      category: oneOf(row.category, INTERVIEW_CATEGORIES) ?? "behavioural",
      difficulty: oneOf(row.difficulty, INTERVIEW_DIFFICULTIES) ?? "mid",
    });
  }

  return questions;
}
