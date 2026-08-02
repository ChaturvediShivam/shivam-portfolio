import "server-only";
import type {
  AiRecommendation,
  BulletImprovement,
  RecommendationPriority,
} from "@/lib/ai-analysis/AIAnalysisTypes";
import {
  findResumeLine,
  items,
  knownSkill,
  oneOf,
  sectionKind,
  text,
  normalize,
  type GroundingContext,
} from "@/lib/ai-analysis/grounding";

/**
 * Recommendations, bullet rewrites and keyword advice (Resume AI · Phase 3 · Step 2).
 *
 * `why` is mandatory. A recommendation without one is dropped rather than
 * shown, because the difference between the two examples in the spec —
 * "Power BI appears in the job description but was not detected in your resume"
 * and "You should learn Power BI" — is entirely the presence of the reason. The
 * first is a finding the operator can check; the second is an instruction they
 * can only obey or ignore.
 *
 * Bullet rewrites are anchored to a real resume line. The model returns the
 * original it means to improve, and that string must locate an actual line — a
 * rewrite of a bullet the resume does not contain is advice about someone
 * else's resume.
 *
 * `missingKeywords` is intersected with what the deterministic engine already
 * found absent. The model narrows and orders that list; it cannot extend it.
 */

const MAX_RECOMMENDATIONS = 10;
const MAX_BULLETS = 6;
const MAX_KEYWORDS = 15;

const PRIORITIES: readonly RecommendationPriority[] = ["high", "medium", "low"];

const PRIORITY_RANK: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

export interface GroundedRecommendations {
  recommendations: AiRecommendation[];
  dropped: string[];
}

export function generateRecommendations(
  raw: unknown,
  ctx: GroundingContext,
): GroundedRecommendations {
  const recommendations: AiRecommendation[] = [];
  const dropped: string[] = [];

  for (const entry of items(raw, MAX_RECOMMENDATIONS)) {
    const row = entry as Record<string, unknown>;
    const action = text(row.action);
    const why = text(row.why);

    if (!action) continue;

    if (!why) {
      dropped.push(`Recommendation "${action}" omitted: it gave no reason.`);
      continue;
    }

    recommendations.push({
      // An unrecognised priority is treated as medium: the model failing to
      // label urgency is not evidence that the advice is urgent.
      priority: oneOf(row.priority, PRIORITIES) ?? "medium",
      action,
      why,
      section: sectionKind(row.section),
      relatedSkill: knownSkill(row.relatedSkill, ctx),
    });
  }

  // Stable sort by priority so the operator reads the important ones first
  // regardless of the order the model happened to emit.
  recommendations.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return { recommendations, dropped };
}

export interface GroundedBullets {
  bulletImprovements: BulletImprovement[];
  dropped: string[];
}

export function generateBulletImprovements(
  raw: unknown,
  ctx: GroundingContext,
): GroundedBullets {
  const bulletImprovements: BulletImprovement[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const entry of items(raw, MAX_BULLETS)) {
    const row = entry as Record<string, unknown>;
    const claimed = text(row.original);
    const improved = text(row.improved);
    const why = text(row.why);

    if (!claimed || !improved || !why) continue;

    // The line as the resume actually has it, not as the model retyped it.
    const original = findResumeLine(claimed, ctx);
    if (!original) {
      dropped.push(`Bullet rewrite omitted: "${claimed}" is not a line in your resume.`);
      continue;
    }

    if (seen.has(original) || normalize(original) === normalize(improved)) continue;
    seen.add(original);

    bulletImprovements.push({ original, improved, why });
  }

  return { bulletImprovements, dropped };
}

export interface GroundedKeywords {
  missingKeywords: string[];
  dropped: string[];
}

export function selectMissingKeywords(raw: unknown, ctx: GroundingContext): GroundedKeywords {
  const missingKeywords: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const entry of items(raw, MAX_KEYWORDS)) {
    if (typeof entry !== "string") continue;
    const key = normalize(entry);

    // The canonical spelling is the engine's, not the model's — the operator is
    // going to paste this term into their resume.
    const term = ctx.missingKeywords.get(key);
    if (!term) {
      dropped.push(`Keyword "${entry}" omitted: the job description did not ask for it.`);
      continue;
    }

    if (seen.has(term)) continue;
    seen.add(term);
    missingKeywords.push(term);
  }

  return { missingKeywords, dropped };
}
