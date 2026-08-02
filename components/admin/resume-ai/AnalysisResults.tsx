"use client";

import * as React from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/admin/ui";
import type { JobDescriptionAnalysis, ResumeAnalysis, ScoreBreakdown } from "@/types/resume-analysis";

/**
 * Deterministic analysis results (Resume AI · Phase 3).
 *
 * Presentational only — every number is computed by
 * `lib/resume-analysis/ResumeAnalysisService.ts` before this renders.
 *
 * Two decisions worth stating, because both resist the obvious design:
 *
 *   • Confidence sits next to the score rather than buried. A resume can score
 *     well because the posting asked for almost nothing, and showing the number
 *     alone would let that read as a genuine match.
 *   • Every matched skill shows the resume line it was found on. The operator's
 *     next question after "matched" is always "where?", and a score they cannot
 *     trace to their own words is a score they have no reason to trust.
 */

export interface AnalysisResultsProps {
  analysis: ResumeAnalysis;
  jobDescription: JobDescriptionAnalysis;
}

const CATEGORY_LABELS: Record<string, string> = {
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  keywords: "Keywords",
  responsibilities: "Responsibilities",
};

/** Colour bands. Deliberately coarse — a precise gradient would imply precision. */
function scoreTone(score: number): { text: string; bar: string; ring: string } {
  if (score >= 75) return { text: "text-emerald-400", bar: "bg-emerald-400/70", ring: "stroke-emerald-400" };
  if (score >= 50) return { text: "text-amber-300", bar: "bg-amber-300/70", ring: "stroke-amber-300" };
  return { text: "text-red-400", bar: "bg-red-400/70", ring: "stroke-red-400" };
}

