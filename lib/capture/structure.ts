import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { featureEnabled } from "@/lib/featureFlags";
import { AiGateway } from "@/lib/ai/gateway";
import { getAiProvider } from "@/lib/ai/providers";
import { AiError } from "@/lib/ai/errors";
import { fromJsonLd } from "@/lib/capture/jsonld";
import { applyHeuristics, fieldsFromLabels } from "@/lib/capture/heuristics";
import { assembleJobDescription, trimAtEditorialBoundary } from "@/lib/capture/sections";
import { normalizeJobUrl } from "@/lib/opportunities";
import {
  CORE_CAPTURE_FIELDS,
  type CapturedJob,
  type CapturedPage,
  type CaptureProvenance,
  type CaptureResult,
  type CaptureSource,
} from "@/types/capture";

/**
 * Turn a captured page into reviewable job fields.
 *
 * Layered, strongest evidence first, and every layer only fills what the ones
 * above it left empty:
 *
 *   1. schema.org JobPosting          -> structured
 *   2. Open Graph tags                -> page
 *   3. <dl>/<table> label pairs       -> page
 *   4. Employer sections of the page  -> page   (the job description)
 *   5. Labelled text + prose patterns -> heuristic
 *   6. The model, for what is left    -> ai
 *
 * The model runs LAST, which is the point. It is an enhancement, not a
 * dependency: everything above it is deterministic, so a disabled flag, an
 * exhausted budget, a timeout or a malformed reply costs the gaps it would have
 * filled and nothing else. A capture must never come back emptier because a
 * provider was unavailable.
 *
 * Provenance is tracked per field so the preview can distinguish "the employer
 * published this" from "a model inferred it" from "nobody found it" — the
 * distinction that justifies a human review step at all.
 */

/**
 * Ceiling on text sent to the provider.
 *
 * Higher than the page text alone would need, because what gets sent is
 * preferentially the ASSEMBLED description — the employer's own sections with
 * the board's editorial already removed. That is denser signal per token than
 * raw page text, so a larger window buys more here than it did before.
 */
const MAX_TEXT_CHARS = 40_000;

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

/**
 * Prefer the page's own canonical URL.
 *
 * It is the posting's clean address without tracking parameters, which is also
 * what duplicate detection compares. The extractor already refuses a canonical
 * that names no real path, so a board pointing canonical at its homepage cannot
 * collapse every job into one URL.
 */
function jobUrlFor(page: { url: string; canonicalUrl?: string | null }): string {
  const canonical = page.canonicalUrl?.trim();
  if (canonical) return normalizeJobUrl(canonical) ?? canonical;
  return normalizeJobUrl(page.url) ?? page.url;
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
  source: CaptureSource,
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
  assembled: ReturnType<typeof assembleJobDescription>;
} {
  const job = emptyJob(page.url);
  job.job_url = jobUrlFor(page);
  const provenance: CaptureProvenance = {};

  // 1. schema.org JobPosting — machine-readable, published by the employer.
  const ld = fromJsonLd(page.jsonLd ?? []);
  for (const [key, value] of Object.entries(ld.job)) {
    fill(job, provenance, key as keyof CapturedJob, value as never, "structured");
  }

  // 2. Open Graph. The raw <title> is deliberately NOT used here: it almost
  // always carries the company and often the job board too ("Applied AI
  // Engineer at Bjak", "Job Application for X at Y"), so taking it verbatim
  // stores a role nobody advertised AND blocks the heuristic pass from
  // splitting it into a clean role and an employer. It is handled there.
  //
  // `og:site_name` is the company on most company-hosted career pages and is
  // wrong on aggregators, which is why it only fills a slot JobPosting left empty.
  fill(job, provenance, "title", page.meta?.ogTitle ?? null, "page");
  fill(job, provenance, "company", page.meta?.ogSiteName ?? null, "page");

  // 3. Label/value pairs the DOM itself asserted (<dl>, two-column rows).
  // Markup saying "this is a label and that is its value" is page evidence, not
  // a pattern inferred from adjacent lines.
  const labelled = fieldsFromLabels(page.labels ?? []);
  fill(job, provenance, "company", labelled.company ?? null, "page");
  fill(job, provenance, "location", labelled.location ?? null, "page");
  fill(job, provenance, "location_type", labelled.location_type ?? null, "page");
  fill(job, provenance, "employment_type", labelled.employment_type ?? null, "page");
  fill(job, provenance, "seniority", labelled.seniority ?? null, "page");
  if (labelled.salary) {
    fill(job, provenance, "salary_min", labelled.salary.min, "page");
    fill(job, provenance, "salary_max", labelled.salary.max, "page");
    fill(job, provenance, "salary_currency", labelled.salary.currency, "page");
  }

  // 4. The job description, assembled from the employer's own sections with the
  // board's editorial excluded. `page` rather than `heuristic`: this is the
  // page's text verbatim, only selected — nothing about it is inferred.
  // The role name is passed in so a section headed with it is recognised as the
  // posting's opening rather than as an unknown heading.
  const assembled = assembleJobDescription(page.sections ?? [], job.title ?? page.h1 ?? null);
  fill(job, provenance, "job_description", assembled.description, "page");

  // 5. Pattern extraction over the title and the prose, for everything still
  // empty. Inferred rather than read, so it is marked `heuristic` — but it is
  // still deterministic, which is why it belongs in this function and not
  // alongside the model. `structureDeterministically` is the complete
  // no-provider pipeline, and callers rely on that.
  // WHAT THE HEURISTICS ARE ALLOWED TO READ.
  //
  // The employer's own sections plus the metadata card — never the whole page.
  // Measured live: the board's "Remote Readiness Overview" section contains the
  // sentence "The role is fully remote", and while that is correctly excluded
  // from the description, scanning raw page text let it set `location_type`
  // anyway. A field inferred from the board's commentary about a job is not a
  // fact about the job.
  //
  // Raw text is used only when the page yielded no sections at all — an older
  // extension build, or a page the extractor could not read — and even then it
  // is cut at the first editorial heading.
  const employerText =
    assembled.description ?? trimAtEditorialBoundary(page.selection?.trim() || page.text || "");
  // Last resort for the description: the page yielded no usable sections, so
  // the trimmed page text is the posting as far as anything can tell. Marked
  // `heuristic` because its boundaries were inferred rather than read — the
  // text itself is still the page's own words, never a rewrite of them.
  //
  // The floor is one short sentence. Anything higher discards real postings:
  // "Run our support desk." is a complete job description on some pages.
  if (!job.job_description && employerText.trim().length >= 20) {
    fill(job, provenance, "job_description", employerText.trim(), "heuristic");
  }

  applyHeuristics(job, provenance, {
    title: page.title,
    h1: page.h1 ?? null,
    text: employerText,
    // The metadata card is excluded from the description but is exactly where a
    // summary card's labels live. On a page that yielded no sections the card is
    // still somewhere in the raw text, past the editorial boundary the
    // description was cut at — so label parsing sees the untrimmed page.
    labelText: [assembled.metadataText, page.selection?.trim() || page.text || ""].filter(Boolean).join("\n"),
  });

  return { job, provenance, assembled };
}

