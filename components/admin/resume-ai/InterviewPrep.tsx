"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  MessagesSquare,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/admin/ui";
import { downloadDocx } from "@/lib/resume/exportDocx";
import {
  INTERVIEW_CATEGORIES,
  INTERVIEW_DIFFICULTIES,
  type InterviewDifficulty,
  type InterviewQuestion,
  type InterviewQuestionCategory,
} from "@/lib/ai-analysis/AIAnalysisTypes";

/**
 * Interview preparation (Resume AI · Feature 4).
 *
 * Presentational. Questions come from the existing `resume_interview_questions`
 * template through the gateway — either as part of a review or from the
 * standalone regenerate action, which calls the same generator.
 *
 * Grouped by category rather than listed flat because the categories are the
 * preparation plan: resume-based questions are where the interview will
 * actually hurt, and burying them in a list of twelve is the one presentation
 * that wastes the information.
 */

export interface InterviewPrepProps {
  enabled: boolean;
  pending: boolean;
  error: string | null;
  questions: InterviewQuestion[];
  /** Provenance from the review that produced these, when there is one. */
  provider: string | null;
  model: string | null;
  onRegenerate: () => void;
}

const CATEGORY_LABELS: Record<InterviewQuestionCategory, string> = {
  technical: "Technical",
  behavioural: "Behavioral",
  experience: "Experience",
  resume_based: "Resume-based",
  hr: "HR",
};

const CATEGORY_HINTS: Record<InterviewQuestionCategory, string> = {
  technical: "Skills the posting requires and your resume evidences.",
  behavioural: "The responsibilities the posting lists.",
  experience: "Your actual history — scale, ownership, decisions.",
  resume_based: "Where an interviewer will press. Prepare these first.",
  hr: "Motivation, notice, expectations.",
};

const DIFFICULTY_LABELS: Record<InterviewDifficulty, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
};

/**
 * Difficulty styling.
 *
 * A neutral ramp, not a status palette — seniority is not good or bad, and
 * borrowing red/amber/green would say it was. The label is always rendered, so
 * the tone is reinforcement rather than the only signal.
 */
const DIFFICULTY_TONE: Record<InterviewDifficulty, string> = {
  junior: "border-slate-500/20 bg-slate-500/[0.07] text-slate-400",
  mid: "border-blue-500/20 bg-blue-500/[0.07] text-blue-300",
  senior: "border-purple-500/20 bg-purple-500/[0.07] text-purple-300",
};

