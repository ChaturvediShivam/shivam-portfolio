"use client";

import { useState, useTransition } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { analyzeJobFitAction } from "@/app/admin/(dashboard)/job-feed/actions";
import type {
  CompensationFit,
  FitRating,
  JobMatchRecord,
  MatchRecommendation,
} from "@/types/job-match";

/**
 * Per-job fit analysis (Phase 2 · AI job matching).
 *
 * Renders a trigger and, once clicked, the verdict. It holds no prompt text and
 * no model configuration — it sends a job id to a Server Action and renders
 * what comes back. That is what keeps the provider API key server-side and keeps
 * prompt changes out of UI review.
 *
 * Analysis is explicitly user-triggered. There is no effect that fires on
 * mount, deliberately: a feed of jobs that analyzed itself on render would be a
 * bill on every page load.
 */

const RECOMMENDATION_VARIANT: Record<MatchRecommendation, BadgeVariant> = {
  APPLY: "success",
  MAYBE: "progress",
  SKIP: "danger",
};

const FIT_VARIANT: Record<FitRating | CompensationFit, BadgeVariant> = {
  GOOD: "success",
  PARTIAL: "progress",
  POOR: "danger",
  UNKNOWN: "neutral",
};

/** Score colour tracks the prompt's own bands, so the two cannot disagree. */
function scoreClass(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function List({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-xs leading-relaxed text-slate-300">
            <span aria-hidden="true" className="text-slate-600">
              —{" "}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JobMatchPanel({ jobId }: { jobId: string }) {
  const [record, setRecord] = useState<JobMatchRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function analyze(refresh: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await analyzeJobFitAction({ jobId, refresh });
      if (isActionError(result)) {
        setError(result.formError ?? "Could not analyze this job.");
        return;
      }
      setRecord(result.data.record);
    });
  }

  if (!record) {
    return (
      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <button
          type="button"
          onClick={() => analyze(false)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200 disabled:opacity-50"
        >
          <Sparkles size={12} aria-hidden="true" />
          {pending ? "Analyzing…" : "Analyze fit"}
        </button>
        {error ? <p className="mt-2 text-[11px] text-red-400">{error}</p> : null}
      </div>
    );
  }

  const { match } = record;

  return (
    <div className="mt-4 space-y-4 border-t border-white/[0.06] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-2xl font-semibold tabular-nums ${scoreClass(match.overall_match_score)}`}>
          {match.overall_match_score}
          <span className="text-sm text-slate-500">/100</span>
        </span>
        <Badge variant={RECOMMENDATION_VARIANT[match.recommendation]}>{match.recommendation}</Badge>
        <Badge variant="neutral">Confidence: {match.confidence}</Badge>
      </div>

      <p className="text-xs leading-relaxed text-slate-300">{match.explanation}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <List title="Why it fits" items={match.strengths} />
        <List title="Gaps" items={match.gaps} />
        <List title="Matching skills" items={match.required_skills_match} />
        <List title="Transferable" items={match.transferable_skills} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          Experience <Badge variant={FIT_VARIANT[match.experience_fit]}>{match.experience_fit}</Badge>
        </span>
        <span className="inline-flex items-center gap-1.5">
          Role <Badge variant={FIT_VARIANT[match.role_fit]}>{match.role_fit}</Badge>
        </span>
        <span className="inline-flex items-center gap-1.5">
          Compensation{" "}
          <Badge variant={FIT_VARIANT[match.compensation_fit]}>{match.compensation_fit}</Badge>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
        <button
          type="button"
          onClick={() => analyze(true)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-50"
        >
          <RefreshCw size={11} aria-hidden="true" />
          {pending ? "Re-analyzing…" : "Re-analyze"}
        </button>
        {record.cached ? <span>Cached assessment</span> : null}
        {/* A fallback profile means the verdict rests on a summary, not a
            resume. Saying so is the difference between a score the operator can
            calibrate and one they over-trust. */}
        {record.profileSource === "fallback" ? (
          <span className="text-amber-400/70">Based on a summary profile, not a stored resume</span>
        ) : null}
      </div>

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
    </div>
  );
}
