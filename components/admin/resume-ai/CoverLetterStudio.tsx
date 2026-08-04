"use client";

import * as React from "react";
import { Check, Copy, Download, FileText, Loader2, Mail, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, TextInput } from "@/components/admin/ui";
import { downloadDocx } from "@/lib/resume/exportDocx";
import type { CoverLetterDraft } from "@/lib/ai-analysis/CoverLetterPrompt";
import {
  COVER_LETTER_LENGTHS,
  COVER_LETTER_TONES,
  LENGTH_HINTS,
  LENGTH_LABELS,
  MAX_COMPANY_CHARS,
  MAX_HIRING_MANAGER_CHARS,
  TONE_HINTS,
  TONE_LABELS,
  type CoverLetterLength,
  type CoverLetterOptions,
  type CoverLetterTone,
} from "@/lib/ai-analysis/CoverLetterTypes";

/**
 * Cover letter studio (Resume AI · Feature 3).
 *
 * Presentational plus local form state. The draft comes from the existing
 * gateway through `draftCoverLetterAction`; nothing here calls a model.
 *
 * The output is editable, and that is the point rather than a nicety. This is
 * the one artifact on the page the operator sends under their own signature, so
 * the last edit has to be theirs. Everything downstream — copy, DOCX, PDF —
 * reads the edited buffer, never the model's original, or the export would
 * quietly disagree with what they just corrected.
 */

export interface CoverLetterStudioProps {
  enabled: boolean;
  pending: boolean;
  error: string | null;
  draft: CoverLetterDraft | null;
  onGenerate: (options: CoverLetterOptions) => void;
}

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
  hints: Record<T, string>;
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
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{hints[value]}</p>
    </fieldset>
  );
}

function ActionButton({
  onClick,
  icon: Icon,
  children,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200"
    >
      <Icon className="size-3" aria-hidden />
      {children}
    </button>
  );
}

/** Browser print pipeline — a real PDF, zero bundle. Same approach as the rewrite export. */
function printAsPdf(title: string, body: string) {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  win.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>
    @page { margin: 22mm; }
    body { font: 11pt/1.6 -apple-system, Segoe UI, Roboto, sans-serif; color: #111; }
    p { margin: 0 0 10pt; white-space: pre-wrap; }
  </style></head><body>${body
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para)}</p>`)
    .join("")}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

export function CoverLetterStudio({
  enabled,
  pending,
  error,
  draft,
  onGenerate,
}: CoverLetterStudioProps) {
  const [tone, setTone] = React.useState<CoverLetterTone>("professional");
  const [length, setLength] = React.useState<CoverLetterLength>("standard");
  const [company, setCompany] = React.useState("");
  const [hiringManager, setHiringManager] = React.useState("");

  /** The editable buffer. Seeded from each new draft, then owned by the operator. */
  const [body, setBody] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Reseed only when a genuinely new draft arrives. Keying on `generatedAt`
  // rather than `draft` means a re-render cannot clobber an in-progress edit.
  const generatedAt = draft?.generatedAt ?? null;
  React.useEffect(() => {
    if (draft) {
      setBody(draft.body);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedAt]);

  if (!enabled) return null;

  const options: CoverLetterOptions = {
    tone,
    length,
    company: company.trim() || null,
    hiringManager: hiringManager.trim() || null,
  };

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied by permissions policy. The text is on screen
      // and selectable, so failing quietly beats an error banner.
    }
  }

  return (
    <section
      aria-labelledby="cover-letter-heading"
      className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
    >
      <div>
        <h3
          id="cover-letter-heading"
          className="flex items-center gap-2 text-sm font-semibold text-white"
        >
          <Mail className="size-4 text-purple-300" aria-hidden />
          Cover letter
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Drafted from your resume and this posting. Nothing is sent anywhere — the draft stays on
          this page for you to edit and copy.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 sm:grid-cols-2">
        <label className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Company
          </span>
          <TextInput
            value={company}
            maxLength={MAX_COMPANY_CHARS}
            disabled={pending}
            placeholder="Detected from the posting if left blank"
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>

        <label className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Hiring manager <span className="normal-case text-slate-600">(optional)</span>
          </span>
          <TextInput
            value={hiringManager}
            maxLength={MAX_HIRING_MANAGER_CHARS}
            disabled={pending}
            placeholder="Dear Hiring Manager"
            onChange={(event) => setHiringManager(event.target.value)}
          />
          <span className="mt-1 block text-[11px] text-slate-600">
            Left blank, the letter opens &ldquo;Dear Hiring Manager&rdquo;. A name is never guessed.
          </span>
        </label>

        <Segmented
          legend="Tone"
          value={tone}
          options={COVER_LETTER_TONES}
          labels={TONE_LABELS}
          hints={TONE_HINTS}
          disabled={pending}
          onChange={setTone}
        />
        <Segmented
          legend="Length"
          value={length}
          options={COVER_LETTER_LENGTHS}
          labels={LENGTH_LABELS}
          hints={LENGTH_HINTS}
          disabled={pending}
          onChange={setLength}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={pending}
          isLoading={pending}
          onClick={() => onGenerate(options)}
        >
          {draft ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {pending ? "Drafting…" : draft ? "Regenerate" : "Generate cover letter"}
        </Button>
        {draft && dirty && (
          <p className="text-[11px] text-amber-400/80">
            Regenerating replaces your edits.
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
          Drafting your cover letter…
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

      {draft && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/[0.07] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-300">
                <Sparkles className="size-2.5" aria-hidden />
                AI generated
              </span>
              <span className="text-[11px] text-slate-500">
                {wordCount} words
                {dirty && <span className="text-amber-400/80"> · edited</span>}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                    Copy
                  </>
                )}
              </button>
              <ActionButton
                icon={Download}
                onClick={() =>
                  downloadDocx("cover-letter", "Cover letter", [
                    { heading: options.company ?? "Cover letter", lines: body.split("\n") },
                  ])
                }
              >
                Download DOCX
              </ActionButton>
              <ActionButton icon={FileText} onClick={() => printAsPdf("Cover letter", body)}>
                Download PDF
              </ActionButton>
            </div>
          </div>

          <label>
            <span className="sr-only">Cover letter body — editable</span>
            <textarea
              value={body}
              rows={16}
              onChange={(event) => {
                setBody(event.target.value);
                setDirty(true);
              }}
              className="w-full resize-y rounded-lg border border-white/[0.06] bg-black/20 p-3 text-sm leading-relaxed text-slate-200 outline-none transition-colors focus:border-white/20 focus:ring-2 focus:ring-white/10"
            />
          </label>

          {draft.notes.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-400/80">
                Fill in before sending
              </p>
              <ul className="space-y-1">
                {draft.notes.map((note, i) => (
                  <li key={`${note}-${i}`} className="text-xs leading-relaxed text-slate-400">
                    — {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-slate-600">
            {draft.aiProvider}/{draft.aiModel} · prompt v{draft.aiPromptVersion} ·{" "}
            {TONE_LABELS[tone].toLowerCase()} · {LENGTH_LABELS[length].toLowerCase()}
          </p>
        </div>
      )}
    </section>
  );
}
