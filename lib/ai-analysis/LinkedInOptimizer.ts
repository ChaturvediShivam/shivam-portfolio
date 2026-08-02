import "server-only";
import type { AiGateway } from "@/lib/ai/gateway";
import type { InsightRequest, LinkedInSuggestions } from "@/lib/ai-analysis/AIAnalysisTypes";
import { items, normalize, prose, text } from "@/lib/ai-analysis/grounding";

/**
 * LinkedIn profile copy (Resume AI · Phase 3 · Step 2).
 *
 * `skillsToFeature` is filtered against the skills the parser detected, using
 * the display labels the operator was shown. A profile is public and permanent
 * in a way a resume sent to one employer is not, so a skill listed there
 * without support is a claim the operator has to defend to everyone who reads
 * it — including recruiters for roles they have not applied to.
 *
 * Returns null rather than a partial object when the model gives no usable
 * headline or about text. Half a profile suggestion is not something to render
 * a panel around.
 */

const TEMPLATE_ID = "resume_linkedin";
const MAX_SKILLS = 12;
const MAX_NOTES = 6;

interface LinkedInOutput {
  headline: unknown;
  about: unknown;
  skillsToFeature: unknown;
  notes: unknown;
}

export interface GroundedLinkedIn {
  suggestions: LinkedInSuggestions | null;
  dropped: string[];
}

export async function optimizeLinkedIn(
  gateway: AiGateway,
  request: InsightRequest,
): Promise<GroundedLinkedIn> {
  const completion = await gateway.complete<LinkedInOutput>({
    templateId: TEMPLATE_ID,
    ownerId: request.ownerId,
    actor: "user",
    action: "resume_linkedin",
    entityType: "resume",
    variables: {
      jobTitle: request.jobTitle,
      detectedSkills: request.detectedSkills.join(", ") || "none detected",
      resume: request.resumeText,
    },
  });

  if (completion.stopReason !== "completed" || !completion.parsed) {
    return { suggestions: null, dropped: [] };
  }

  const headline = text(completion.parsed.headline);
  const about = prose(completion.parsed.about);
  if (!headline || !about) return { suggestions: null, dropped: [] };

  const allowed = new Map(request.detectedSkills.map((label) => [normalize(label), label]));
  const skillsToFeature: string[] = [];
  const dropped: string[] = [];

  for (const entry of items(completion.parsed.skillsToFeature, MAX_SKILLS)) {
    if (typeof entry !== "string") continue;
    const label = allowed.get(normalize(entry));
    if (!label) {
      dropped.push(`LinkedIn skill "${entry}" omitted: it was not detected in your resume.`);
      continue;
    }
    if (!skillsToFeature.includes(label)) skillsToFeature.push(label);
  }

  const notes = items(completion.parsed.notes, MAX_NOTES)
    .map((note) => text(note))
    .filter((note): note is string => note !== null);

  return { suggestions: { headline, about, skillsToFeature, notes }, dropped };
}
