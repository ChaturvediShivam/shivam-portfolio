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

/**
 * AI review (Resume AI · Phase 3 · Step 2).
 *
 * Presentational. Every number on this page that means anything about ATS
 * matching was computed by the deterministic engine and is rendered above by
 * `AiReview`; nothing here recomputes or restates it.
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

export function AiInsights({ insights }: AiInsightsProps) {
  return (
    <section
      aria-labelledby="ai-insights-heading"
      className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <div>
        <h3 id="ai-insights-heading" className="text-sm font-semibold text-white">
          Rewrites &amp; drafts
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Written by {insights.aiProvider} ({insights.aiModel}) from the analysis above. The score,
          strengths, gaps and action plan are in the review above this.
        </p>
      </div>

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