function questionsToText(questions: InterviewQuestion[]): string {
  return INTERVIEW_CATEGORIES.flatMap((category) => {
    const inCategory = questions.filter((q) => q.category === category);
    if (inCategory.length === 0) return [];
    return [
      `${CATEGORY_LABELS[category]}`,
      ...inCategory.map(
        (q, i) => `${i + 1}. [${DIFFICULTY_LABELS[q.difficulty]}] ${q.question}\n   Why: ${q.rationale}`,
      ),
      "",
    ];
  }).join("\n");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied by permissions policy; the text is on screen
      // and selectable, so failing quietly beats an error banner.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-400" aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}

/** Browser print pipeline — a real PDF, zero bundle. Same approach as the other exports. */
function printAsPdf(questions: InterviewQuestion[]) {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const body = INTERVIEW_CATEGORIES.map((category) => {
    const inCategory = questions.filter((q) => q.category === category);
    if (inCategory.length === 0) return "";
    return (
      `<h2>${esc(CATEGORY_LABELS[category])}</h2>` +
      inCategory
        .map(
          (q) =>
            `<p class="q"><span class="d">${esc(DIFFICULTY_LABELS[q.difficulty])}</span> ${esc(q.question)}</p>` +
            `<p class="w">${esc(q.rationale)}</p>`,
        )
        .join("")
    );
  }).join("");

  win.document.write(`<!doctype html><html><head><title>Interview preparation</title><style>
    @page { margin: 18mm; }
    body { font: 11pt/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #111; }
    h1 { font-size: 18pt; margin: 0 0 14pt; }
    h2 { font-size: 12pt; margin: 16pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
    p.q { margin: 0 0 2pt; font-weight: 600; }
    p.w { margin: 0 0 10pt; color: #555; font-size: 10pt; }
    span.d { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #666; margin-right: 6pt; }
  </style></head><body><h1>Interview preparation</h1>${body}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function CategoryBlock({
  category,
  questions,
}: {
  category: InterviewQuestionCategory;
  questions: InterviewQuestion[];
}) {
  const headingId = React.useId();
  const text = questions
    .map((q, i) => `${i + 1}. ${q.question}\n   Why: ${q.rationale}`)
    .join("\n");

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h4 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-white">
            {CATEGORY_LABELS[category]}
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
              {questions.length}
            </span>
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-600">{CATEGORY_HINTS[category]}</p>
        </div>
        <CopyButton text={text} label="Copy section" />
      </div>

      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={`${q.question}-${i}`} className="flex gap-3">
            <span
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-medium text-slate-400"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    DIFFICULTY_TONE[q.difficulty],
                  )}
                >
                  {DIFFICULTY_LABELS[q.difficulty]}
                </span>
                <p className="text-sm leading-relaxed text-slate-100">{q.question}</p>
              </div>
              <p className="mt-1 border-l-2 border-white/10 pl-2.5 text-xs leading-relaxed text-slate-500">
                {q.rationale}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function InterviewPrep({
  enabled,
  pending,
  error,
  questions,
  provider,
  model,
  onRegenerate,
}: InterviewPrepProps) {
  const [difficultyFilter, setDifficultyFilter] = React.useState<InterviewDifficulty | "all">("all");

  if (!enabled) return null;

  const visible =
    difficultyFilter === "all"
      ? questions
      : questions.filter((q) => q.difficulty === difficultyFilter);

  const populated = INTERVIEW_CATEGORIES.filter((c) => visible.some((q) => q.category === c));
  const hasAny = questions.length > 0;

  return (
    <section
      aria-labelledby="interview-prep-heading"
      className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3
            id="interview-prep-heading"
            className="flex items-center gap-2 text-sm font-semibold text-white"
          >
            <MessagesSquare className="size-4 text-purple-300" aria-hidden />
            Interview preparation
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            What this posting and this resume make likely. Predictions, not claims about you.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/[0.07] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-300">
          <Sparkles className="size-2.5" aria-hidden />
          AI generated
        </span>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={hasAny ? "secondary" : "primary"}
          disabled={pending}
          isLoading={pending}
          onClick={onRegenerate}
        >
          {hasAny ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {pending ? "Generating…" : hasAny ? "Regenerate" : "Generate questions"}
        </Button>

        {hasAny && (
          <>
            <CopyButton text={questionsToText(questions)} label="Copy all" />
            <button
              type="button"
              onClick={() =>
                downloadDocx(
                  "interview-preparation",
                  "Interview preparation",
                  INTERVIEW_CATEGORIES.filter((c) => questions.some((q) => q.category === c)).map(
                    (c) => ({
                      heading: CATEGORY_LABELS[c],
                      lines: questions
                        .filter((q) => q.category === c)
                        .flatMap((q) => [
                          `[${DIFFICULTY_LABELS[q.difficulty]}] ${q.question}`,
                          `Why: ${q.rationale}`,
                          "",
                        ]),
                    }),
                  ),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
            >
              <Download className="size-3" aria-hidden />
              Download DOCX
            </button>
            <button
              type="button"
              onClick={() => printAsPdf(questions)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
            >
              <FileText className="size-3" aria-hidden />
              Download PDF
            </button>
          </>
        )}
      </div>

      {/* ── Difficulty filter ────────────────────────────────────────── */}
      {hasAny && (
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Filter by difficulty</legend>
          {(["all", ...INTERVIEW_DIFFICULTIES] as const).map((level) => {
            const selected = difficultyFilter === level;
            const count =
              level === "all" ? questions.length : questions.filter((q) => q.difficulty === level).length;
            return (
              <label
                key={level}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-1 text-[11px] transition-colors",
                  "focus-within:ring-2 focus-within:ring-white/20",
                  selected
                    ? "border-white/25 bg-white/[0.08] font-medium text-white"
                    : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:text-slate-200",
                  count === 0 && "opacity-40",
                )}
              >
                <input
                  type="radio"
                  name="interview-difficulty"
                  value={level}
                  checked={selected}
                  onChange={() => setDifficultyFilter(level)}
                  className="sr-only"
                />
                {level === "all" ? "All" : DIFFICULTY_LABELS[level]} · {count}
              </label>
            );
          })}
        </fieldset>
      )}

      {/* ── States ───────────────────────────────────────────────────── */}
      {pending && (
        <p
          className="flex items-center gap-2 text-sm text-slate-400"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Predicting the questions you&rsquo;ll be asked…
        </p>
      )}

      {error && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400"
        >
          <span className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </span>
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-md border border-red-500/30 px-2 py-0.5 text-[11px] transition-colors hover:bg-red-500/10"
          >
            Retry
          </button>
        </div>
      )}

      {!pending && !error && !hasAny && (
        <p className="text-sm text-slate-500">
          No questions yet. Run the analysis above, or generate them on their own.
        </p>
      )}

      {hasAny && populated.length === 0 && (
        <p className="text-sm text-slate-500">
          No questions at that level. Choose a different difficulty.
        </p>
      )}

      {/* ── Questions ────────────────────────────────────────────────── */}
      {populated.length > 0 && (
        <div className="space-y-3">
          {populated.map((category) => (
            <CategoryBlock
              key={category}
              category={category}
              questions={visible.filter((q) => q.category === category)}
            />
          ))}
        </div>
      )}

      {hasAny && provider && model && (
        <p className="text-[11px] text-slate-600">
          {provider}/{model} · {questions.length} question{questions.length === 1 ? "" : "s"} across{" "}
          {INTERVIEW_CATEGORIES.filter((c) => questions.some((q) => q.category === c)).length}{" "}
          categories
        </p>
      )}
    </section>
  );
}
