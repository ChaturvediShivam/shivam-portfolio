/**
 * Universal page capture types.
 *
 * Shared by the browser extension, the capture API and the structuring layer.
 * Not server-only: the extension's popup renders against these shapes.
 */

/**
 * Where a field's value came from. Shown to the person reviewing, because these
 * are genuinely different claims and collapsing them hides real uncertainty:
 *
 *   structured — machine-readable data the employer published for machines to
 *                read (schema.org JobPosting). The strongest evidence there is.
 *   page       — a value visibly labelled on the page: a <dl>/<table> pair, or
 *                an Open Graph tag. Someone typed it into a field meant for it.
 *   heuristic  — inferred by pattern from the title or the prose. A guess.
 *   ai         — a model read the page text and extracted it.
 *
 * Precedence is structured > page > heuristic > ai. AI ranks last on purpose: it
 * fills gaps and must never overwrite something the page states outright.
 */
export type CaptureSource = "structured" | "page" | "heuristic" | "ai";

/** Rank for precedence comparisons. Higher wins. */
export const SOURCE_RANK: Record<CaptureSource, number> = {
  structured: 4,
  page: 3,
  heuristic: 2,
  ai: 1,
};

/**
 * One heading-delimited block of the page, in document order.
 *
 * The extension collects these because only it has a DOM. A heading, a list and
 * a paragraph are indistinguishable once flattened into text, and guessing
 * which is which from a text blob is exactly the class of heuristic that
 * produced the "Written by Surely Remote" false positive.
 */
export interface CapturedSection {
  /** Heading text, or null for the lead paragraphs before the first heading. */
  heading: string | null;
  /** Heading level (1-4); 0 for the lead block. */
  level: number;
  /** The block's text, with list items kept as "• " lines. */
  text: string;
}

/**
 * A visibly labelled value: a <dl> dt/dd pair or a two-column table row.
 *
 * Separate from the text-regex label parser, which reads the same shapes at much
 * lower confidence after they have been flattened. When the DOM says "this is a
 * label and that is its value", that is page evidence, not a guess.
 */
export interface CapturedLabel {
  label: string;
  value: string;
}

/**
 * Raw material lifted from the tab, before any interpretation.
 *
 * The extension sends text and metadata, never HTML. A job page's markup is
 * megabytes of layout with a few hundred useful words inside it; shipping it
 * would cost bandwidth on the way in and tokens on the way out for nothing.
 */
export interface CapturedPage {
  url: string;
  /**
   * `<link rel="canonical">`, when the page publishes one and it names a real
   * path. Preferred over `location.href` because it is the posting's clean
   * address without tracking parameters — which is also what duplicate
   * detection compares.
   */
  canonicalUrl?: string | null;
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
  /** Heading-delimited blocks in document order. Drives JD assembly. */
  sections?: CapturedSection[];
  /** Explicitly labelled values lifted from <dl> and <table>. */
  labels?: CapturedLabel[];
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
