import "server-only";
import type { AiGateway } from "@/lib/ai/gateway";
import type {
  InsightRequest,
  InterviewQuestion,
  InterviewQuestionKind,
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
const MAX_QUESTIONS = 12;

const KINDS: readonly InterviewQuestionKind[] = ["technical", "behavioural", "gap_probe"];

interface InterviewOutput {
  questions: unknown;
}

export async function generateInterviewQuestions(
  gateway: AiGateway,
  request: InsightRequest,
): Promise<InterviewQuestion[]> {
  const completion = await gateway.complete<InterviewOutput>({
    templateId: TEMPLATE_ID,
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
      kind: oneOf(row.kind, KINDS) ?? "behavioural",
    });
  }

  return questions;
}
