"use client";

import * as React from "react";
import type { DemoAnalysisData } from "@/lib/demo/analysis";

/**
 * The analysis, once it exists.
 *
 * Structured so the free half is always complete on its own: the score, the
 * breakdown, the matched and missing skills all come from the deterministic
 * engine and are rendered before anything AI-shaped. If the review is missing,
 * one sentence says so and nothing else about the page changes — no empty
 * panel, no spinner that never resolves, no apology occupying the space where
 * the answer should be.
 */

export interface DemoResultsProps {
  data: DemoAnalysisData;
}

const CATEGORY_LABELS: Record<string, string> = {
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  keywords: "Keywords",
  responsibilities: "Responsibilities",
};

export const DemoResults = React.forwardRef<HTMLDivElement, DemoResultsProps>(
  function DemoResults({ data }, ref) {
    const { analysis, aiInsights, aiNote } = data;

    return (
      <div ref={ref} tabIndex={-1} className="mt-10 flex flex-col gap-8 focus:outline-none">
        <section aria-labelledby="demo-score-heading">
          <h2
            id="demo-score-heading"
            className="text-sm font-semibold text-consulting-navy dark:text-white"
          >
            Match score
          </h2>

          <p className="mt-2 flex items-baseline gap-2">
            {/* The number is text first. The bar below is decoration and is
                hidden from assistive tech rather than duplicated into it. */}
            <span className="text-4xl font-bold tabular-nums text-consulting-navy dark:text-white">
              {analysis.overallScore}
            </span>
            <span className="text-sm text-consulting-slate dark:text-slate-400">/ 100</span>
          </p>
          <p className="mt-1 text-xs text-consulting-slate dark:text-slate-400">
            Computed on the server from the resume text. No model involved.
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {analysis.breakdown.map((entry) => (
              <div
                key={entry.category}
                className="rounded-lg border border-slate-200 p-3 dark:border-white/10"
              >
                <dt className="text-xs text-consulting-slate dark:text-slate-400">
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-consulting-navy dark:text-white">
                  {entry.score}
                </dd>
                <div
                  aria-hidden="true"
                  className="mt-2 h-1 rounded-full bg-slate-200 dark:bg-white/10"
                >
                  <div
                    className="h-1 rounded-full bg-consulting-royal"
                    style={{ width: `${Math.min(100, Math.max(0, entry.score))}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="demo-matched-heading">
            <h3
              id="demo-matched-heading"
              className="text-sm font-semibold text-consulting-navy dark:text-white"
            >
              Matched ({analysis.skillMatches.length})
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {analysis.skillMatches.map((match) => (
                <li
                  key={match.skill}
                  className="rounded-full border border-emerald-300/60 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                >
                  {match.displayName}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="demo-missing-heading">
            <h3
              id="demo-missing-heading"
              className="text-sm font-semibold text-consulting-navy dark:text-white"
            >
              Missing ({analysis.missingSkills.length})
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {analysis.missingSkills.map((gap) => (
                <li key={gap.skill} className="text-xs text-consulting-slate dark:text-slate-300">
                  <span className="font-medium text-consulting-navy dark:text-white">
                    {gap.displayName}
                  </span>
                  <span className="ml-2 rounded border border-slate-300 px-1 py-0.5 text-[10px] uppercase tracking-wide dark:border-white/15">
                    {gap.importance}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section aria-labelledby="demo-ai-heading">
          <h2
            id="demo-ai-heading"
            className="text-sm font-semibold text-consulting-navy dark:text-white"
          >
            AI review
          </h2>

          {aiInsights ? (
            <div className="mt-3 flex flex-col gap-5">
              <p className="text-sm leading-relaxed text-consulting-slate dark:text-slate-300">
                {aiInsights.overallSummary}
              </p>

              {aiInsights.strengths.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-consulting-slate dark:text-slate-400">
                    Strengths
                  </h3>
                  <ul className="mt-2 flex flex-col gap-3">
                    {aiInsights.strengths.map((item, index) => (
                      <li key={`${item.headline}-${index}`} className="text-sm">
                        <p className="font-medium text-consulting-navy dark:text-white">
                          {item.headline}
                        </p>
                        <p className="mt-0.5 text-consulting-slate dark:text-slate-300">
                          {item.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiInsights.weaknesses.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-consulting-slate dark:text-slate-400">
                    Gaps
                  </h3>
                  <ul className="mt-2 flex flex-col gap-3">
                    {aiInsights.weaknesses.map((item, index) => (
                      <li key={`${item.headline}-${index}`} className="text-sm">
                        <p className="font-medium text-consulting-navy dark:text-white">
                          {item.headline}
                        </p>
                        <p className="mt-0.5 text-consulting-slate dark:text-slate-300">
                          {item.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* The provenance strip. Cheap to render and the detail that tells
                  an engineer this is a real pipeline rather than a mock. */}
              <p className="text-xs text-consulting-slate dark:text-slate-400">
                {aiInsights.aiProvider} · {aiInsights.aiModel} · prompt{" "}
                {aiInsights.aiPromptVersion}
              </p>
            </div>
          ) : (
            <p
              className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-consulting-slate dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
              role="status"
            >
              {aiNote ?? "AI review is temporarily unavailable."}{" "}
              {/* Full-strength slate, not /80: at 80% opacity axe measured this
                  at 3.13 against the panel, under the 4.5 AA needs for body
                  text. The de-emphasis was not worth an unreadable sentence. */}
              <span className="text-consulting-slate dark:text-slate-400">
                The score above is unaffected.
              </span>
            </p>
          )}
        </section>
      </div>
    );
  },
);
