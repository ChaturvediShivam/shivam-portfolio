import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { featureEnabled } from "@/lib/featureFlags";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { AiError } from "@/lib/ai/errors";
import { fromJsonLd } from "@/lib/capture/jsonld";
import { applyHeuristics } from "@/lib/capture/heuristics";
import { normalizeJobUrl } from "@/lib/opportunities";
import {
  CORE_CAPTURE_FIELDS,
  type CapturedJob,
  type CapturedPage,
  type CaptureProvenance,
  type CaptureResult,
} from "@/types/capture";

/**
 * Turn a captured page into reviewable job fields.
 *
 * Two passes, in this order and never the other way round:
 *
 *   1. Deterministic. schema.org JobPosting, then Open Graph, then the URL
 *      itself. Free, instant, and authored by the employer rather than inferred.
 *   2. AI, for whatever is still missing. Costs money and can be wrong, so it
 *      runs second and never overwrites a field the page already stated.
 *
 * On a Greenhouse or Lever posting the first pass usually fills everything that
 * matters, and the model is asked only to tidy the description. On a company
 * careers page with no structured data it does most of the work. On a page that
 * is not a job at all it should decline, and the caller shows that honestly.
 *
 * Provenance is tracked per field so the preview can distinguish "the page said
 * this" from "a model inferred this" from "nobody found this" — a distinction
 * that is the entire justification for a human review step.
 */

/** Ceiling on page text sent to the provider. A long posting is ~8k characters. */
const MAX_TEXT_CHARS = 24_000;

interface AiJobOutput {
  title: string | null;
  company: string | null;
  location: string | null;
  location_type: "remote" | "hybrid" | "onsite" | null;
  employment_type: string | null;
  seniority: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  job_description: string | null;
  skills: string[];
  experience: string | null;
  deadline_at: string | null;
  contact_name: string | null;
  contact_email: string | null;
  is_job_posting: boolean;
}

/** Registrable domain, for the `source` field and as a company fallback. */
export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Which job board this came from, as a `source` label.
 *
 * Matched on the host rather than guessed from the page, and left null when the
 * host is not a board we recognise — for a company careers page the domain
 * itself is the better answer, and that is what the caller stores.
 */
const KNOWN_BOARDS: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)indeed\.[a-z.]+$/, "indeed"],
  [/(^|\.)greenhouse\.io$/, "greenhouse"],
  [/(^|\.)lever\.co$/, "lever"],
  [/(^|\.)ashbyhq\.com$/, "ashby"],
  [/(^|\.)wellfound\.com$/, "wellfound"],
  [/(^|\.)naukri\.com$/, "naukri"],
  [/(^|\.)monster\.[a-z.]+$/, "monster"],
  [/(^|\.)myworkdayjobs\.com$/, "workday"],
  [/(^|\.)mail\.google\.com$/, "gmail"],
];

export function sourceFor(url: string): string | null {
  const host = domainOf(url);
  if (!host) return null;
  for (const [pattern, label] of KNOWN_BOARDS) if (pattern.test(host)) return label;
  return host;
}

function emptyJob(url: string): CapturedJob {
  return {
    title: null,
    company: null,
    location: null,
    location_type: null,
    employment_type: null,
    seniority: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    job_description: null,
    skills: [],
    experience: null,
    deadline_at: null,
    contact_name: null,
    contact_email: null,
    job_url: normalizeJobUrl(url) ?? url,
    source: sourceFor(url),
  };
}

/** Copy a value in only if the slot is still empty. Earlier passes win. */
function fill<K extends keyof CapturedJob>(
  job: CapturedJob,
  provenance: CaptureProvenance,
  key: K,
  value: CapturedJob[K] | null | undefined,
  source: "page" | "ai",
): void {
  if (value === null || value === undefined || value === "") return;
  if (Array.isArray(value) && value.length === 0) return;
  if (job[key] !== null && !(Array.isArray(job[key]) && (job[key] as unknown[]).length === 0)) return;
  job[key] = value;
  provenance[key] = source;
}

/** Deterministic pass. No network, no cost, no model. */
export function structureDeterministically(page: CapturedPage): {
  job: CapturedJob;
  provenance: CaptureProvenance;
} {
  const job = emptyJob(page.url);
  const provenance: CaptureProvenance = {};

  const ld = fromJsonLd(page.jsonLd ?? []);
  for (const [key, value] of Object.entries(ld.job)) {
    fill(job, provenance, key as keyof CapturedJob, value as never, "page");
  }

  // Open Graph only. The raw <title> is deliberately NOT used here: it almost
  // always carries the company and often the job board too ("Applied AI
  // Engineer at Bjak", "Job Application for X at Y"), so taking it verbatim
  // stores a role nobody advertised AND blocks the heuristic pass from
  // splitting it into a clean role and an employer. It is handled there.
  //
  // `og:site_name` is the company on most company-hosted career pages and is
  // wrong on aggregators, which is why it only fills a slot JobPosting left empty.
  fill(job, provenance, "title", page.meta?.ogTitle ?? null, "page");
  fill(job, provenance, "company", page.meta?.ogSiteName ?? null, "page");

  return { job, provenance };
}

