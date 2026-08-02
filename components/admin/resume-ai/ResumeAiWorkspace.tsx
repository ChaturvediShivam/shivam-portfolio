"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { ResumeUploader } from "./ResumeUploader";
import { ParsedPreview } from "./ParsedPreview";
import { AnalysisResults } from "./AnalysisResults";
import { AiInsights } from "./AiInsights";
import { analyzeWithAiAction, draftCoverLetterAction } from "@/app/admin/(dashboard)/resume-ai/actions";
import { isActionError } from "@/lib/action-result";
import type { AiResumeInsights } from "@/lib/ai-analysis/AIAnalysisTypes";
import type { CoverLetterDraft } from "@/lib/ai-analysis/CoverLetterPrompt";
import { analyzeResume, type AnalysisResult } from "@/lib/resume-analysis/ResumeAnalysisService";
import { parseResume, ResumeParseError } from "@/lib/resume/parse";
import type { ParsedResume } from "@/types/resume";
import { JDUploader } from "./JDUploader";
import { AnalyzeButton } from "./AnalyzeButton";
import { isJobDescriptionReady, MIN_JD_CHARS, type JobDescriptionInput } from "@/types/job-description";
import type { UploadedDocument } from "@/types/upload";

/**
 * Resume AI workspace (Resume AI · Step 1).
 *
 * The single stateful container. Both uploaders are controlled from here, which
 * is what lets the Analyze button know whether it can run without either
 * uploader knowing the other exists.
 *
 * State is intentionally local and unpersisted. Nothing is uploaded, stored, or
 * sent anywhere in Step 1 — a reload clears the form, which is the honest
 * behaviour while there is no durable store to reload from. The step that adds
 * one replaces this state, not the components under it.
 */

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-xs font-medium text-slate-400"
          aria-hidden
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold text-white">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Parse lifecycle. Mirrors the upload state machine's shape deliberately. */
type ParseState =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "done"; parsed: ParsedResume }
  | { status: "failed"; message: string };

/**
 * AI enrichment lifecycle.
 *
 * `cancelled` is a state rather than a return to idle: the operator stopped a
 * call that had already been billed, and silently showing the pre-AI page again
 * would leave them unsure whether anything happened.
 */
type AiState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; insights: AiResumeInsights | null; note: string | null }
  | { status: "failed"; message: string }
  | { status: "cancelled" };

/**
 * How long to wait before giving up on the review.
 *
 * Four gateway calls, one of them large, so this is generous. The server cannot
 * be interrupted by it — the request continues and is still audited and billed —
 * so this bounds the operator's wait, not the spend.
 */
const AI_TIMEOUT_MS = 120_000;

class AiTimeout extends Error {}

