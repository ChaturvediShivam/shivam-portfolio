"use client";

import * as React from "react";
import { Check, Copy, Download, FileText, Loader2, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Button } from "@/components/admin/ui";
import { diffWords, changeRatio, type DiffToken } from "@/lib/resume/diff";
import { downloadDocx } from "@/lib/resume/exportDocx";
import {
  INTENSITY_HINTS,
  INTENSITY_LABELS,
  REWRITE_INTENSITIES,
  REWRITE_SECTIONS,
  REWRITE_TARGETS,
  SCOPE_LABELS,
  TARGET_HINTS,
  TARGET_LABELS,
  type RewriteIntensity,
  type RewriteResult,
  type RewriteScope,
  type RewriteTarget,
  type SectionRewrite,
} from "@/lib/ai-analysis/RewriteTypes";

/**
 * Resume rewrite (Resume AI · Feature 2).
 *
 * Presentational plus local control state. Every rewrite is produced by the
 * existing gateway through `rewriteResumeAction`; nothing here calls a model,
 * and nothing here decides what is allowed to change.
 *
 * The side-by-side is the point of the screen. A rewrite shown alone is one the
 * operator either pastes without reading or discards without reading, and the
 * diff is what makes the third option — actually checking it — cheap enough to
 * do. Confidence and reasoning sit on every section for the same reason.
 */

export interface ResumeRewriteProps {
  enabled: boolean;
  pending: boolean;
  error: string | null;
  result: RewriteResult | null;
  onGenerate: (options: {
    intensity: RewriteIntensity;
    target: RewriteTarget;
    scope: RewriteScope;
  }) => void;
}

/** Segmented control. Radios under the hood so arrow keys and labels work for free. */
function Segmented<T extends string>({
  legend,
  value,
  options,
  labels,
  hints,
  disabled,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  hints?: Record<T, string>;
  disabled: boolean;
  onChange: (next: T) => void;
}) {
  const name = React.useId();

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option === value;
          return (
            <label
              key={option}
              className={cn(
                "cursor-pointer rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                "focus-within:ring-2 focus-within:ring-white/20",
                disabled && "cursor-not-allowed opacity-50",
                selected
                  ? "border-white/25 bg-white/[0.08] font-medium text-white"
                  : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:text-slate-200",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {labels[option]}
            </label>
          );
        })}
      </div>
      {hints && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{hints[value]}</p>}
    </fieldset>
  );
}

/** Copy-to-clipboard with a two-second confirmation. */
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied by permissions policy; failing silently is
      // better than an error banner for something the operator can do by hand.
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

/**
 * One side of the diff.
 *
 * `side="original"` hides inserts and marks deletes; `side="rewritten"` hides
 * deletes and marks inserts. Both render from the same token list, so the two
 * columns cannot disagree about what changed.
 */
function DiffColumn({ tokens, side }: { tokens: DiffToken[]; side: "original" | "rewritten" }) {
  const hidden = side === "original" ? "insert" : "delete";
  const marked = side === "original" ? "delete" : "insert";

  return (
    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
      {tokens
        .filter((token) => token.op !== hidden)
        .map((token, i) =>
          token.op === marked ? (
            <mark
              key={i}
              className={cn(
                "rounded-sm px-0.5",
                side === "original"
                  ? "bg-red-500/15 text-red-300 line-through decoration-red-400/50"
                  : "bg-emerald-500/15 text-emerald-200",
              )}
            >
              {token.value}
            </mark>
          ) : (
            <React.Fragment key={i}>{token.value}</React.Fragment>
          ),
        )}
    </p>
  );
}

function confidenceTone(value: number): string {
  if (value >= 75) return "text-emerald-400";
  if (value >= 50) return "text-amber-300";
  return "text-red-400";
}