/**
 * Full structuring. Runs the deterministic pass, then the model for the rest.
 *
 * Never throws for AI reasons. A refused, disabled, budget-exhausted or failing
 * provider degrades to the deterministic result with a notice — a capture that
 * returns the URL, the title and the page text is still far faster than typing,
 * and losing it because the model was unavailable would be the wrong trade.
 */
export async function structureCapture(
  supabase: SupabaseClient,
  ownerId: string,
  page: CapturedPage,
): Promise<Omit<CaptureResult, "duplicate">> {
  const { job, provenance } = structureDeterministically(page);

  const text = (page.selection?.trim() || page.text || "").slice(0, MAX_TEXT_CHARS);
  const truncated = (page.selection?.trim() || page.text || "").length > MAX_TEXT_CHARS;

  if (!featureEnabled("FEATURE_AI") || !featureEnabled("FEATURE_RESUME_AI")) {
    return degraded(job, provenance, "AI structuring is off — fields below were read from the page or inferred from it.", page);
  }
  if (text.length < 200) {
    return degraded(job, provenance, "This page had too little readable text to structure.", page);
  }

  // Telling the model what is already known stops it re-deriving fields the
  // employer already stated, and stops it contradicting them.
  const known = Object.keys(provenance).filter((k) => k !== "job_url" && k !== "source");
  const knownNote = known.length
    ? `The page already provided these fields, do not contradict them: ${known.join(", ")}.`
    : "";

  try {
    const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
    const completion = await gateway.complete<AiJobOutput>({
      templateId: "job_capture",
      variables: { url: page.url, title: page.title ?? "", text, knownNote },
      ownerId,
      actor: "user",
      action: "job_capture",
      entityType: "capture",
      entityId: null,
    });

    if (completion.stopReason === "refused") {
      return degraded(job, provenance, "The model declined to read this page.", page);
    }

    const parsed = completion.parsed;
    if (!parsed) {
      return degraded(job, provenance, "Structuring returned nothing usable.", page);
    }

    if (parsed.is_job_posting === false) {
      applyHeuristics(job, provenance, page);
      return {
        job,
        provenance,
        deterministicOnly: true,
        notice:
          "This does not look like a single job posting. Anything below came from the page itself — check it before saving.",
      };
    }

    for (const key of [
      "title", "company", "location", "location_type", "employment_type", "seniority",
      "salary_min", "salary_max", "salary_currency", "job_description", "experience",
      "deadline_at", "contact_name", "contact_email",
    ] as const) {
      fill(job, provenance, key, parsed[key] as never, "ai");
    }
    if (Array.isArray(parsed.skills)) {
      fill(job, provenance, "skills", parsed.skills.filter((s) => typeof s === "string").slice(0, 30), "ai");
    }

    // Last, so a regex can never displace something the employer published or
    // the model actually read.
    applyHeuristics(job, provenance, page);

    return {
      job,
      provenance,
      deterministicOnly: false,
      notice: partialNotice(job, truncated ? "The page was long, so only the first part was read." : null),
    };
  } catch (error) {
    // Budget exhausted, rate limited, provider down, misconfigured — all the
    // same from here: keep what the page gave us and say why the rest is empty.
    const reason = error instanceof AiError ? error.code : "error";
    console.error("[capture] AI structuring failed:", error);
    return degraded(job, provenance, `AI structuring was unavailable (${reason}).`, page);
  }
}

/**
 * The no-AI path. Heuristics run here, which is the whole point: this is what a
 * page with no structured data used to return, and it returned almost nothing.
 */
function degraded(
  job: CapturedJob,
  provenance: CaptureProvenance,
  notice: string,
  page: CapturedPage,
): Omit<CaptureResult, "duplicate"> {
  applyHeuristics(job, provenance, page);
  return { job, provenance, deterministicOnly: true, notice: `${notice} ${partialNotice(job, null) ?? ""}`.trim() };
}

/** Names the core fields nobody found, so "partial" is specific rather than vague. */
function partialNotice(job: CapturedJob, extra: string | null): string | null {
  const missing = CORE_CAPTURE_FIELDS.filter((f) => !job[f]);
  const parts: string[] = [];
  if (missing.length) parts.push(`Could not find: ${missing.join(", ")}. Add ${missing.length > 1 ? "them" : "it"} before saving.`);
  if (extra) parts.push(extra);
  return parts.length ? parts.join(" ") : null;
}
