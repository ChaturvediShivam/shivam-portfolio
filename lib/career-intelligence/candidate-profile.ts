import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KNOWS_ABOUT } from "@/constants";
import type { CandidateProfile } from "@/types/job-match";

/**
 * Candidate profile resolution (Phase 2 · AI job matching).
 *
 * Answers one question: what do we tell the model about this candidate?
 *
 * Resolution order, best source first:
 *   1. The current row in `resume_versions` (`is_current`, owner-scoped). This
 *      is the schema's designated home for a resume and the only source that
 *      reflects what the candidate actually wrote.
 *   2. A documented fallback, used when no resume has been stored yet.
 *
 * `resume_versions` exists in the schema but nothing writes to it today, so in
 * practice the fallback is what runs until a resume is saved. That is why the
 * source travels with the profile: an assessment built on a summary is less
 * grounded than one built on a resume, the prompt is told which it received,
 * and the UI says so rather than presenting both as equally solid.
 *
 * This is NOT a second profile store. It reads the existing table and, failing
 * that, assembles a read-only view from facts the repository already holds.
 * Nothing here is persisted.
 */

/**
 * Resume text ceiling. Bounds cost and the injection surface together, matching
 * the ceilings in `lib/ai/summarize.ts`. A resume beyond this is truncated, and
 * the prompt is told that it was.
 */
export const MAX_RESUME_CHARS = 12_000;

/**
 * Roles actively targeted. These drive `role_fit`, so they are the candidate's
 * stated intent — not an inference the model is allowed to make from the CV.
 */
const TARGET_ROLES = [
  "AI Application Engineer",
  "AI Product Engineer",
  "AI Solutions Engineer",
  "AI Automation Engineer",
  "AI Workflow Engineer",
  "AI Integration Engineer",
  "Founding Engineer (AI startup)",
  "AI-focused Research / Intelligence roles",
] as const;

/**
 * The fallback profile.
 *
 * Every claim here is one the repository already makes about this candidate —
 * the positioning and the "4+ years" figure are the CV's own wording as carried
 * in `constants/index.ts`, and the skills list is `KNOWS_ABOUT`, the same array
 * that feeds the site's structured data. Nothing is invented: no employer,
 * date, certification or technology appears here that is not already stated
 * elsewhere in this project.
 *
 * It is deliberately a summary rather than a synthetic resume. Padding it to
 * look like one would make the model more confident without making it better
 * informed, which is the opposite of what a fallback should do.
 */
const FALLBACK_PROFILE: CandidateProfile = {
  source: "fallback",
  headline: "AI Application Engineer | Strategic Research & AI",
  yearsExperience: 4,
  targetRoles: [...TARGET_ROLES],
  // Reused rather than restated, so the skills the model sees cannot drift from
  // the skills the rest of the application claims.
  skills: [...KNOWS_ABOUT],
  background: [
    "Strategic research professional with 4+ years across market research, competitive intelligence,",
    "business analysis and AML/KYC research, now building AI applications.",
    "",
    "Experience: Senior Research Associate at Jasper Colin Research (Sep 2024 - present), delivering",
    "market intelligence and competitive research across healthcare, BFSI and technology, and applying",
    "AI/LLM workflows to research and information extraction. Research Analyst at ZIGRAM",
    "(Nov 2021 - Jan 2024), conducting AML/KYC research, due diligence and intelligence investigations,",
    "and producing 100+ intelligence reports supporting compliance and risk analysis.",
    "",
    "Building: a Career Intelligence Platform (CareerCRM) - a Next.js/React/TypeScript application on",
    "Supabase and Vercel that integrates a hosted LLM provider API (see the skills list above for the",
    "specific provider) for resume analysis and career research, with a provider-agnostic AI",
    "architecture, token-budget controls, structured telemetry, automated testing and security",
    "validation. Also delivered a client marketing site build.",
    "",
    "Education: MBA (Finance & IT); B.Tech (Computer Science & Engineering).",
    "Certifications: Business Analytics (IIM Indore); SQL for Data Analysis (Codecademy).",
    "",
    "Note: this is a summary profile, not a full resume. Requirements it does not mention should be",
    "treated as unevidenced rather than as confirmed gaps, and confidence lowered accordingly.",
  ].join("\n"),
  resumeText: null,
};

/** The row shape we read. Narrow on purpose — a profile needs no file metadata. */
interface CurrentResumeRow {
  content_text: string | null;
  label: string | null;
}

/**
 * Resolve the profile the matcher should use.
 *
 * Never throws: a matching feature that dies because a resume lookup failed is
 * worse than one that falls back and says so. A query error is logged and
 * treated as "no stored resume".
 */
export async function getCandidateProfile(
  client: SupabaseClient,
  ownerId: string,
): Promise<CandidateProfile> {
  let row: CurrentResumeRow | null = null;

  try {
    const { data, error } = await client
      .from("resume_versions")
      .select("content_text, label")
      // owner_id is filtered explicitly rather than relying on RLS, because
      // this runs under a session client AND (later) a service-role client.
      .eq("owner_id", ownerId)
      .eq("is_current", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    row = data as CurrentResumeRow | null;
  } catch (error) {
    console.error("[candidate-profile] resume lookup failed; using fallback:", error);
    return FALLBACK_PROFILE;
  }

  const text = typeof row?.content_text === "string" ? row.content_text.trim() : "";
  // An empty or whitespace-only resume row is not a resume. Falling back is
  // better than sending the model a blank profile and a confident-looking
  // "resume" heading above nothing.
  if (!text) return FALLBACK_PROFILE;

  return {
    ...FALLBACK_PROFILE,
    source: "resume",
    headline: row?.label?.trim() || FALLBACK_PROFILE.headline,
    resumeText: text.slice(0, MAX_RESUME_CHARS),
  };
}

/** The fallback, exposed for tests and for callers that must not hit the DB. */
export function getFallbackCandidateProfile(): CandidateProfile {
  return FALLBACK_PROFILE;
}
