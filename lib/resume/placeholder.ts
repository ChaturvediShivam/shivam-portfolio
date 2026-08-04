/**
 * Resume AI seams (Resume AI · Step 1) — INTERFACES ONLY, NO IMPLEMENTATIONS.
 *
 * This file exists to fix the shape of the later steps before any of them is
 * written, so the upload flow shipped in Step 1 cannot accidentally be designed
 * in a way that will not carry them. Nothing here is called; nothing here has a
 * body. Deleting it would change no behaviour today, and would remove the only
 * written record of what Step 2 must satisfy.
 *
 * Three deliberate constraints, each mirroring how the existing AI layer is
 * already built — so that when these are implemented they slot into the
 * milestone architecture rather than beside it:
 *
 *   1. NO VENDOR NAMES. `ResumeAnalyzer` takes an `AiGateway`, exactly as
 *      `lib/ai/summarize.ts` and `lib/ai/inbox.ts` do. Every AI call in this
 *      codebase goes through that one gateway so flag gating, the token budget,
 *      redaction and `ai_audit_log` cannot be bypassed. An analyzer holding its
 *      own provider client would sidestep all four.
 *
 *   2. PARSERS ARE AN INTERFACE, NOT A FUNCTION. PDF and DOCX extraction are
 *      different enough, and their libraries heavy enough, that the choice
 *      should stay swappable — the same reasoning that put `AiProvider` behind
 *      an interface in M6.
 *
 *   3. EXTRACTION IS SEPARATE FROM ANALYSIS. Parsing is deterministic and
 *      cheap; analysis is billed and non-deterministic. Keeping them apart
 *      means a re-analysis never re-parses, and a parser bug can be fixed and
 *      re-run without spending tokens.
 */

import type { AiGateway } from "@/lib/ai/gateway";
import type { AcceptedDocumentType, UploadedDocument } from "@/types/upload";
import type { ParsedResume, ResumeProfile } from "@/types/resume";
import type { ResumeAnalysis } from "@/types/resume-analysis";
import type { JobRequirements, ResolvedJobDescription } from "@/types/job-description";

/**
 * Extracts text from one document format.
 *
 * Step 2 supplies one implementation per format and a registry that picks by
 * `AcceptedDocumentType`, mirroring `lib/ai/providers/index.ts`.
 */
export interface DocumentParser {
  /** Opaque provenance recorded on the result. Never branched on. */
  readonly name: string;
  readonly supports: AcceptedDocumentType;
  parse(document: UploadedDocument): Promise<ParsedResume>;
}

/**
 * Turns extracted text into structure.
 *
 * Separate from `DocumentParser` because structuring may itself use the model,
 * while extraction never should.
 */
export interface ResumeStructurer {
  structure(parsed: ParsedResume, gateway: AiGateway, ownerId: string): Promise<ResumeProfile>;
}

export interface JobDescriptionStructurer {
  structure(
    jobDescription: ResolvedJobDescription,
    gateway: AiGateway,
    ownerId: string,
  ): Promise<JobRequirements>;
}

/**
 * Compares a resume against a job description.
 *
 * SUPERSEDED IN PHASE 3 by `lib/resume-analysis/ResumeAnalysisService.ts`,
 * which computes the analysis deterministically and needs no gateway at all.
 * The interface is kept because the store below still refers to the result
 * shape, but nothing should implement it — the AI layer's remaining job is
 * `RecommendationEngine`, not scoring.
 */
export interface ResumeAnalyzer {
  analyze(input: {
    resume: ParsedResume;
    jobDescription: ResolvedJobDescription;
    gateway: AiGateway;
    ownerId: string;
  }): Promise<ResumeAnalysis>;
}

/**
 * Derived artefacts built from an existing analysis.
 *
 * Grouped into one interface because they share a precondition — an analysis
 * must already exist — and because each is a separate billed call the operator
 * should ask for individually rather than receive automatically.
 */
export interface ResumeAssistant {
  rewriteResume(analysisId: string, gateway: AiGateway, ownerId: string): Promise<string>;
  draftCoverLetter(analysisId: string, gateway: AiGateway, ownerId: string): Promise<string>;
  suggestInterviewQuestions(analysisId: string, gateway: AiGateway, ownerId: string): Promise<string[]>;
}

/**
 * Persistence seam.
 *
 * Declared so Step 1's UI can be written against "there will be a history"
 * without guessing its shape. No table exists yet; adding one is additive, in
 * the same style as every other migration in this project.
 */
export interface ResumeAnalysisStore {
  save(analysis: ResumeAnalysis, ownerId: string): Promise<ResumeAnalysis>;
  get(id: string, ownerId: string): Promise<ResumeAnalysis | null>;
  listForOwner(ownerId: string, limit: number): Promise<ResumeAnalysis[]>;
}