/**
 * Full structuring: every deterministic layer, then the model for what is left.
 *
 * The model NEVER runs before the deterministic passes and never overwrites
 * them. `fill()` refuses a non-empty slot, so ordering alone enforces the
 * precedence — there is no separate rule to keep in sync.
 *
 * Never throws for AI reasons. Disabled, refused, over budget, timed out,
 * malformed: each costs the gaps the model would have filled, and nothing else.
 * Everything the page stated has already been captured by the time the provider
 * is called at all.
 */
export async function structureCapture(
  supabase: SupabaseClient,
  ownerId: string,
  page: CapturedPage,
): Promise<Omit<CaptureResult, "duplicate">> {
  const { job, provenance, assembled } = structureDeterministically(page);

  const rawText = (page.selection?.trim() || page.text || "").trim();

  /** Everything captured so far, with a notice explaining what the model added or did not. */
  const withoutAi = (notice: string): Omit<CaptureResult, "duplicate"> => ({
    job,
    provenance,
    deterministicOnly: true,
    notice: [notice, partialNotice(job, null)].filter(Boolean).join(" "),
  });

  // The assembled description is denser signal per token than raw page text —
  // the board's editorial is already gone — so the model reads it when there is
  // enough of it. When section detection came back thin, the raw text is the
  // better input: a sparse assembly must not shrink what the model can see.
  const source =
    assembled.description && assembled.description.length >= 200 ? assembled.description : rawText;
  const modelText = source.slice(0, MAX_TEXT_CHARS);
  const truncated = source.length > MAX_TEXT_CHARS;

  if (!featureEnabled("FEATURE_AI") || !featureEnabled("FEATURE_RESUME_AI")) {
    return withoutAi("AI structuring is off — everything below was read from the page or inferred from it.");
  }
  if (modelText.length < 200) {
    return withoutAi("This page had too little readable text for the model to add anything.");
  }

  // Telling the model what is already known stops it re-deriving fields the
  // page stated and stops it contradicting them.
  const known = Object.keys(provenance).filter((k) => k !== "job_url" && k !== "source");
  const knownNote = known.length
    ? `The page already provided these fields, do not contradict them: ${known.join(", ")}.`
    : "";

  try {
    const gateway = new AiGateway({ provider: getAiProvider(), client: supabase });
    const completion = await gateway.complete<AiJobOutput>({
      templateId: "job_capture",
      variables: { url: page.url, title: page.title ?? "", text: modelText, knownNote },
      ownerId,
      actor: "user",
      action: "job_capture",
      entityType: "capture",
      entityId: null,
    });

    if (completion.stopReason === "refused") {
      return withoutAi("The model declined to read this page.");
    }

    const parsed = completion.parsed;
    if (!parsed || typeof parsed !== "object") {
      return withoutAi("The model returned nothing usable.");
    }

    if (parsed.is_job_posting === false) {
      return {
        job,
        provenance,
        deterministicOnly: true,
        notice:
          "This does not look like a single job posting. Anything below came from the page itself — check it before saving.",
      };
    }

    // Gaps only. Every one of these slots is empty at this point, or `fill`
    // leaves it alone.
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

    return {
      job,
      provenance,
      deterministicOnly: false,
      notice: partialNotice(job, truncated ? "The page was long, so the model only read the first part." : null),
    };
  } catch (error) {
    // Budget exhausted, rate limited, provider down, misconfigured, timed out —
    // all the same from here. Keep everything already captured and say why the
    // remaining gaps are gaps.
    const reason = error instanceof AiError ? error.code : "error";
    console.error("[capture] AI structuring failed:", error);
    return withoutAi(`AI structuring was unavailable (${reason}).`);
  }
}

/** Names the core fields nobody found, so "partial" is specific rather than vague. */
function partialNotice(job: CapturedJob, extra: string | null): string | null {
  const missing = CORE_CAPTURE_FIELDS.filter((f) => !job[f]);
  const parts: string[] = [];
  if (missing.length) parts.push(`Could not find: ${missing.join(", ")}. Add ${missing.length > 1 ? "them" : "it"} before saving.`);
  if (extra) parts.push(extra);
  return parts.length ? parts.join(" ") : null;
}
