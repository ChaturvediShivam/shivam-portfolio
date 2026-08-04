"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileText,
  Info,
  Linkedin,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/admin/ui";
import { downloadDocx } from "@/lib/resume/exportDocx";
import type { GroundedLinkedIn } from "@/lib/ai-analysis/LinkedInOptimizer";
import type { KeywordMatch } from "@/types/resume-analysis";

/**
 * LinkedIn optimizer (Resume AI · Feature 5).
 *
 * Presentational. Copy comes from the existing `resume_linkedin` template
 * through the gateway; nothing here calls a model or reshapes what it returned.
 *
 * Two panels are deliberately not AI output. Keywords come from the
 * deterministic engine, and the confidence figure is measured from the
 * grounding result rather than asked of the model — see `groundingConfidence`.
 * Both are labelled COMPUTED so the reader can tell which numbers are
 * reproducible.
 */

export interface LinkedInOptimizerProps {
  enabled: boolean;
  pending: boolean;
  error: string | null;
  result: GroundedLinkedIn | null;
  /** Deterministic keyword coverage — the source of the Keywords panel. */
  keywords: KeywordMatch | null;
  onRegenerate: () => void;
}

/**
 * Confidence, measured rather than asked for.
 *
 * `resume_linkedin` returns no confidence field, and inventing one — or asking
 * the model to rate itself — would be a number with nothing behind it. What
 * this reports instead is the grounding retention rate: of the skills the model
 * proposed featuring, the share the parser could actually evidence.
 *
 * That is a real signal about this specific output. A model proposing eight
 * skills of which two were never in the resume is telling you something, and it
 * is the same thing a low confidence score would be trying to say.
 */
function groundingConfidence(result: GroundedLinkedIn): {
  value: number;
  kept: number;
  proposed: number;
} | null {
  const kept = result.suggestions?.skillsToFeature.length ?? 0;
  const dropped = result.dropped.length;
  const proposed = kept + dropped;
  if (proposed === 0) return null;
  return { value: Math.round((kept / proposed) * 100), kept, proposed };
}

function toneFor(value: number): string {
  if (value >= 90) return "text-emerald-400";
  if (value >= 70) return "text-amber-300";
  return "text-red-400";
}

function SourceTag({ source }: { source: "computed" | "ai" }) {
  return source === "computed" ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
      <Check className="size-2.5" aria-hidden />
      Computed
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/[0.07] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-300">
      <Sparkles className="size-2.5" aria-hidden />
      AI generated
    </span>
  );
}

