import "server-only";
import type { CriticalGap, InsightSeverity, Weakness } from "@/lib/ai-analysis/AIAnalysisTypes";
import {
  isQuoted,
  items,
  knownSkill,
  missingSkill,
  oneOf,
  text,
  type GroundingContext,
} from "@/lib/ai-analysis/grounding";

/**
 * Weaknesses and critical gaps (Resume AI · Phase 3 · Step 2).
 *
 * A gap is the one finding the operator will act on immediately — by adding a
 * skill to the resume, or by not applying. Both are expensive to get wrong, so
 * `criticalGaps` is restricted to skills the deterministic engine already
 * reported missing. The model chooses which of those matter and says why; it
 * cannot introduce a gap the parser never found, and cannot describe a skill
 * the resume does evidence as absent.
 *
 * `displayName` and `requestedIn` are taken from the deterministic record
 * rather than from the model's reply. The posting line that asked for the skill
 * is already known exactly; letting the model restate it would only create an
 * opportunity for it to be restated wrong.
 */

const MAX_WEAKNESSES = 8;
const MAX_GAPS = 6;

const SEVERITIES: readonly InsightSeverity[] = ["critical", "important", "minor"];

export interface GroundedWeaknesses {
  weaknesses: Weakness[];
  dropped: string[];
}

export function analyzeWeaknesses(raw: unknown, ctx: GroundingContext): GroundedWeaknesses {
  const weaknesses: Weakness[] = [];
  const dropped: string[] = [];

  for (const entry of items(raw, MAX_WEAKNESSES)) {
    const row = entry as Record<string, unknown>;
    const headline = text(row.headline);
    const detail = text(row.detail);
    const evidence = text(row.evidence);

    if (!headline || !detail || !evidence) {
      dropped.push(`Weakness omitted: incomplete (${headline ?? "no headline"}).`);
      continue;
    }

    if (!isQuoted(evidence, ctx)) {
      dropped.push(
        `Weakness "${headline}" omitted: its evidence is not in your resume or the job description.`,
      );
      continue;
    }

    weaknesses.push({
      headline,
      detail,
      evidence,
      // An unrecognised severity defaults to the middle rather than to
      // "critical": a mislabelled finding should not shout.
      severity: oneOf(row.severity, SEVERITIES) ?? "important",
      relatedSkill: knownSkill(row.relatedSkill, ctx),
    });
  }

  return { weaknesses, dropped };
}

export interface GroundedGaps {
  criticalGaps: CriticalGap[];
  dropped: string[];
}

export function analyzeCriticalGaps(raw: unknown, ctx: GroundingContext): GroundedGaps {
  const criticalGaps: CriticalGap[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const entry of items(raw, MAX_GAPS)) {
    const row = entry as Record<string, unknown>;
    const missing = missingSkill(row.skill, ctx);
    const impact = text(row.impact);

    if (!missing) {
      const named = typeof row.skill === "string" ? row.skill : "unnamed skill";
      dropped.push(`Gap "${named}" omitted: the analysis did not report it as missing.`);
      continue;
    }

    if (!impact || seen.has(missing.skill)) continue;
    seen.add(missing.skill);

    criticalGaps.push({
      skill: missing.skill,
      displayName: missing.displayName,
      requestedIn: missing.requestedIn,
      impact,
    });
  }

  return { criticalGaps, dropped };
}