function SectionCard({ section }: { section: SectionRewrite }) {
  const tokens = React.useMemo(
    () => diffWords(section.original, section.rewritten),
    [section.original, section.rewritten],
  );
  const changed = Math.round(changeRatio(tokens) * 100);
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h4 id={headingId} className="text-sm font-semibold text-white">
            {section.heading}
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-600">{changed}% of wording changed</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/[0.07] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-300">
            <Sparkles className="size-2.5" aria-hidden />
            AI generated
          </span>
          <span className="text-[11px] text-slate-500">
            Confidence{" "}
            <span className={cn("font-medium", confidenceTone(section.confidence))}>
              {section.confidence}%
            </span>
          </span>
          <CopyButton text={section.rewritten} label="Copy section" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
            Original
          </p>
          <DiffColumn tokens={tokens} side="original" />
        </div>
        <div className="min-w-0 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] p-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400/70">
            Rewritten
          </p>
          <DiffColumn tokens={tokens} side="rewritten" />
        </div>
      </div>

      {section.reasoning && (
        <p className="mt-3 border-l-2 border-white/10 pl-2.5 text-xs leading-relaxed text-slate-500">
          {section.reasoning}
        </p>
      )}

      {section.changes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {section.changes.map((change, i) => (
            <li key={`${change}-${i}`} className="text-[11px] leading-relaxed text-slate-500">
              — {change}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Print-to-PDF.
 *
 * The browser's own print pipeline rather than a PDF library: it produces a real
 * PDF, respects the user's paper size, and costs zero bundle. A 200 KB renderer
 * to lay out text we already have as text is not a trade worth making.
 */
function printAsPdf(title: string, sections: SectionRewrite[]) {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  win.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>
    @page { margin: 18mm; }
    body { font: 11pt/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #111; }
    h1 { font-size: 18pt; margin: 0 0 16pt; }
    h2 { font-size: 12pt; margin: 16pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
    p { margin: 0 0 4pt; white-space: pre-wrap; }
  </style></head><body>
    <h1>${esc(title)}</h1>
    ${sections
      .map(
        (s) =>
          `<h2>${esc(s.heading)}</h2>` +
          s.rewritten
            .split("\n")
            .map((line) => `<p>${esc(line)}</p>`)
            .join(""),
      )
      .join("")}
  </body></html>`);
  win.document.close();
  win.focus();
  // Let layout settle before the dialog opens, or the first page can print blank.
  setTimeout(() => win.print(), 250);
}

export function ResumeRewrite({ enabled, pending, error, result, onGenerate }: ResumeRewriteProps) {
  const [intensity, setIntensity] = React.useState<RewriteIntensity>("balanced");
  const [target, setTarget] = React.useState<RewriteTarget>("ats");
  const [scope, setScope] = React.useState<RewriteScope>("summary");

  const fullText = React.useMemo(
    () =>
      result?.sections.map((s) => `${s.heading}\n${s.rewritten}`).join("\n\n") ?? "",
    [result],
  );

  if (!enabled) return null;

  return (
    <section
      aria-labelledby="resume-rewrite-heading"
      className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
    >
      <div>
        <h3
          id="resume-rewrite-heading"
          className="flex items-center gap-2 text-sm font-semibold text-white"
        >
          <Wand2 className="size-4 text-purple-300" aria-hidden />
          Resume rewrite
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Rewrites what you wrote for this posting. Facts are never added — only wording, order and
          emphasis change.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Segmented
          legend="Intensity"
          value={intensity}
          options={REWRITE_INTENSITIES}
          labels={INTENSITY_LABELS}
          hints={INTENSITY_HINTS}
          disabled={pending}
          onChange={setIntensity}
        />
        <Segmented
          legend="Optimise for"
          value={target}
          options={REWRITE_TARGETS}
          labels={TARGET_LABELS}
          hints={TARGET_HINTS}
          disabled={pending}
          onChange={setTarget}
        />
        <Segmented
          legend="Section"
          value={scope}
          options={REWRITE_SECTIONS}
          labels={SCOPE_LABELS}
          disabled={pending}
          onChange={setScope}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={pending}
          isLoading={pending}
          onClick={() => onGenerate({ intensity, target, scope })}
        >
          <Sparkles className="size-4" aria-hidden />
          {pending ? "Rewriting…" : result ? "Rewrite again" : "Generate rewrite"}
        </Button>
        {scope === "full" && (
          <p className="text-[11px] text-slate-600">
            Full resume issues one call per section — four times the cost of a single section.
          </p>
        )}
      </div>

      {pending && (
        <p
          className="flex items-center gap-2 text-sm text-slate-400"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Rewriting {SCOPE_LABELS[scope].toLowerCase()}…
        </p>
      )}

      {error && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400"
        >
          {error}
        </p>
      )}

      {result && result.sections.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
            <CopyButton text={fullText} label="Copy all sections" />
            <button
              type="button"
              onClick={() =>
                downloadDocx(
                  "resume-rewrite",
                  "Resume",
                  result.sections.map((s) => ({
                    heading: s.heading,
                    lines: s.rewritten.split("\n"),
                  })),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
            >
              <Download className="size-3" aria-hidden />
              Download DOCX
            </button>
            <button
              type="button"
              onClick={() => printAsPdf("Resume", result.sections)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
            >
              <FileText className="size-3" aria-hidden />
              Download PDF
            </button>
          </div>

          <div className="space-y-4">
            {result.sections.map((section) => (
              <SectionCard key={section.scope} section={section} />
            ))}
          </div>
        </>
      )}

      {result && result.skipped.length > 0 && (
        <ul className="space-y-1.5">
          {result.skipped.map((entry) => (
            <li
              key={entry.scope}
              className="flex flex-wrap items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-slate-500"
            >
              <Badge variant="neutral">{entry.scope}</Badge>
              {entry.reason}
            </li>
          ))}
        </ul>
      )}

      {result && (
        <p className="text-[11px] text-slate-600">
          {result.aiProvider}/{result.aiModel} · prompt v{result.aiPromptVersion} ·{" "}
          {INTENSITY_LABELS[result.options.intensity].toLowerCase()} ·{" "}
          {TARGET_LABELS[result.options.target].toLowerCase()}
        </p>
      )}
    </section>
  );
}
