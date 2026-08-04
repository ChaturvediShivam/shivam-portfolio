"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleAlert,
  Info,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/admin/ui";
import type { AiResumeInsights } from "@/lib/ai-analysis/AIAnalysisTypes";
import type { JobDescriptionAnalysis, ResumeAnalysis, ScoreCategory } from "@/types/resume-analysis";

/**
 * Resume AI review (Feature 1 — presentation layer).
 *
 * The single results surface. It renders the deterministic analysis and the AI
 * enrichment together, and computes nothing: every number here is already in
 * `ResumeAnalysis`, every judgement already in `AiResumeInsights`.
 *
 * Three rules this layout exists to enforce:
 *
 *   1. TWO NUMBERS, NEVER ONE. The ATS score and the confidence behind it sit
 *      side by side. A resume can score well because the posting asked for
 *      almost nothing, and showing the score alone would let that read as a
 *      genuine match.
 *   2. EVERY SECTION DECLARES ITS SOURCE. `Computed` sections are reproducible
 *      arithmetic; `AI` sections are a model's judgement. The moment a reader
 *      cannot tell which is which, the reproducibility of the score stops being
 *      worth anything.
 *   3. GAPS BEFORE MATCHES. The operator came to find out why they were
 *      rejected. Eight green checks above one red X buries the answer.
 *
 * Degrades to the deterministic half alone when `insights` is null — the AI
 * enrichment can fail entirely and this page still says something true.
 */

export interface AiReviewProps {
  analysis: ResumeAnalysis;
  jobDescription: JobDescriptionAnalysis;
  insights: AiResumeInsights | null;
}

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  keywords: "Keywords",
  responsibilities: "Responsibilities",
};

/**
 * Status bands, not a gradient.
 *
 * Coarse on purpose — a smooth colour ramp would imply the score is precise to
 * the point. Each band ships a `label` and an icon so the state never rests on
 * colour alone.
 */
type Tone = {
  label: string;
  text: string;
  fill: string;
  track: string;
  ring: string;
  Icon: React.ComponentType<{ className?: string }>;
};

function toneFor(score: number): Tone {
  if (score >= 75) {
    return {
      label: "Strong",
      text: "text-emerald-400",
      fill: "bg-emerald-400",
      track: "bg-emerald-400/10",
      ring: "stroke-emerald-400",
      Icon: ShieldCheck,
    };
  }
  if (score >= 50) {
    return {
      label: "Partial",
      text: "text-amber-300",
      fill: "bg-amber-300",
      track: "bg-amber-300/10",
      ring: "stroke-amber-300",
      Icon: CircleAlert,
    };
  }
  return {
    label: "Weak",
    text: "text-red-400",
    fill: "bg-red-400",
    track: "bg-red-400/10",
    ring: "stroke-red-400",
    Icon: TrendingDown,
  };
}

/** Section shell. `source` is required — every panel says where its content came from. */
function Panel({
  title,
  description,
  source,
  count,
  children,
  className,
}: {
  title: string;
  description?: string;
  source: "computed" | "ai";
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-white">
            {title}
            {typeof count === "number" && (
              <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
                {count}
              </span>
            )}
          </h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        <SourceTag source={source} />
      </div>
      {children}
    </section>
  );
}

/**
 * The provenance marker.
 *
 * Deliberately plain rather than decorative: it is a factual claim about how the
 * content below was produced, and the reader has to be able to trust it at a
 * glance without learning a colour code.
 */
function SourceTag({ source }: { source: "computed" | "ai" }) {
  return source === "computed" ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
      <Check className="size-2.5" aria-hidden />
      Computed
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/[0.07] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-300">
      <Sparkles className="size-2.5" aria-hidden />
      AI
    </span>
  );
}

/**
 * Horizontal meter.
 *
 * Track is a lighter step of the fill's own ramp so the severity reads across
 * the whole bar rather than only the filled part. 4px rounded data-end, square
 * at the baseline.
 */
