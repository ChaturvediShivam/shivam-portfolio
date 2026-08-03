import "server-only";
import type { AiGateway } from "@/lib/ai/gateway";
import { AiTransientError } from "@/lib/ai/errors";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import { items, percent, prose, text } from "@/lib/ai-analysis/grounding";
import { detectSkills, skillLabel } from "@/lib/resume-analysis/SkillMatcher";
import { sectionOfKind, type ParsedResume } from "@/types/resume";
import type { JobDescriptionAnalysis, ResumeAnalysis } from "@/types/resume-analysis";
import {
  INTENSITY_RULES,
  TARGET_RULES,
} from "@/lib/ai-analysis/prompts/section-rewrite";
import {
  SCOPE_LABELS,
  SCOPE_TO_SECTION,
  type RewriteOptions,
  type RewriteResult,
  type RewriteScope,
  type SectionRewrite,
} from "@/lib/ai-analysis/RewriteTypes";

/**
 * Section rewrite orchestrator (Resume AI · Feature 2).
 *
 * Owns sequencing and nothing else. Every policy it depends on — the feature
 * gate, redaction, the token budget, output validation and the audit row —
 * already lives in `AiGateway`, and this file adds none of its own. That is why
 * it can exist without touching the review pipeline: both are just callers.
 *
 * `full` fans out across the sections the resume actually has, settled
 * independently. One section failing costs that section, not the request — the
 * same trade `ResumeInsightsService` makes for its enrichment calls.
 */

const TEMPLATE_ID = "resume_section_rewrite";

/** Ceilings on what one call may carry. Generous for a section, tight for a bill. */
const MAX_SECTION_CHARS = 6000;
const MAX_RESUME_CHARS = 12000;
const MAX_CHANGES = 10;
const MAX_LISTED_SKILLS = 40;
const MAX_KEYWORDS = 25;

/** Order matters — it is the order a resume reads in, and the order results render. */
const FULL_SCOPES: Exclude<RewriteScope, "full">[] = ["summary", "experience", "skills", "projects"];

interface RewriteOutput {
  rewritten: unknown;
  changes: unknown;
  confidence: unknown;
  reasoning: unknown;
}

export interface SectionRewriteInput {
  resume: ParsedResume;
  jobDescription: JobDescriptionAnalysis;
  analysis: ResumeAnalysis;
  ownerId: string;
  options: RewriteOptions;
}

function clip(value: string, limit: number): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

/**
 * Retry once, transient only.
 *
 * Identical reasoning to the review call: a refusal, a budget stop or a schema
 * violation fails the same way twice, and paying for it twice buys nothing.
 */
async function completeWithRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof AiTransientError)) throw error;
    return await call();
  }
}

/** A rewrite plus the provenance of the call that produced it. */
interface RewriteOnce {
  section: SectionRewrite;
  provider: string;
  model: string;
}

/** Rewrite one section, or null when the model returned nothing usable. */
async function rewriteOne(
  gateway: AiGateway,
  input: SectionRewriteInput,
  scope: Exclude<RewriteScope, "full">,
): Promise<RewriteOnce | null> {
  const section = sectionOfKind(input.resume, SCOPE_TO_SECTION[scope]);
  if (!section || section.lines.length === 0) return null;

  const original = section.lines.join("\n").trim();
  if (!original) return null;

  const { options, analysis, jobDescription: jd } = input;

  const completion = await completeWithRetry(() =>
    gateway.complete<RewriteOutput>({
      templateId: TEMPLATE_ID,
      ownerId: input.ownerId,
      actor: "user",
      // Audited per section, so the ledger shows exactly what was rewritten.
      action: `resume_rewrite_${scope}`,
      entityType: "resume",
      variables: {
        intensity: options.intensity,
        intensityRule: INTENSITY_RULES[options.intensity] ?? INTENSITY_RULES.balanced,
        target: options.target,
        targetRule: TARGET_RULES[options.target] ?? TARGET_RULES.ats,
        sectionLabel: SCOPE_LABELS[scope],
        sectionText: clip(original, MAX_SECTION_CHARS),
        resume: clip(input.resume.text, MAX_RESUME_CHARS),
        jobTitle: jd.title ?? "the advertised role",
        jobKeywords: jd.keywords.slice(0, MAX_KEYWORDS).join(", ") || "none extracted",
        detectedSkills:
          detectSkills(input.resume.text).slice(0, MAX_LISTED_SKILLS).map(skillLabel).join(", ") ||
          "none detected",
        missingSkills:
          analysis.missingSkills
            .slice(0, MAX_LISTED_SKILLS)
            .map((s) => s.displayName)
            .join(", ") || "none",
      },
    }),
  );

  if (completion.stopReason !== "completed" || !completion.parsed) return null;

  // Grounding: the same bounded coercions the review pipeline uses. `prose`
  // keeps line breaks, which is what preserves bullet structure through the
  // round trip — `text` would collapse the section into one paragraph.
  const rewritten = prose(completion.parsed.rewritten);
  if (!rewritten) return null;

  const changes = items(completion.parsed.changes, MAX_CHANGES)
    .map((change) => text(change))
    .filter((change): change is string => change !== null);

  return {
    section: {
      scope,
      heading: section.heading || SCOPE_LABELS[scope],
      original,
      rewritten,
      changes,
      confidence: percent(completion.parsed.confidence) ?? 0,
      reasoning: text(completion.parsed.reasoning) ?? "",
    },
    provider: completion.provider,
    model: completion.model,
  };
}

/**
 * Rewrite the requested scope.
 *
 * Returns the sections that produced something usable plus a `skipped` list, so
 * the UI can say "your resume has no projects section" rather than silently
 * showing three results when four were asked for.
 */
export async function rewriteSections(
  gateway: AiGateway,
  input: SectionRewriteInput,
): Promise<RewriteResult> {
  const scopes = input.options.scope === "full" ? FULL_SCOPES : [input.options.scope];
  const skipped: { scope: string; reason: string }[] = [];

  const present = scopes.filter((scope) => {
    const section = sectionOfKind(input.resume, SCOPE_TO_SECTION[scope]);
    if (section && section.lines.length > 0) return true;
    skipped.push({
      scope: SCOPE_LABELS[scope],
      reason: "Your resume has no section the parser recognised as this.",
    });
    return false;
  });

  const settled = await Promise.allSettled(
    present.map((scope) => rewriteOne(gateway, input, scope)),
  );

  const sections: SectionRewrite[] = [];
  let provider = "";
  let model = "";

  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`[resume rewrite] ${present[index]} failed:`, result.reason);
      skipped.push({
        scope: SCOPE_LABELS[present[index]],
        reason: "The rewrite failed for this section. The others are unaffected.",
      });
      return;
    }
    if (result.value === null) {
      skipped.push({
        scope: SCOPE_LABELS[present[index]],
        reason: "The AI returned nothing usable for this section.",
      });
      return;
    }
    sections.push(result.value.section);
    // Every section resolves the same task class, so these agree; taking the
    // first is enough and avoids reporting a provider for a call that failed.
    provider ||= result.value.provider;
    model ||= result.value.model;
  });

  return {
    sections,
    options: input.options,
    skipped,
    aiProvider: provider,
    aiModel: model,
    aiPromptVersion: getPromptTemplate(TEMPLATE_ID).version,
    generatedAt: new Date().toISOString(),
  };
}