function CopyButton({ text, label = "Copy section" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied by permissions policy. The text is on screen
      // and selectable, so failing quietly beats an error banner.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
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

function Panel({
  title,
  description,
  source,
  copyText,
  children,
}: {
  title: string;
  description?: string;
  source: "computed" | "ai";
  copyText?: string;
  children: React.ReactNode;
}) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h4 id={headingId} className="text-sm font-semibold text-white">
            {title}
          </h4>
          {description && <p className="mt-0.5 text-[11px] text-slate-600">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourceTag source={source} />
          {copyText && <CopyButton text={copyText} />}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Browser print pipeline — a real PDF, zero bundle. Same approach as the other exports. */
function printAsPdf(result: GroundedLinkedIn, missingKeywords: string[]) {
  const s = result.suggestions;
  if (!s) return;
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  win.document.write(`<!doctype html><html><head><title>LinkedIn profile copy</title><style>
    @page { margin: 20mm; }
    body { font: 11pt/1.6 -apple-system, Segoe UI, Roboto, sans-serif; color: #111; }
    h1 { font-size: 17pt; margin: 0 0 14pt; }
    h2 { font-size: 12pt; margin: 16pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
    p { margin: 0 0 8pt; white-space: pre-wrap; }
    li { margin-bottom: 3pt; }
  </style></head><body>
    <h1>LinkedIn profile copy</h1>
    <h2>Headline</h2><p>${esc(s.headline)}</p>
    <h2>About</h2>${s.about
      .split(/\n{2,}/)
      .map((para) => `<p>${esc(para)}</p>`)
      .join("")}
    <h2>Skills to feature</h2><p>${esc(s.skillsToFeature.join(" · "))}</p>
    ${missingKeywords.length ? `<h2>Keywords to work in</h2><p>${esc(missingKeywords.join(" · "))}</p>` : ""}
    ${s.notes.length ? `<h2>Recruiter notes</h2><ul>${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

export function LinkedInOptimizer({
  enabled,
  pending,
  error,
  result,
  keywords,
  onRegenerate,
}: LinkedInOptimizerProps) {
  if (!enabled) return null;

  const suggestions = result?.suggestions ?? null;
  const confidence = result ? groundingConfidence(result) : null;
  const missingKeywords = keywords?.missing ?? [];

  const fullText = suggestions
    ? [
        `HEADLINE\n${suggestions.headline}`,
        `\nABOUT\n${suggestions.about}`,
        `\nSKILLS TO FEATURE\n${suggestions.skillsToFeature.join(", ")}`,
        missingKeywords.length ? `\nKEYWORDS TO WORK IN\n${missingKeywords.join(", ")}` : "",
        suggestions.notes.length ? `\nRECRUITER NOTES\n${suggestions.notes.map((n) => `- ${n}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <section
      aria-labelledby="linkedin-heading"
      className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3
            id="linkedin-heading"
            className="flex items-center gap-2 text-sm font-semibold text-white"
          >
            <Linkedin className="size-4 text-purple-300" aria-hidden />
            LinkedIn optimizer
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Profile copy in your voice. A profile is public and permanent, so only skills your
            resume evidences are suggested.
          </p>
        </div>
        {confidence && (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Grounding confidence
            </p>
            <p className={cn("text-lg font-semibold leading-tight", toneFor(confidence.value))}>
              {confidence.value}%
            </p>
            <p className="text-[11px] text-slate-600">
              {confidence.kept} of {confidence.proposed} skills evidenced
            </p>
          </div>
        )}
      </div>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={suggestions ? "secondary" : "primary"}
          disabled={pending}
          isLoading={pending}
          onClick={onRegenerate}
        >
          {suggestions ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {pending ? "Optimizing…" : suggestions ? "Regenerate" : "Generate LinkedIn copy"}
        </Button>

        {suggestions && (
          <>
            <CopyButton text={fullText} label="Copy all" />
            <button
              type="button"
              onClick={() =>
                downloadDocx("linkedin-profile", "LinkedIn profile copy", [
                  { heading: "Headline", lines: [suggestions.headline] },
                  { heading: "About", lines: suggestions.about.split("\n") },
                  { heading: "Skills to feature", lines: [suggestions.skillsToFeature.join(" · ")] },
                  ...(missingKeywords.length
                    ? [{ heading: "Keywords to work in", lines: [missingKeywords.join(" · ")] }]
                    : []),
                  ...(suggestions.notes.length
                    ? [{ heading: "Recruiter notes", lines: suggestions.notes }]
                    : []),
                ])
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
            >
              <Download className="size-3" aria-hidden />
              Download DOCX
            </button>
            <button
              type="button"
              onClick={() => result && printAsPdf(result, missingKeywords)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
            >
              <FileText className="size-3" aria-hidden />
              Download PDF
            </button>
          </>
        )}
      </div>

      {/* ── States ───────────────────────────────────────────────────── */}
      {pending && (
        <p
          className="flex items-center gap-2 text-sm text-slate-400"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Rewriting your profile for this posting…
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

      {result && !suggestions && !pending && !error && (
        <p className="text-sm text-slate-500">
          The AI returned nothing usable for this profile. Nothing else on the page is affected.
        </p>
      )}

      {!result && !pending && !error && (
        <p className="text-sm text-slate-500">
          No profile copy yet. Run the analysis above, or generate it on its own.
        </p>
      )}

      {/* ── Output ───────────────────────────────────────────────────── */}
      {suggestions && (
        <div className="space-y-3">
          <Panel
            title="Optimized headline"
            description="220 characters max on LinkedIn."
            source="ai"
            copyText={suggestions.headline}
          >
            <p className="text-sm leading-relaxed text-slate-100">{suggestions.headline}</p>
            <p className="mt-1.5 text-[11px] text-slate-600">
              {suggestions.headline.length} characters
            </p>
          </Panel>

          <Panel
            title="About"
            description="The summary at the top of your profile."
            source="ai"
            copyText={suggestions.about}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
              {suggestions.about}
            </p>
            <p className="mt-1.5 text-[11px] text-slate-600">
              {suggestions.about.trim().split(/\s+/).length} words
            </p>
          </Panel>

          <Panel
            title={`Skills to feature (${suggestions.skillsToFeature.length})`}
            description="Every one is evidenced in your resume."
            source="ai"
            copyText={suggestions.skillsToFeature.join(", ")}
          >
            <div className="flex flex-wrap gap-1.5">
              {suggestions.skillsToFeature.map((skill) => (
                <span
                  key={skill}
                  className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-1 text-xs text-emerald-200"
                >
                  {skill}
                </span>
              ))}
            </div>
          </Panel>

          {missingKeywords.length > 0 && (
            <Panel
              title={`Keywords to work in (${missingKeywords.length})`}
              description="Terms this posting uses that your resume does not. From the match engine, not the AI."
              source="computed"
              copyText={missingKeywords.join(", ")}
            >
              <div className="flex flex-wrap gap-1.5">
                {missingKeywords.map((term) => (
                  <span
                    key={term}
                    className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-xs text-slate-300"
                  >
                    {term}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                Only add a keyword your experience actually supports. A profile is read by people
                who can ask about it.
              </p>
            </Panel>
          )}

          {suggestions.notes.length > 0 && (
            <Panel
              title="Recruiter notes"
              description="What to check or fill in yourself."
              source="ai"
              copyText={suggestions.notes.map((n) => `- ${n}`).join("\n")}
            >
              <ul className="space-y-1.5">
                {suggestions.notes.map((note, i) => (
                  <li
                    key={`${note}-${i}`}
                    className="flex items-start gap-2 text-xs leading-relaxed text-slate-400"
                  >
                    <Info className="mt-0.5 size-3 shrink-0 text-slate-500" aria-hidden />
                    {note}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {result && result.dropped.length > 0 && (
            <details className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-slate-400 transition-colors hover:text-slate-200">
                <Info className="size-3.5 shrink-0" aria-hidden />
                {result.dropped.length} suggested skill
                {result.dropped.length === 1 ? "" : "s"} discarded as unevidenced
              </summary>
              <ul className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
                {result.dropped.map((reason, i) => (
                  <li key={`${reason}-${i}`} className="text-[11px] leading-relaxed text-slate-500">
                    {reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
