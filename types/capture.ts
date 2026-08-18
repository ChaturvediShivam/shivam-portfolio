/**
 * Universal page capture types.
 *
 * Shared by the browser extension, the capture API and the structuring layer.
 * Not server-only: the extension's popup renders against these shapes.
 */

/**
 * Where a field's value came from. Shown to the person reviewing, so the three
 * are genuinely different claims:
 *
 *   page      — the site published it (schema.org JobPosting, Open Graph).
 *   ai        — a model read the page text and extracted it.
 *   heuristic — inferred by pattern from the title or the text. A guess, and
 *               labelled as one, because these fill in when AI is unavailable
 *               and a guess presented as a reading is how wrong data gets saved.
 */
export type CaptureSource = "page" | "ai" | "heuristic";

/**
 * Raw material lifted from the tab, before any interpretation.
 *
 * The extension sends text and metadata, never HTML. A job page's markup is
 * megabytes of layout with a few hundred useful words inside it; shipping it
 * would cost bandwidth on the way in and tokens on the way out for nothing.
 */
export interface CapturedPage {
  url: string;
  title: string;
  /** Visible text, whitespace-collapsed and truncated by the extension. */
  text: string;
  /** `<meta>` and Open Graph values worth keeping. */
  meta?: {
    description?: string | null;
    ogTitle?: string | null;
    ogSiteName?: string | null;
    ogDescription?: string | null;
  };
  /**
   * `application/ld+json` blocks, parsed. Many applicant tracking systems emit
   * a schema.org JobPosting here, which is the single highest-value thing on
   * the page: it is structured, authored by the employer, and needs no model.
   */
  jsonLd?: unknown[];
  /** Text the user had selected, if any. Treated as a strong hint. */
  selection?: string | null;
  /**
   * The page's first heading. Usually the role on its own, where the document
   * title also carries the company and the job board, so it is the better
   * source when no structured data exists.
   */
  h1?: string | null;
}

/**
 * The fields the preview screen edits and the save endpoint accepts.
 *
 * Every one is nullable. A capture that could not find a salary must say so
 * rather than inventing one — the whole value of a review step is that the
 * person can trust what is already filled in.
 */
export interface CapturedJob {
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
  job_url: string;
  source: string | null;
}

/** Which fields were found, and by what. Absent key means "not found". */
export type CaptureProvenance = Partial<Record<keyof CapturedJob, CaptureSource>>;

export interface CaptureResult {
  job: CapturedJob;
  provenance: CaptureProvenance;
  /** True when the AI pass was skipped or failed; only deterministic data. */
  deterministicOnly: boolean;
  /** Human-readable note when extraction was partial or degraded. */
  notice: string | null;
  /** An opportunity already tracking this URL, if there is one. */
  duplicate: { id: string; title: string; stage: string; archived_at: string | null } | null;
}

/** Fields a person would expect any job capture to fill. Drives the partial-extraction notice. */
export const CORE_CAPTURE_FIELDS = ["title", "company", "job_description"] as const;
