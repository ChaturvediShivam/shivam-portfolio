/**
 * Career Intelligence — AI service contracts (Phase 1).
 *
 * Interfaces only. Nothing here calls a model, and no implementation exists
 * yet; Phase 2+ implements these on top of the existing AI gateway
 * (`lib/ai/gateway.ts`) and budget/audit layers, which already handle provider
 * selection, cost ceilings and logging.
 *
 * Two rules inherited from the existing AI architecture, and deliberately
 * encoded in these types rather than left to prompts:
 *
 * 1. **Enrich, don't produce.** Where a deterministic engine already computes a
 *    value, the model may not compete with it. `lib/ai-analysis` proves the
 *    pattern: `AiResumeInsights` has no score field, so there is physically
 *    nowhere for a model to write a number that overrides the engine's.
 *
 * 2. **Grounding is structural.** Every extraction returns `evidence` — text
 *    the model must have copied from the supplied source. `lib/ai-analysis/
 *    grounding.ts` rejects claims whose evidence is not present in the corpus;
 *    these contracts carry the same field so the same check applies.
 */

import type { NormalizedApplication } from "@/lib/career-intelligence/providers/types";
import type { DocumentKind } from "@/types/career-intelligence";

/**
 * A single model-produced claim. `evidence` must be a verbatim span from the
 * source; a claim that cannot be grounded is dropped by the caller, not
 * silently trusted.
 */
export interface Grounded<T> {
  readonly value: T;
  readonly evidence: string;
  /** 0..1. Advisory only — never a substitute for grounding. */
  readonly confidence: number;
}

/** Provenance recorded on every AI-written row (see the `ai_*` columns). */
export interface AiRunProvenance {
  readonly model: string;
  readonly promptVersion: string;
  readonly processedAt: string;
}

export interface AiResult<T> {
  readonly data: T;
  readonly provenance: AiRunProvenance;
  /** Claims rejected during grounding, kept so drift is visible not invisible. */
  readonly dropped: readonly string[];
}

/** Free text plus whatever structured context the caller already knows. */
export interface ExtractionSource {
  readonly text: string;
  readonly subject?: string | null;
  readonly fromAddress?: string | null;
  readonly url?: string | null;
}

// ---------------------------------------------------------------------------
// Extraction services — turn unstructured source material into domain values.
// ---------------------------------------------------------------------------

export interface CompanyExtraction {
  readonly name: Grounded<string> | null;
  readonly domain: Grounded<string> | null;
  readonly website: Grounded<string> | null;
}

export interface CompanyExtractionService {
  extractCompany(source: ExtractionSource): Promise<AiResult<CompanyExtraction>>;
}

export interface RecruiterExtraction {
  readonly fullName: Grounded<string> | null;
  readonly email: Grounded<string> | null;
  readonly title: Grounded<string> | null;
  readonly company: Grounded<string> | null;
}

export interface RecruiterExtractionService {
  extractRecruiter(source: ExtractionSource): Promise<AiResult<RecruiterExtraction>>;
}

export interface SalaryExtraction {
  readonly min: Grounded<number> | null;
  readonly max: Grounded<number> | null;
  readonly currency: Grounded<string> | null;
  readonly period: Grounded<"hour" | "month" | "year"> | null;
}

export interface SalaryExtractionService {
  extractSalary(source: ExtractionSource): Promise<AiResult<SalaryExtraction>>;
}

/**
 * ATS scoring.
 *
 * Per rule 1 above: where `lib/resume-analysis` can compute a deterministic
 * parseability score, that engine is authoritative and this service supplies
 * only the findings it cannot compute (formatting risks, section detection
 * misses). The numeric `score` is present because ATS parseability has no
 * complete deterministic engine today — when one lands, this field is the one
 * to remove.
 */
export interface AtsScoreAssessment {
  readonly score: number;
  readonly findings: readonly Grounded<string>[];
  readonly blockers: readonly Grounded<string>[];
}

export interface AtsScoreService {
  scoreAts(resumeText: string, jobDescription?: string | null): Promise<AiResult<AtsScoreAssessment>>;
}

// ---------------------------------------------------------------------------
// Generation services — produce drafts for human approval.
// ---------------------------------------------------------------------------

/**
 * Generated output is a draft. Nothing in this layer may send, publish, or
 * persist as final without passing through the existing approvals flow
 * (`lib/approvals.ts`).
 */
export interface GeneratedDraft {
  readonly body: string;
  readonly subject?: string | null;
}

export interface FollowUpService {
  generateFollowUp(input: {
    readonly opportunityId: string;
    readonly lastContactAt?: string | null;
    readonly threadSummary?: string | null;
  }): Promise<AiResult<GeneratedDraft>>;
}

export interface CoverLetterService {
  generateCoverLetter(input: {
    readonly opportunityId: string;
    readonly resumeText: string;
    readonly jobDescription: string;
    readonly tone?: string | null;
  }): Promise<AiResult<GeneratedDraft>>;
}

export interface ResumeGenerationService {
  generateResume(input: {
    readonly baseResumeText: string;
    readonly jobDescription: string;
    readonly emphasis?: readonly string[];
  }): Promise<AiResult<GeneratedDraft>>;
}

// ---------------------------------------------------------------------------
// Judgement services — operate over records already in the CRM.
// ---------------------------------------------------------------------------

export interface DuplicateCandidate {
  readonly opportunityId: string;
  readonly score: number;
  readonly reason: string;
}

/**
 * Duplicate detection runs before an imported record becomes an opportunity.
 * Deterministic keys (`source` + `external_job_id`, company domain + title) are
 * checked first and are authoritative; this service only adjudicates what those
 * keys leave ambiguous.
 */
export interface DuplicateDetectionService {
  findDuplicates(
    candidate: NormalizedApplication,
    existing: readonly { id: string; title: string; companyName: string | null }[],
  ): Promise<AiResult<readonly DuplicateCandidate[]>>;
}

export interface PriorityAssessment {
  /** Maps onto `opportunities.priority` (the `task_priority` enum). */
  readonly priority: "low" | "medium" | "high" | "urgent";
  readonly rationale: readonly Grounded<string>[];
}

export interface PriorityScoringService {
  scorePriority(input: {
    readonly opportunityId: string;
    readonly deadlineAt?: string | null;
    readonly resumeScore?: number | null;
    readonly stage?: string | null;
  }): Promise<AiResult<PriorityAssessment>>;
}

// ---------------------------------------------------------------------------
// Document classification — routes an imported file to the right kind.
// ---------------------------------------------------------------------------

export interface DocumentClassificationService {
  classifyDocument(input: {
    readonly fileName: string;
    readonly contentText: string;
  }): Promise<AiResult<Grounded<DocumentKind>>>;
}

/**
 * The full Career Intelligence AI surface. Phase 2 may implement any subset;
 * callers depend on the narrow interface they need, not on this union, so a
 * partially-built AI layer never blocks a feature.
 */
export interface CareerIntelligenceAi
  extends CompanyExtractionService,
    RecruiterExtractionService,
    SalaryExtractionService,
    AtsScoreService,
    FollowUpService,
    CoverLetterService,
    ResumeGenerationService,
    DuplicateDetectionService,
    PriorityScoringService,
    DocumentClassificationService {}