export function AnalysisResults({ analysis, jobDescription }: AnalysisResultsProps) {
  const tone = scoreTone(analysis.overallScore);
  const required = analysis.skillMatches.filter((m) => m.importance === "required");
  const preferred = analysis.skillMatches.filter((m) => m.importance === "preferred");
  const missingRequired = analysis.missingSkills.filter((m) => m.importance === "required");
  const missingPreferred = analysis.missingSkills.filter((m) => m.importance === "preferred");

  return (
    <section
      aria-labelledby="analysis-results-heading"
      className="space-y-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <div>
        <h3 id="analysis-results-heading" className="text-sm font-semibold text-white">
          Analysis
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Computed locally from your resume and the job description. No AI involved.
        </p>
      </div>

      <ScoreHeader analysis={analysis} tone={tone} />

      <div className="space-y-2">
        {analysis.breakdown.map((entry) => (
          <CategoryRow key={entry.category} entry={entry} />
        ))}
      </div>

      <SkillColumns
        required={required}
        preferred={preferred}
        missingRequired={missingRequired}
        missingPreferred={missingPreferred}
      />

      <KeywordPanel analysis={analysis} />

      {jobDescription.warnings.length > 0 && (
        <ul className="space-y-1.5" aria-label="Job description warnings">
          {jobDescription.warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-300"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-600">
        Engine v{analysis.engineVersion} · recommendations arrive in a later step.
      </p>
    </section>
  );
}

function ScoreHeader({
  analysis,
  tone,
}: {
  analysis: ResumeAnalysis;
  tone: ReturnType<typeof scoreTone>;
}) {
  const confidencePct = Math.round(analysis.confidence.value * 100);

  return (
    <div className="flex flex-wrap items-start gap-5 rounded-md border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-baseline gap-1" role="img" aria-label={`Overall match score ${analysis.overallScore} out of 100`}>
        <span className={cn("text-4xl font-semibold tabular-nums", tone.text)}>
          {analysis.overallScore}
        </span>
        <span className="text-sm text-slate-600">/100</span>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-slate-300">{analysis.summary.headline}</p>
        <p className="text-xs text-slate-500">
          Confidence {confidencePct}%
          {analysis.confidence.reasons.length > 0 && " — see below"}
        </p>

        {analysis.confidence.reasons.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {analysis.confidence.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-1.5 text-xs text-slate-600">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                {reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ entry }: { entry: ScoreBreakdown }) {
  const tone = scoreTone(entry.score);

  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-200">{CATEGORY_LABELS[entry.category] ?? entry.category}</span>
        <span className="flex items-baseline gap-2 text-xs text-slate-500">
          <span className="text-slate-600">weight {Math.round(entry.weight * 100)}%</span>
          <span className={cn("text-sm font-medium tabular-nums", tone.text)}>{entry.score}</span>
        </span>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-label={`${CATEGORY_LABELS[entry.category] ?? entry.category} score`}
        aria-valuenow={entry.score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full rounded-full transition-[width]", tone.bar)} style={{ width: `${entry.score}%` }} />
      </div>

      <p className="mt-1.5 text-xs text-slate-500">{entry.detail}</p>
    </div>
  );
}

function SkillColumns({
  required,
  preferred,
  missingRequired,
  missingPreferred,
}: {
  required: ResumeAnalysis["skillMatches"];
  preferred: ResumeAnalysis["skillMatches"];
  missingRequired: ResumeAnalysis["missingSkills"];
  missingPreferred: ResumeAnalysis["missingSkills"];
}) {
  const nothing = required.length + preferred.length + missingRequired.length + missingPreferred.length === 0;

  if (nothing) {
    return (
      <p className="rounded-md border border-white/[0.06] px-3 py-2 text-xs text-slate-500">
        The posting named no skills this engine recognises, so there was nothing to match.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <Check className="size-3.5" aria-hidden />
          Matched ({required.length + preferred.length})
        </h4>
        {required.length + preferred.length === 0 ? (
          <p className="text-xs text-slate-600">None.</p>
        ) : (
          <ul className="space-y-1.5">
            {[...required, ...preferred].map((match) => (
              <li key={match.skill} className="text-xs">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-200">{match.displayName}</span>
                  {match.importance === "required" && <Badge variant="info">required</Badge>}
                  {match.matchedVia === "related" && <Badge variant="neutral">related</Badge>}
                </span>
                {match.evidence && (
                  <span className="mt-0.5 block truncate text-slate-600" title={match.evidence}>
                    {match.evidence}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-red-400">
          <X className="size-3.5" aria-hidden />
          Missing ({missingRequired.length + missingPreferred.length})
        </h4>
        {missingRequired.length + missingPreferred.length === 0 ? (
          <p className="text-xs text-slate-600">Nothing the posting asked for is absent.</p>
        ) : (
          <ul className="space-y-1.5">
            {[...missingRequired, ...missingPreferred].map((skill) => (
              <li key={skill.skill} className="text-xs">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-200">{skill.displayName}</span>
                  {skill.importance === "required" ? (
                    <Badge variant="danger">required</Badge>
                  ) : (
                    <Badge variant="neutral">preferred</Badge>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-slate-600" title={skill.requestedIn}>
                  {skill.requestedIn}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KeywordPanel({ analysis }: { analysis: ResumeAnalysis }) {
  const { matched, missing } = analysis.keywords;
  if (matched.length + missing.length === 0) return null;

  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
      <h4 className="mb-2 text-xs font-medium text-slate-400">
        Keyword match — {Math.round(analysis.keywords.coverage * 100)}% of the posting&rsquo;s terms
      </h4>

      <div className="flex flex-wrap gap-1.5">
        {matched.map((term) => (
          <span key={term} className="rounded border border-emerald-500/20 bg-emerald-500/[0.06] px-1.5 py-0.5 text-xs text-emerald-300">
            {term}
          </span>
        ))}
        {missing.map((term) => (
          <span key={term} className="rounded border border-white/[0.08] px-1.5 py-0.5 text-xs text-slate-600 line-through">
            {term}
          </span>
        ))}
      </div>
    </div>
  );
}
