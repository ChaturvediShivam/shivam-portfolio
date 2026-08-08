import "server-only";
import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";
import { analyzeResume, type AnalysisResult } from "@/lib/resume-analysis/ResumeAnalysisService";
import { MIN_RESUME_CHARS } from "@/lib/resume/parse";
import { DEMO_MAX_JD_CHARS, DEMO_MAX_RESUME_CHARS } from "@/lib/demo/config";
import { sampleJobDescription, sampleResume } from "@/lib/demo/samples";
import type { ParsedResume } from "@/types/resume";

/**
 * The demo's deterministic analysis.
 *
 * Everything here is arithmetic over text: the same `analyzeResume` the
 * authenticated Resume AI runs, over the same scoring modules, with no provider
 * call anywhere in the path. That property is what lets the demo keep working
 * when the token budget is gone, when the provider is down, and when the flag
 * that gates the AI half is off.
 *
 * WHY THE CLIENT SENDS TEXT AND NOT A ParsedResume
 *
 * The browser has to do the extraction — pdfjs only runs there — but it must not
 * be trusted with the result's structure. A `ParsedResume` carries `sections`,
 * and sections decide which lines the scorer treats as skills; a forged one
 * would let a caller aim the analysis at whatever it liked. So the wire carries
 * the extracted text and nothing else, and the sections are re-derived here
 * through the same normalizer and detector the upload path uses.
 *
 * The scores follow from that, so there is no score on the wire to distrust.
 * This mirrors the authenticated action, which recomputes the deterministic
 * analysis server-side for the same reason.
 */

/** Shown when the AI half was skipped but the analysis itself succeeded. */
export const AI_UNAVAILABLE_NOTE = "AI review is temporarily unavailable.";

export interface DemoAnalysisInput {
  /** Resume text extracted in the browser. Null selects the bundled sample. */
  resumeText: string | null;
  /** Raw posting text. Null selects the bundled sample. */
  jobDescription: string | null;
}

export interface DemoAnalysisData {
  analysis: AnalysisResult["analysis"];
  /** The structured posting, so the UI can show what was understood. */
  posting: AnalysisResult["jobDescription"];
  usedSampleResume: boolean;
  usedSampleJobDescription: boolean;
  /**
   * The AI review, once T9 adds it. Null here means "not attempted": this step
   * never calls a provider.
   */
  aiInsights: null;
  /** Why the AI review is absent, when the deterministic half still succeeded. */
  aiNote: string | null;
}

/** A rejection a visitor can act on, unlike the wrapper's opaque gate codes. */
export interface DemoInputRejection {
  field: "resume" | "jobDescription";
  message: string;
}

/**
 * Bounds-check untrusted input before any work is done.
 *
 * The ceilings are the demo's, not the authenticated action's: a stranger's
 * payload has no claim on the budget a longer one would spend at T9.
 */
export function validateDemoInput(input: DemoAnalysisInput): DemoInputRejection | null {
  const { resumeText, jobDescription } = input;

  if (resumeText !== null) {
    if (typeof resumeText !== "string") {
      return { field: "resume", message: "That resume could not be read." };
    }
    // A scanned PDF parses cleanly and yields nothing. Without this floor the
    // analysis runs over an empty document and reports a meaningless score.
    if (resumeText.trim().length < MIN_RESUME_CHARS) {
      return {
        field: "resume",
        message:
          "No text could be read from that file. If it is a scan, export a text-based PDF or DOCX.",
      };
    }
    if (resumeText.length > DEMO_MAX_RESUME_CHARS) {
      return { field: "resume", message: "That resume is too large for the demo." };
    }
  }

  if (jobDescription !== null) {
    if (typeof jobDescription !== "string" || !jobDescription.trim()) {
      return { field: "jobDescription", message: "Add a job description first." };
    }
    if (jobDescription.length > DEMO_MAX_JD_CHARS) {
      return { field: "jobDescription", message: "That job description is too large for the demo." };
    }
  }

  return null;
}

/**
 * Rebuild a ParsedResume from text alone.
 *
 * The same two functions `parseResume` applies after extraction, so the result
 * is what an uploaded copy of the same document would have become. `parseResume`
 * itself is not reused because it takes an UploadedDocument and a format
 * extractor, neither of which exists once the browser has already done the work.
 */
export function resumeFromText(text: string): ParsedResume {
  const normalized = normalizeText(text);

  return {
    text: normalized.text,
    lines: normalized.lines,
    sections: detectSections(normalized.lines),
    pageCount: null,
    truncated: false,
    // Opaque provenance: this text arrived already extracted, so naming a
    // format parser here would claim something that was never run.
    parser: "demo-client-text",
    warnings: [],
  };
}

/**
 * Score a resume against a posting. No provider call, no network, no budget.
 *
 * Pure with respect to its inputs, which is why it is testable without a
 * database, a session, or an API key.
 */
export function runDeterministicAnalysis(input: DemoAnalysisInput): DemoAnalysisData {
  const usedSampleResume = input.resumeText === null;
  const usedSampleJobDescription = input.jobDescription === null;

  const resume = usedSampleResume ? sampleResume() : resumeFromText(input.resumeText!);
  const jobDescription = usedSampleJobDescription
    ? sampleJobDescription()
    : input.jobDescription!;

  const { analysis, jobDescription: posting } = analyzeResume({ resume, jobDescription });

  return {
    analysis,
    posting,
    usedSampleResume,
    usedSampleJobDescription,
    aiInsights: null,
    aiNote: null,
  };
}