export function ResumeAiWorkspace({ aiEnabled = false }: { aiEnabled?: boolean }) {
  const [resume, setResume] = React.useState<UploadedDocument | null>(null);
  const [jobDescription, setJobDescription] = React.useState<JobDescriptionInput | null>(null);
  const [parse, setParse] = React.useState<ParseState>({ status: "idle" });

  /**
   * Parse as soon as a resume is held.
   *
   * Extraction is deterministic, local and free — there is no reason to make
   * the operator ask for it, and seeing the parse immediately is what makes a
   * bad extraction obvious before they go any further.
   *
   * The document id guards against a stale result: replacing the file while the
   * previous parse is still running would otherwise let the older result win.
   */
  React.useEffect(() => {
    if (!resume) {
      setParse({ status: "idle" });
      return;
    }

    let current = true;
    setParse({ status: "parsing" });

    parseResume(resume)
      .then((parsed) => {
        if (current) setParse({ status: "done", parsed });
      })
      .catch((error: unknown) => {
        if (!current) return;
        const message =
          error instanceof ResumeParseError
            ? error.message
            : "That file could not be read. Try exporting it again.";
        if (!(error instanceof ResumeParseError)) {
          console.error("[resume-ai] parse failed:", error);
        }
        setParse({ status: "failed", message });
      });

    return () => {
      current = false;
    };
  }, [resume]);

  const [analysis, setAnalysis] = React.useState<AnalysisResult | null>(null);
  const [analysing, setAnalysing] = React.useState(false);

  const [ai, setAi] = React.useState<AiState>({ status: "idle" });
  const [coverLetter, setCoverLetter] = React.useState<CoverLetterDraft | null>(null);
  const [coverLetterPending, setCoverLetterPending] = React.useState(false);
  const [coverLetterError, setCoverLetterError] = React.useState<string | null>(null);

  /**
   * Which AI request the UI is currently willing to accept.
   *
   * A server action cannot be aborted mid-flight, so cancelling means refusing
   * the answer rather than stopping the work. Bumping this discards whatever is
   * in flight — on cancel, and on any input change — which is what stops a slow
   * review landing on top of a resume the operator has since replaced.
   */
  const aiRunRef = React.useRef(0);

  const jdReady = isJobDescriptionReady(jobDescription);
  const ready = resume !== null && jdReady;

  // Named precisely rather than "complete both steps": telling someone what is
  // missing is the difference between a hint and a hint they can act on.
  const blockedReason = React.useMemo(() => {
    if (!resume && !jdReady) return "Upload a resume and add a job description to continue.";
    if (!resume) return "Upload a resume to continue.";
    if (jobDescription?.source === "paste") {
      return `The job description needs at least ${MIN_JD_CHARS} characters.`;
    }
    return "Add a job description to continue.";
  }, [resume, jdReady, jobDescription]);

  /**
   * Any change to either input invalidates the analysis.
   *
   * Leaving a stale result on screen while the operator swaps their resume
   * would show a score computed from a document that is no longer loaded —
   * the most misleading state this page could be in.
   */
  React.useEffect(() => {
    setAnalysis(null);
    aiRunRef.current += 1;
    // Keep the existing object when already idle. A fresh `{ status: "idle" }`
    // would be a new identity every time, so this effect would schedule a
    // render on every keystroke in the job description — and each of those
    // renders feeds the uploader that re-emits the value this effect watches.
    setAi((current) => (current.status === "idle" ? current : { status: "idle" }));
    setCoverLetter(null);
    setCoverLetterError(null);
  }, [parse, jobDescription]);

  /**
   * Run the deterministic analysis.
   *
   * Synchronous and local — no network, no model. It is wrapped in a state
   * flip anyway so the button has a real busy state on a very large document,
   * and so the AI step can make this genuinely async without touching the UI.
   */
  function runAnalysis() {
    if (parse.status !== "done" || !jobDescription) return;

    setAnalysing(true);
    try {
      const jdText =
        jobDescription.source === "paste"
          ? jobDescription.text
          : // An uploaded job description is not parsed until a later step, so
            // there is no text to analyse yet. The button is unreachable in this
            // state; the guard is here so it stays true if that changes.
            "";

      if (!jdText.trim()) {
        setAnalysis(null);
        return;
      }

      setAnalysis(analyzeResume({ resume: parse.parsed, jobDescription: jdText }));

      // Strictly after the deterministic result exists. The AI explains that
      // result; starting it in parallel would mean explaining a score that had
      // not been computed yet.
      if (aiEnabled) void runAiReview(parse.parsed, jdText);
    } finally {
      setAnalysing(false);
    }
  }

  /**
   * Ask the server for the AI review.
   *
   * The deterministic panel is already on screen and stays there whatever
   * happens here: a failure, a timeout or a cancellation costs the enrichment
   * and nothing else.
   */
  async function runAiReview(parsed: ParsedResume, jdText: string) {
    const run = (aiRunRef.current += 1);
    setAi({ status: "running" });

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const result = await Promise.race([
        analyzeWithAiAction({ resume: parsed, jobDescription: jdText }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new AiTimeout()), AI_TIMEOUT_MS);
        }),
      ]);

      if (aiRunRef.current !== run) return;

      if (isActionError(result)) {
        setAi({ status: "failed", message: result.formError ?? "The AI review failed." });
        return;
      }

      setAi({ status: "done", insights: result.data.insights, note: result.data.note });
    } catch (error) {
      if (aiRunRef.current !== run) return;
      const message =
        error instanceof AiTimeout
          ? "The AI review took too long. The match score above is unaffected."
          : "The AI review failed. The match score above is unaffected.";
      if (!(error instanceof AiTimeout)) console.error("[resume-ai] review failed:", error);
      setAi({ status: "failed", message });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function cancelAiReview() {
    aiRunRef.current += 1;
    setAi({ status: "cancelled" });
  }

  async function draftCoverLetter() {
    if (parse.status !== "done" || !jobDescription || jobDescription.source !== "paste") return;

    setCoverLetterPending(true);
    setCoverLetterError(null);
    try {
      const result = await draftCoverLetterAction({
        resume: parse.parsed,
        jobDescription: jobDescription.text,
      });

      if (isActionError(result)) {
        setCoverLetterError(result.formError ?? "Could not draft a cover letter.");
        return;
      }
      setCoverLetter(result.data.draft);
    } catch (error) {
      console.error("[resume-ai] cover letter failed:", error);
      setCoverLetterError("Could not draft a cover letter.");
    } finally {
      setCoverLetterPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        step={1}
        title="Resume"
        description="PDF or DOCX, up to 10 MB. Nothing leaves your browser yet."
      >
        <ResumeUploader onChange={setResume} />
      </Section>

      <Section
        step={2}
        title="Job description"
        description="Paste the text or upload the posting — whichever you have."
      >
        <JDUploader onChange={setJobDescription} />
      </Section>

      <Section
        step={3}
        title="Analyze"
        description="Compare the resume against the role and see where it stands."
      >
        {/*
          No handler in Step 1. The button is fully wired for state — enabled,
          disabled, loading — so the step that adds analysis supplies `onAnalyze`
          and `loading` and changes nothing else here.
        */}
        <AnalyzeButton
          ready={ready && parse.status === "done"}
          loading={analysing}
          blockedReason={parse.status === "done" ? blockedReason : "Waiting for the resume to finish parsing."}
          onAnalyze={runAnalysis}
        />
        <p className="mt-3 text-xs text-slate-600">
          {aiEnabled
            ? "Scoring runs in your browser. The AI review that follows sends your resume and the posting to the configured AI provider."
            : "Scoring runs in your browser. Nothing is sent anywhere and no AI is involved."}
        </p>
      </Section>

      {analysis && (
        <AnalysisResults analysis={analysis.analysis} jobDescription={analysis.jobDescription} />
      )}

      {ai.status === "running" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-slate-400" role="status" aria-live="polite">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Reviewing your resume against the posting…
          </p>
          <button
            type="button"
            onClick={cancelAiReview}
            className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
      )}

      {ai.status === "cancelled" && (
        <p className="px-1 text-sm text-slate-500" role="status" aria-live="polite">
          AI review cancelled. The match score above is unaffected.
        </p>
      )}

      {ai.status === "failed" && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {ai.message}
        </p>
      )}

      {ai.status === "done" && ai.note && (
        <p className="px-1 text-sm text-slate-500" role="status" aria-live="polite">
          {ai.note}
        </p>
      )}

      {ai.status === "done" && ai.insights && (
        <AiInsights
          insights={ai.insights}
          coverLetter={coverLetter}
          coverLetterPending={coverLetterPending}
          coverLetterError={coverLetterError}
          onDraftCoverLetter={() => void draftCoverLetter()}
        />
      )}

      {parse.status === "parsing" && (
        <p className="flex items-center gap-2 px-1 text-sm text-slate-500" role="status" aria-live="polite">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Reading the resume…
        </p>
      )}

      {parse.status === "failed" && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {parse.message}
        </p>
      )}

      {parse.status === "done" && <ParsedPreview parsed={parse.parsed} />}
    </div>
  );
}
