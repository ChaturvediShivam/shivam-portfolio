"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Button } from "@/components/admin/ui";
import { stripBullet } from "@/lib/resume/normalize";
import type { ParsedResume, ResumeSection } from "@/types/resume";

/**
 * Developer preview of the parse result (Resume AI · Phase 2).
 *
 * Explicitly a debugging surface, not a product one. Phase 2 has no analysis to
 * show, and the only useful question right now is "did the parser read this
 * resume correctly?" — which needs the extracted text visible, section
 * boundaries visible, and the raw JSON reachable.
 *
 * Sections are collapsed by default with the count on the summary, so the shape
 * of the parse is legible at a glance and the content is one click away. A
 * `<details>` element rather than custom state: it is keyboard accessible and
 * screen-reader friendly for free, and no open/closed state has to be managed.
 */

export interface ParsedPreviewProps {
  parsed: ParsedResume;
}

const KIND_LABELS: Record<string, string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  certifications: "Certifications",
  other: "Other",
};

export function ParsedPreview({ parsed }: ParsedPreviewProps) {
  const [copied, setCopied] = React.useState(false);

  const recognised = parsed.sections.filter((section) => section.kind !== "other");

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(toJson(parsed), null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[resume-ai] clipboard write failed:", error);
    }
  }

  return (
    <section
      aria-labelledby="parsed-preview-heading"
      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="parsed-preview-heading" className="text-sm font-semibold text-white">
            Parsed output
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Developer preview — what the parser extracted, before any analysis.
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={copyJson}>
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Parser" value={parsed.parser} />
        <Stat label="Pages" value={parsed.pageCount === null ? "n/a" : String(parsed.pageCount)} />
        <Stat label="Lines" value={parsed.lines.length.toLocaleString()} />
        <Stat label="Characters" value={parsed.text.length.toLocaleString()} />
      </dl>

      {parsed.warnings.length > 0 && (
        <ul className="mb-4 space-y-1.5" aria-label="Parser warnings">
          {parsed.warnings.map((warning) => (
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Detected sections:</span>
        {recognised.length === 0 ? (
          <Badge variant="neutral">none</Badge>
        ) : (
          recognised.map((section) => (
            <Badge key={`${section.kind}-${section.startLine}`} variant="info">
              {KIND_LABELS[section.kind] ?? section.kind}
            </Badge>
          ))
        )}
      </div>

      <div className="space-y-2">
        {parsed.sections.map((section) => (
          <SectionBlock key={`${section.kind}-${section.startLine}`} section={section} />
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function SectionBlock({ section }: { section: ResumeSection }) {
  const label = section.heading || KIND_LABELS[section.kind] || section.kind;

  return (
    <details className="group rounded-md border border-white/[0.06] bg-white/[0.02]">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-slate-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
          "hover:bg-white/[0.03]",
        )}
      >
        <ChevronRight
          className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">
          {section.heading ? label : <span className="text-slate-500">{label} (no heading)</span>}
        </span>
        <Badge variant={section.kind === "other" ? "neutral" : "info"}>{section.kind}</Badge>
        <span className="shrink-0 text-xs text-slate-600">
          {section.lines.length} line{section.lines.length === 1 ? "" : "s"}
        </span>
      </summary>

      <div className="border-t border-white/[0.06] px-3 py-2">
        {section.lines.length === 0 ? (
          <p className="text-xs text-slate-600">Empty.</p>
        ) : (
          <ul className="space-y-1">
            {section.lines.map((line, index) => {
              const { text, bulleted } = stripBullet(line);
              return (
                <li
                  key={`${section.startLine}-${index}`}
                  className={cn(
                    "whitespace-pre-wrap break-words font-mono text-xs text-slate-400",
                    bulleted && "pl-3 before:mr-1 before:text-slate-600 before:content-['•']",
                  )}
                >
                  {text}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

/** The strongly typed JSON structure, minus the line array's bulk. */
function toJson(parsed: ParsedResume) {
  return {
    parser: parsed.parser,
    pageCount: parsed.pageCount,
    truncated: parsed.truncated,
    warnings: parsed.warnings,
    lineCount: parsed.lines.length,
    characterCount: parsed.text.length,
    sections: parsed.sections.map((section) => ({
      kind: section.kind,
      heading: section.heading,
      startLine: section.startLine,
      endLine: section.endLine,
      lines: section.lines,
    })),
  };
}
