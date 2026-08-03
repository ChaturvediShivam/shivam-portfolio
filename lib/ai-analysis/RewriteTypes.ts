import type { ResumeSectionKind } from "@/types/resume";

/**
 * Resume rewrite contracts (Resume AI · Feature 2).
 *
 * A separate file from `AIAnalysisTypes` so the review pipeline's types are not
 * touched by a feature that only reads them.
 *
 * The invariant that survives every combination below: an intensity or a target
 * changes HOW something is said, never WHAT is claimed. No setting on this page
 * licenses inventing an employer, a technology, a metric or a year — that is the
 * one failure a candidate cannot recover from in an interview.
 */

export const REWRITE_INTENSITIES = ["conservative", "balanced", "aggressive"] as const;
export type RewriteIntensity = (typeof REWRITE_INTENSITIES)[number];

export const REWRITE_TARGETS = ["ats", "recruiter", "executive", "technical", "remote_us"] as const;
export type RewriteTarget = (typeof REWRITE_TARGETS)[number];

/** Sections a rewrite may be scoped to. `full` rewrites every one of the others present. */
export const REWRITE_SECTIONS = ["summary", "experience", "skills", "projects", "full"] as const;
export type RewriteScope = (typeof REWRITE_SECTIONS)[number];

export const INTENSITY_LABELS: Record<RewriteIntensity, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

export const INTENSITY_HINTS: Record<RewriteIntensity, string> = {
  conservative: "Tighten wording. Your voice, minimal edits.",
  balanced: "Rephrase freely. Same facts, sharper delivery.",
  aggressive: "Restructure hard. Strongest honest framing.",
};

export const TARGET_LABELS: Record<RewriteTarget, string> = {
  ats: "ATS",
  recruiter: "Recruiter readability",
  executive: "Executive",
  technical: "Technical",
  remote_us: "Remote US roles",
};

export const TARGET_HINTS: Record<RewriteTarget, string> = {
  ats: "Plain structure, the posting's exact terms.",
  recruiter: "Scannable in six seconds, impact first.",
  executive: "Scope, outcomes and business language.",
  technical: "Stack depth and engineering specifics.",
  remote_us: "Async collaboration and autonomy signals.",
};

export const SCOPE_LABELS: Record<RewriteScope, string> = {
  summary: "Professional summary",
  experience: "Experience",
  skills: "Skills",
  projects: "Projects",
  full: "Full resume",
};

/** Which parsed section each scope reads. `full` fans out across all four. */
export const SCOPE_TO_SECTION: Record<Exclude<RewriteScope, "full">, ResumeSectionKind> = {
  summary: "summary",
  experience: "experience",
  skills: "skills",
  projects: "projects",
};

/**
 * One rewritten section.
 *
 * `original` is carried through so the UI can show both sides. A rewrite shown
 * without the text it replaced is one the operator has to accept on faith.
 */
export interface SectionRewrite {
  scope: Exclude<RewriteScope, "full">;
  heading: string;
  original: string;
  rewritten: string;
  /** What changed and why, one line each. */
  changes: string[];
  /** 0–100, the model's own confidence in this rewrite. */
  confidence: number;
  /** One paragraph on the approach taken. */
  reasoning: string;
}

export interface RewriteOptions {
  intensity: RewriteIntensity;
  target: RewriteTarget;
  scope: RewriteScope;
}

export interface RewriteResult {
  sections: SectionRewrite[];
  options: RewriteOptions;
  /** Sections asked for that the resume does not contain. */
  skipped: { scope: string; reason: string }[];
  aiProvider: string;
  aiModel: string;
  aiPromptVersion: string;
  generatedAt: string;
}