function Meter({ value, tone, className }: { value: number; tone: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-sm", tone.track, className)}>
      <div
        className={cn("h-full rounded-r-[4px]", tone.fill)}
        style={{ width: `${pct}%` }}
        role="presentation"
      />
    </div>
  );
}

/** A quoted line from the resume or posting. Monospace-free; it is prose, not code. */
function Evidence({ children }: { children: string }) {
  return (
    <p className="mt-1.5 border-l-2 border-white/10 pl-2.5 text-xs italic leading-relaxed text-slate-500">
      {children}
    </p>
  );
}

export function AiReview({ analysis, jobDescription, insights }: AiReviewProps) {
  const tone = toneFor(analysis.overallScore);
  const confidencePct = Math.round(analysis.confidence.value * 100);

  // Requirements met — genuinely different from the weighted ATS score, which
  // also folds in keywords, education and responsibilities.
  const { matchedRequiredSkills, totalRequiredSkills, matchedPreferredSkills, totalPreferredSkills } =
    analysis.summary;
  const totalSkills = totalRequiredSkills + totalPreferredSkills;
  const matchPct =
    totalSkills > 0
      ? Math.round(((matchedRequiredSkills + matchedPreferredSkills) / totalSkills) * 100)
      : null;

  const missingRequired = analysis.missingSkills.filter((s) => s.importance === "required");
  const missingPreferred = analysis.missingSkills.filter((s) => s.importance === "preferred");

  return (
    <div className="space-y-4">
      {/* ── Scores ─────────────────────────────────────────────────────── */}
      <Panel
        title="Match overview"
        description={analysis.summary.headline}
        source="computed"
      >
        <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          <AtsScoreTile score={analysis.overallScore} tone={tone} />
          <MatchTile matchPct={matchPct} summary={analysis.summary} />
          <ConfidenceTile value={confidencePct} reasons={analysis.confidence.reasons} />
        </div>

        <ul className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
          {analysis.breakdown.map((entry) => {
            const rowTone = toneFor(entry.score);
            return (
              <li key={entry.category}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-slate-300">
                    {CATEGORY_LABELS[entry.category]}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    <span className={rowTone.text}>{entry.score}</span>
                    <span className="text-slate-600"> / 100</span>
                    <span className="ml-1.5 text-[11px] text-slate-600">
                      ×{Math.round(entry.weight * 100)}%
                    </span>
                  </span>
                </div>
                <Meter value={entry.score} tone={rowTone} className="mt-1.5" />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{entry.detail}</p>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* ── Executive summary ──────────────────────────────────────────── */}
      {insights && (
        <Panel
          title="Executive summary"
          description="What the numbers above mean for this application."
          source="ai"
        >
          <p className="text-sm leading-relaxed text-slate-200">{insights.overallSummary}</p>

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex shrink-0 items-baseline gap-1.5">
              <span
                className={cn(
                  "text-2xl font-semibold leading-none",
                  toneFor(insights.overallHiringProbability).text,
                )}
              >
                {insights.overallHiringProbability}
              </span>
              <span className="text-xs text-slate-500">%</span>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Estimated chance of an interview
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{insights.reasoning}</p>
            </div>
          </div>
        </Panel>
      )}

      {/* ── Gaps first: the answer to "why was I rejected" ─────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SkillGapPanel
          criticalGaps={insights?.criticalGaps ?? []}
          missingRequired={missingRequired}
          missingPreferred={missingPreferred}
        />
        <ExperienceGapPanel analysis={analysis} />
      </div>

      {/* ── Strengths / weaknesses ─────────────────────────────────────── */}
      {insights && (insights.strengths.length > 0 || insights.weaknesses.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {insights.strengths.length > 0 && (
            <Panel title="Strengths" source="ai" count={insights.strengths.length}>
              <ul className="space-y-3.5">
                {insights.strengths.map((s, i) => (
                  <li key={`${s.headline}-${i}`}>
                    <p className="flex items-start gap-2 text-sm font-medium text-slate-100">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
                      {s.headline}
                    </p>
                    <p className="mt-1 pl-5.5 text-xs leading-relaxed text-slate-400">{s.detail}</p>
                    {s.evidence && <Evidence>{s.evidence}</Evidence>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {insights.weaknesses.length > 0 && (
            <Panel title="Weaknesses" source="ai" count={insights.weaknesses.length}>
              <ul className="space-y-3.5">
                {insights.weaknesses.map((w, i) => (
                  <li key={`${w.headline}-${i}`}>
                    <p className="flex items-start gap-2 text-sm font-medium text-slate-100">
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0",
                          w.severity === "critical"
                            ? "text-red-400"
                            : w.severity === "important"
                              ? "text-amber-400"
                              : "text-slate-500",
                        )}
                        aria-hidden
                      />
                      {w.headline}
                      <span className="sr-only"> — {w.severity}</span>
                    </p>
                    <p className="mt-1 pl-5.5 text-xs leading-relaxed text-slate-400">{w.detail}</p>
                    {w.evidence && <Evidence>{w.evidence}</Evidence>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {/* ── Missing keywords ───────────────────────────────────────────── */}
      <MissingKeywordsPanel
        keywords={insights?.missingKeywords?.length ? insights.missingKeywords : analysis.keywords.missing}
        matched={analysis.keywords.matched}
        coverage={analysis.keywords.coverage}
        fromAi={Boolean(insights?.missingKeywords?.length)}
      />

      {/* ── Action plan ────────────────────────────────────────────────── */}
      {insights && insights.recommendations.length > 0 && (
        <ActionPlanPanel recommendations={insights.recommendations} />
      )}

      {/* ── Posting warnings ───────────────────────────────────────────── */}
      {jobDescription.warnings.length > 0 && (
        <ul className="space-y-1.5" aria-label="Job description warnings">
          {jobDescription.warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-300"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      )}

      <Provenance analysis={analysis} insights={insights} />
    </div>
  );
}

/**
 * The hero figure — the one number this view leads with.
 *
 * A ring rather than a bar because it is the only radial mark on the page and
 * therefore unambiguous. Colour is backed by an icon and a word, so the state
 * survives colourblindness, greyscale print and forced-colors.
 */
function AtsScoreTile({ score, tone }: { score: number; tone: Tone }) {
  const circumference = 2 * Math.PI * 34;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden className="-rotate-90">
          <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" className="stroke-white/[0.06]" />
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className={tone.ring}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-[28px] font-semibold leading-none", tone.text)}>{score}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">ATS score</p>
        <p className={cn("mt-1 flex items-center gap-1.5 text-sm font-medium", tone.text)}>
          <tone.Icon className="size-3.5 shrink-0" />
          {tone.label} match
        </p>
        <p className="mt-0.5 text-[11px] text-slate-600">out of 100</p>
      </div>
    </div>
  );
}

function MatchTile({
  matchPct,
  summary,
}: {
  matchPct: number | null;
  summary: ResumeAnalysis["summary"];
}) {
  const tone = toneFor(matchPct ?? 0);

  return (
    <div className="flex flex-col justify-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Requirements met
      </p>
      {matchPct === null ? (
        <>
          <p className="mt-1 text-2xl font-semibold leading-none text-slate-400">—</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
            The posting names no specific skills.
          </p>
        </>
      ) : (
        <>
          <p className={cn("mt-1 text-2xl font-semibold leading-none", tone.text)}>{matchPct}%</p>
          <Meter value={matchPct} tone={tone} className="mt-2" />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
            {summary.matchedRequiredSkills}/{summary.totalRequiredSkills} required ·{" "}
            {summary.matchedPreferredSkills}/{summary.totalPreferredSkills} preferred
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Confidence.
 *
 * Sits beside the score rather than below it, because it is the qualifier that
 * stops a high score being over-read. Its reasons are shown, not hidden behind
 * a tooltip — they are the whole point.
 */
function ConfidenceTile({ value, reasons }: { value: number; reasons: string[] }) {
  const tone = toneFor(value);

  return (
    <div className="flex flex-col justify-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Confidence</p>
      <p className={cn("mt-1 text-2xl font-semibold leading-none", tone.text)}>{value}%</p>
      <Meter value={value} tone={tone} className="mt-2" />
      {reasons.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {reasons.slice(0, 2).map((reason) => (
            <li key={reason} className="flex items-start gap-1 text-[11px] leading-relaxed text-slate-600">
              <Info className="mt-0.5 size-2.5 shrink-0" aria-hidden />
              {reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-600">The posting was fully specified.</p>
      )}
    </div>
  );
}

function SkillGapPanel({
  criticalGaps,
  missingRequired,
  missingPreferred,
}: {
  criticalGaps: NonNullable<AiResumeInsights["criticalGaps"]>;
  missingRequired: ResumeAnalysis["missingSkills"];
  missingPreferred: ResumeAnalysis["missingSkills"];
}) {
  const total = missingRequired.length + missingPreferred.length;

  return (
    <Panel
      title="Skill gap"
      description="Skills the posting asks for that your resume does not evidence."
      source={criticalGaps.length > 0 ? "ai" : "computed"}
      count={total}
    >
      {total === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-400">
          <Check className="size-4 shrink-0" aria-hidden />
          Every skill the posting names is evidenced in your resume.
        </p>
      ) : (
        <div className="space-y-4">
          {criticalGaps.length > 0 && (
            <ul className="space-y-3">
              {criticalGaps.map((gap, i) => (
                <li key={`${gap.skill}-${i}`} className="rounded-lg border border-red-500/15 bg-red-500/[0.04] p-3">
                  <p className="flex items-start gap-2 text-sm font-medium text-red-300">
                    <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {gap.displayName ?? gap.skill}
                  </p>
                  {gap.impact && (
                    <p className="mt-1 pl-5.5 text-xs leading-relaxed text-slate-400">{gap.impact}</p>
                  )}
                  {gap.requestedIn && <Evidence>{gap.requestedIn}</Evidence>}
                </li>
              ))}
            </ul>
          )}

          {missingRequired.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Required · {missingRequired.length}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingRequired.map((s) => (
                  <Badge key={s.skill} variant="danger">
                    {s.displayName}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {missingPreferred.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Preferred · {missingPreferred.length}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingPreferred.map((s) => (
                  <Badge key={s.skill} variant="neutral">
                    {s.displayName}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function ExperienceGapPanel({ analysis }: { analysis: ResumeAnalysis }) {
  const { requiredYears, resumeYears, meets, evidence, derivedFrom } = analysis.experience;
  const education = analysis.education;

  return (
    <Panel
      title="Experience gap"
      description="Years and education, against what the posting asks for."
      source="computed"
    >
      <div className="space-y-4">
        <div className="flex items-stretch gap-3">
          <StatBlock label="Asked for" value={requiredYears === null ? "—" : `${requiredYears}+ yrs`} />
          <div className="flex items-center text-slate-600" aria-hidden>
            <ArrowRight className="size-4" />
          </div>
          <StatBlock
            label="Evidenced"
            value={resumeYears === null ? "—" : `${resumeYears} yrs`}
            tone={meets === null ? undefined : meets ? "text-emerald-400" : "text-red-400"}
          />
        </div>

        <p className="text-xs leading-relaxed text-slate-400">
          {requiredYears === null
            ? "The posting states no minimum experience."
            : resumeYears === null
              ? "No total years could be derived from the resume."
              : meets
                ? `Meets the stated minimum, derived from ${derivedFrom === "explicit_statement" ? "an explicit statement" : "date ranges"}.`
                : `Short of the stated minimum, derived from ${derivedFrom === "explicit_statement" ? "an explicit statement" : "date ranges"}.`}
        </p>
        {evidence && <Evidence>{evidence}</Evidence>}

        <div className="border-t border-white/[0.06] pt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Education
          </p>
          <p className="flex items-center gap-2 text-xs text-slate-400">
            {education.requiredLevel === "none" ? (
              <>
                <Info className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                The posting states no requirement.
              </>
            ) : education.meets ? (
              <>
                <Check className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
                {education.requiredLevel} asked for · {education.resumeLevel} evidenced
              </>
            ) : (
              <>
                <X className="size-3.5 shrink-0 text-red-400" aria-hidden />
                {education.requiredLevel} asked for · {education.resumeLevel} evidenced
              </>
            )}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function StatBlock({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold leading-none", tone ?? "text-slate-200")}>
        {value}
      </p>
    </div>
  );
}

function MissingKeywordsPanel({
  keywords,
  matched,
  coverage,
  fromAi,
}: {
  keywords: string[];
  matched: string[];
  coverage: number;
  fromAi: boolean;
}) {
  const pct = Math.round(coverage * 100);
  const tone = toneFor(pct);

  return (
    <Panel
      title="Missing keywords"
      description="Terms the posting uses that your resume does not."
      source={fromAi ? "ai" : "computed"}
      count={keywords.length}
    >
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-slate-400">Keyword coverage</span>
          <span className="text-xs">
            <span className={tone.text}>{pct}%</span>
            <span className="text-slate-600">
              {" "}
              · {matched.length} of {matched.length + keywords.length}
            </span>
          </span>
        </div>
        <Meter value={pct} tone={tone} className="mt-1.5" />
      </div>

      {keywords.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-400">
          <Check className="size-4 shrink-0" aria-hidden />
          Every term the posting uses appears in your resume.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((term) => (
            <span
              key={term}
              className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-xs text-slate-300"
            >
              {term}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * Action plan.
 *
 * Sorted high → low, because the list is meant to be worked top-down. Each item
 * shows its reason: "add Power BI" is an instruction, "Power BI appears in the
 * posting and was not detected in your resume" is something the operator can
 * check and disagree with.
 */
function ActionPlanPanel({
  recommendations,
}: {
  recommendations: NonNullable<AiResumeInsights["recommendations"]>;
}) {
  const order = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...recommendations].sort(
    (a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3),
  );
  const variant = { high: "danger", medium: "progress", low: "neutral" } as const;

  return (
    <Panel
      title="Action plan"
      description="Ordered by impact. Work top-down."
      source="ai"
      count={sorted.length}
    >
      <ol className="space-y-3">
        {sorted.map((rec, i) => (
          <li
            key={`${rec.action}-${i}`}
            className="flex gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
          >
            <span
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-medium text-slate-400"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={variant[rec.priority] ?? "neutral"}>{rec.priority}</Badge>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-100">{rec.action}</p>
              {rec.why && <p className="mt-1 text-xs leading-relaxed text-slate-500">{rec.why}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/**
 * Provenance and dropped claims.
 *
 * `dropped` is surfaced rather than hidden. It is the visible proof that the
 * grounding layer rejected model output it could not tie to evidence — a
 * drifting model becomes observable here instead of merely plausible.
 */
function Provenance({
  analysis,
  insights,
}: {
  analysis: ResumeAnalysis;
  insights: AiResumeInsights | null;
}) {
  return (
    <div className="space-y-2 px-1">
      {insights && insights.dropped.length > 0 && (
        <details className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-slate-400 transition-colors hover:text-slate-200">
            <Info className="size-3.5 shrink-0" aria-hidden />
            {insights.dropped.length} claim{insights.dropped.length === 1 ? "" : "s"} discarded as
            unsupported
          </summary>
          <ul className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
            {insights.dropped.map((reason, i) => (
              <li key={`${reason}-${i}`} className="text-[11px] leading-relaxed text-slate-500">
                {reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[11px] text-slate-600">
        Engine v{analysis.engineVersion}
        {insights && (
          <>
            {" · "}
            {insights.aiProvider}/{insights.aiModel} · prompt v{insights.aiPromptVersion}
          </>
        )}
      </p>
    </div>
  );
}
