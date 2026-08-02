import "server-only";
import type { Strength, TransferableSkill } from "@/lib/ai-analysis/AIAnalysisTypes";
import {
  detectedSkill,
  isQuoted,
  items,
  knownSkill,
  text,
  type GroundingContext,
} from "@/lib/ai-analysis/grounding";

/**
 * Strengths and transferable skills (Resume AI · Phase 3 · Step 2).
 *
 * Both are claims that the resume is better than the score suggests, which is
 * exactly the direction a model drifts in unprompted — flattery reads as
 * analysis and nobody argues with it. So both are checked harder than the
 * negative findings are.
 *
 * A strength survives only if its evidence is a line that genuinely appears in
 * the resume or the posting. A transferable skill survives only if it starts
 * from a skill the parser actually detected: claiming "your Kubernetes work
 * transfers to Terraform" when the resume never mentions Kubernetes invents the
 * premise and the conclusion at once.
 */

const MAX_STRENGTHS = 8;
const MAX_TRANSFERABLE = 6;

export interface GroundedStrengths {
  strengths: Strength[];
  dropped: string[];
}

export function analyzeStrengths(raw: unknown, ctx: GroundingContext): GroundedStrengths {
  const strengths: Strength[] = [];
  const dropped: string[] = [];

  for (const entry of items(raw, MAX_STRENGTHS)) {
    const row = entry as Record<string, unknown>;
    const headline = text(row.headline);
    const detail = text(row.detail);
    const evidence = text(row.evidence);

    if (!headline || !detail || !evidence) {
      dropped.push(`Strength omitted: incomplete (${headline ?? "no headline"}).`);
      continue;
    }

    if (!isQuoted(evidence, ctx)) {
      dropped.push(`Strength "${headline}" omitted: its evidence is not in your resume.`);
      continue;
    }

    strengths.push({
      headline,
      detail,
      evidence,
      relatedSkill: knownSkill(row.relatedSkill, ctx),
    });
  }

  return { strengths, dropped };
}

export interface GroundedTransferable {
  transferableSkills: TransferableSkill[];
  dropped: string[];
}

export function analyzeTransferableSkills(
  raw: unknown,
  ctx: GroundingContext,
): GroundedTransferable {
  const transferableSkills: TransferableSkill[] = [];
  const dropped: string[] = [];

  for (const entry of items(raw, MAX_TRANSFERABLE)) {
    const row = entry as Record<string, unknown>;
    const fromSkill = detectedSkill(row.fromSkill, ctx);
    const toRequirement = text(row.toRequirement);
    const rationale = text(row.rationale);
    const evidence = text(row.evidence);

    if (!toRequirement || !rationale || !evidence) continue;

    if (!fromSkill) {
      dropped.push(
        `Transferable skill for "${toRequirement}" omitted: it started from a skill not detected in your resume.`,
      );
      continue;
    }

    if (!isQuoted(evidence, ctx)) {
      dropped.push(
        `Transferable skill for "${toRequirement}" omitted: its evidence is not in your resume.`,
      );
      continue;
    }

    transferableSkills.push({ fromSkill, toRequirement, rationale, evidence });
  }

  return { transferableSkills, dropped };
}
