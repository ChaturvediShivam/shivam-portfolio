import "server-only";
import { AiUnknownTemplateError } from "@/lib/ai/errors";
import type { PromptTemplate } from "@/lib/ai/prompts/template";
import { assistantTemplate } from "./templates/assistant";
import { emailReplyTemplate } from "./templates/email-reply";
import { inboxTriageTemplate } from "./templates/inbox-triage";
import { messageSummaryTemplate } from "./templates/message-summary";
import { opportunitySummaryTemplate } from "./templates/opportunity-summary";
import { selfTestTemplate } from "./templates/self-test";
// Resume AI · Phase 3 · Step 2. Registered here rather than in a second
// registry so there is exactly one place that resolves a template id.
import { coverLetterTemplate } from "@/lib/ai-analysis/prompts/cover-letter";
import { interviewQuestionsTemplate } from "@/lib/ai-analysis/prompts/interview";
import { linkedinTemplate } from "@/lib/ai-analysis/prompts/linkedin";
import { resumeReviewTemplate } from "@/lib/ai-analysis/prompts/resume-review";
import { summaryRewriteTemplate } from "@/lib/ai-analysis/prompts/rewrite";

/**
 * Prompt template registry (Phase 3 · M6).
 *
 * Resolves `(id, version)` to a template. An unknown id or version is a hard
 * error raised before any provider call, so a bad reference costs nothing.
 * Omitting the version resolves to the highest registered version — convenient
 * for callers that always want current, while a pinned version keeps historical
 * rows reproducible.
 *
 * `prompt_templates` exists in the schema as the future runtime-override /
 * A-B surface; M6 resolves from the repo only, which keeps templates
 * reviewable and diffable.
 */

const templates = new Map<string, Map<string, PromptTemplate>>();

function register(template: PromptTemplate): void {
  const byVersion = templates.get(template.id) ?? new Map<string, PromptTemplate>();
  byVersion.set(template.version, template);
  templates.set(template.id, byVersion);
}

register(selfTestTemplate);
register(messageSummaryTemplate);
register(opportunitySummaryTemplate);
register(assistantTemplate);
register(emailReplyTemplate);
register(inboxTriageTemplate);
register(resumeReviewTemplate);
register(interviewQuestionsTemplate);
register(linkedinTemplate);
register(summaryRewriteTemplate);
register(coverLetterTemplate);

/** Numeric semver comparison; non-numeric segments sort as 0. */
function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Resolve a template. Throws `AiUnknownTemplateError` when absent. */
export function getPromptTemplate(id: string, version?: string): PromptTemplate {
  const byVersion = templates.get(id);
  if (!byVersion || byVersion.size === 0) throw new AiUnknownTemplateError(id, version);

  if (version) {
    const exact = byVersion.get(version);
    if (!exact) throw new AiUnknownTemplateError(id, version);
    return exact;
  }

  const latest = [...byVersion.keys()].sort(compareVersions).pop();
  if (!latest) throw new AiUnknownTemplateError(id);
  return byVersion.get(latest) as PromptTemplate;
}

/** Every registered template, for diagnostics. */
export function listPromptTemplates(): PromptTemplate[] {
  return [...templates.values()].flatMap((byVersion) => [...byVersion.values()]);
}
