"use client";

import * as React from "react";
import { AlertCircle, Check, Loader2, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/admin/ui";
import type {
  AiRecommendation,
  AiResumeInsights,
  InsightSeverity,
} from "@/lib/ai-analysis/AIAnalysisTypes";
import type { CoverLetterDraft } from "@/lib/ai-analysis/CoverLetterPrompt";

/**
 * AI review (Resume AI · Phase 3 · Step 2).
 *
 * Presentational. Every number on this page that means anything about ATS
 * matching was computed by the deterministic engine and is rendered above by
 * `AnalysisResults`; nothing here recomputes or restates it.
 *
 * The one figure shown here is the hiring probability, and it is deliberately
 * placed apart from the match score with its reasoning attached. Two
 * percentages side by side would be read as one metric measured twice.
 *
 * Every strength and weakness shows the line it rests on. That is the same
 * decision as in the deterministic panel and for the same reason: a judgement
 * the operator cannot trace back to their own words is one they have no reason
 * to trust — and with a model producing it, no reason to believe either.
 */

export interface AiInsightsProps {
  insights: AiResumeInsights;
  coverLetter: CoverLetterDraft | null;
  coverLetterPending: boolean;
  coverLetterError: string | null;
  onDraftCoverLetter: () => void;
}

const SEVERITY_TONE: Record<InsightSeverity, string> = {
  critical: "text-red-400",
  important: "text-amber-300",
  minor: "text-slate-400",
};

const PRIORITY_VARIANT: Record<AiRecommendation["priority"], "danger" | "info" | "neutral"> = {
  high: "danger",
  medium: "info",
  low: "neutral",
};

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-md border border-white/[0.06] bg-white/[0.02] p-4"
    >
      <h4 id={headingId} className="text-xs font-medium text-slate-400">
        {title}
      </h4>
      {description && <p className="mt-0.5 text-xs text-slate-600">{description}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** The quoted resume or posting line an insight rests on. */
function Evidence({ children }: { children: string }) {
  return (
    <span className="mt-1 block border-l border-white/10 pl-2 text-xs text-slate-600">
      {children}
    </span>
  );
}

export function AiInsights({
  insights,
  coverLetter,
  coverLetterPending,
  coverLetterError,
  onDraftCoverLetter,
}: AiInsightsProps) {
  return (
    <section
      aria-labelledby="ai-insights-heading"
      className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <div>
        <h3 id="ai-insights-heading" className="text-sm font-semibold text-white">
          AI review
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Written by {insights.aiProvider} ({insights.aiModel}) from the analysis above. It explains
          the score; it does not compute it.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-5 rounded-md border border-white/[0.06] bg-white/[0.02] p-4">
        <div
          className="flex items-baseline gap-1"
          role="img"
          aria-label={`Estimated interview probability ${insights.overallHiringProbability} percent`}
        >
          <span className="text-3xl font-semibold tabular-nums text-slate-200">
            {insights.overallHiringProbability}
          </span>
          <span className="text-sm text-slate-600">%</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs uppercase tracking-wide text-slate-600">
            Estimated chance of an interview
          </p>
          <p className="whitespace-pre-line text-sm text-slate-300">{insights.overallSummary}</p>
          <p className="text-xs text-slate-500">{insights.reasoning}</p>
        </div>
      </div>

      {insights.strengths.length > 0 && (
        <Panel title={`Strengths (${insights.strengths.length})`}>
          <ul className="space-y-2.5">
            {insights.strengths.map((item) => (
              <li key={item.headline} className="text-xs">
                <span className="flex items-start gap-1.5 text-slate-200">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
                  {item.headline}
                </span>
                <span className="mt-0.5 block pl-5 text-slate-400">{item.detail}</span>
                <span className="block pl-5">
                  <Evidence>{item.evidence}</Evidence>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {insights.weaknesses.length > 0 && (
        <Panel title={`Weaknesses (${insights.weaknesses.length})`}>
          <ul className="space-y-2.5">
            {insights.weaknesses.map((item) => (
              <li key={item.headline} className="text-xs">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("font-medium", SEVERITY_TONE[item.severity])}>
                    {item.headline}
                  </span>
                  <Badge variant="neutral">{item.severity}</Badge>
                </span>
                <span className="mt-0.5 block text-slate-400">{item.detail}</span>
                <Evidence>{item.evidence}</Evidence>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {insights.criticalGaps.length > 0 && (
        <Panel
          title={`Critical gaps (${insights.criticalGaps.length})`}
          description="Required skills the parser did not find in your resume."
        >
          <ul className="space-y-2.5">
            {insights.criticalGaps.map((gap) => (
              <li key={gap.skill} className="text-xs">
                <span className="flex items-start gap-1.5 text-slate-200">
                  <X className="mt-0.5 size-3.5 shrink-0 text-red-400" aria-hidden />
                  {gap.displayName}
                </span>
                <span className="mt-0.5 block pl-5 text-slate-400">{gap.impact}</span>
                <span className="block pl-5">
                  <Evidence>{gap.requestedIn}</Evidence>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {insights.transferableSkills.length > 0 && (
        <Panel
          title="Transferable experience"
          description="Work you already have that partly covers a gap."
        >
          <ul className="space-y-2.5">
            {insights.transferableSkills.map((item) => (
              <li key={`${item.fromSkill}-${item.toRequirement}`} className="text-xs">
                <span className="text-slate-200">
                  {item.fromSkill} → {item.toRequirement}
                </span>
                <span className="mt-0.5 block text-slate-400">{item.rationale}</span>
                <Evidence>{item.evidence}</Evidence>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {insights.missingKeywords.length > 0 && (
        <Panel
          title="Keywords worth adding"
          description="Terms the posting uses that your resume does not."
        >
          <div className="flex flex-wrap gap-1.5">
            {insights.missingKeywords.map((term) => (
              <span
                key={term}
                className="rounded border border-white/[0.08] px-1.5 py-0.5 text-xs text-slate-300"
              >
                {term}
              </span>
            ))}
          </div>
        </Panel>
      )}

      {insights.recommendations.length > 0 && (
        <Panel title={`Recommendations (${insights.recommendations.length})`}>
          <ul className="space-y-2.5">
            {insights.recommendations.map((rec) => (
              <li key={rec.action} className="text-xs">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={PRIORITY_VARIANT[rec.priority]}>{rec.priority}</Badge>
                  <span className="text-slate-200">{rec.action}</span>
                </span>
                <span className="mt-0.5 block text-slate-500">{rec.why}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {insights.bulletImprovements.length > 0 && (
        <Panel title="Suggested rewrites" description="Line by line, against what you wrote.">
          <ul className="space-y-3">
            {insights.bulletImprovements.map((bullet) => (
              <li key={bullet.original} className="text-xs">
                <span className="block text-slate-600 line-through">{bullet.original}</span>
                <span className="mt-0.5 block text-slate-200">{bullet.improved}</span>
                <span className="mt-0.5 block text-slate-500">{bullet.why}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {insights.resumeSummaryRewrite && (
        <Panel title="Professional summary" description="Your summary, rewritten for this posting.">
          <p className="whitespace-pre-line text-xs text-slate-200">
            {insights.resumeSummaryRewrite.rewritten}
          </p>
          {insights.resumeSummaryRewrite.original && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">Show the original</summary>
              <p className="mt-1 text-xs text-slate-600">
                {insights.resumeSummaryRewrite.original}
              </p>
            </details>
          )}
          {insights.resumeSummaryRewrite.changes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {insights.resumeSummaryRewrite.changes.map((change) => (
                <li key={change} className="text-xs text-slate-500">
                  — {change}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {insights.linkedinSuggestions && (
        <Panel title="LinkedIn" description="Profile copy, in your voice.">
          <p className="text-xs font-medium text-slate-200">
            {insights.linkedinSuggestions.headline}
          </p>
          <p className="mt-1.5 whitespace-pre-line text-xs text-slate-400">
            {insights.linkedinSuggestions.about}
          </p>
          {insights.linkedinSuggestions.skillsToFeature.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {insights.linkedinSuggestions.skillsToFeature.map((skill) => (
                <span
                  key={skill}
                  className="rounded border border-white/[0.08] px-1.5 py-0.5 text-xs text-slate-300"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
          {insights.linkedinSuggestions.notes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {insights.linkedinSuggestions.notes.map((note) => (
                <li key={note} className="text-xs text-slate-500">
                  — {note}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {insights.interviewQuestions.length > 0 && (
        <Panel
          title={`Interview questions (${insights.interviewQuestions.length})`}
          description="What this posting and this resume make likely."
        >
          <ul className="space-y-2.5">
            {insights.interviewQuestions.map((item) => (
              <li key={item.question} className="text-xs">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={item.kind === "gap_probe" ? "danger" : "neutral"}>
                    {item.kind === "gap_probe" ? "gap" : item.kind}
                  </Badge>
                  <span className="text-slate-200">{item.question}</span>
                </span>
                <span className="mt-0.5 block text-slate-500">{item.rationale}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Cover letter" description="Drafted only when you ask. Nothing is sent anywhere.">
        {coverLetter ? (
          <>
            <p className="whitespace-pre-line text-xs text-slate-200">{coverLetter.body}</p>
            {coverLetter.notes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {coverLetter.notes.map((note) => (
                  <li key={note} className="text-xs text-slate-500">
                    — {note}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onDraftCoverLetter}
            disabled={coverLetterPending}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {coverLetterPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {coverLetterPending ? "Drafting…" : "Draft a cover letter"}
          </button>
        )}

        {coverLetterError && (
          <p
            role="status"
            aria-live="polite"
            className="mt-2 flex items-start gap-1.5 text-xs text-red-400"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {coverLetterError}
          </p>
        )}
      </Panel>

      {insights.dropped.length > 0 && (
        <details className="rounded-md border border-white/[0.06] px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
            {insights.dropped.length} claim{insights.dropped.length === 1 ? "" : "s"} discarded as
            unsupported
          </summary>
          <ul className="mt-2 space-y-1">
            {insights.dropped.map((reason) => (
              <li key={reason} className="text-xs text-slate-600">
                {reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-slate-600">
        Prompt v{insights.aiPromptVersion} · generated {new Date(insights.generatedAt).toLocaleString()}
      </p>
    </section>
  );
}
