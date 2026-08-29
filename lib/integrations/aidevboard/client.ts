import "server-only";

/**
 * AI Dev Jobs (aidevboard.com) REST adapter — public job search.
 *
 * Low-level, server-side wrapper over the public `/api/v1/jobs` endpoint.
 * Returns the API's OWN job shape (snake_case, deliberately): what you see in
 * `curl` is what you get in code, which makes the API docs directly usable and
 * keeps this file free of naming opinions. Converting to domain vocabulary is
 * `normalize.ts`'s job, and only that file knows both shapes.
 *
 * Authentication: none. The endpoint reports `access.mode: "open"` and
 * "API keys are optional for stable agent identity and keyed hourly
 * throttling". So no key is read, stored, or sent. If a future endpoint answers
 * 401, that is a deliberate decision to bring to a human, not a prompt to
 * invent a credential — hence `AiDevBoardAuthError` exists but is never
 * produced by a public call.
 *
 * Everything here is defensive. This is a third-party API with no contract
 * guarantee: a field can vanish, a row can arrive malformed, the host can hang.
 * The rule is that one bad row must not cost the caller the other 49, but a
 * malformed *envelope* is unrecoverable and throws.
 */

const AIDEVBOARD_BASE = "https://aidevboard.com/api/v1";

/** Wall-clock ceiling for one request. The public API answers in ~1.7s. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** The API's own ceiling; asking for more is silently capped, so clamp here. */
const MAX_LIMIT = 100;

// --- Errors ------------------------------------------------------------------
// Separate classes rather than one error with a code, so a caller can decide
// per failure mode: retry a network blip, surface an outage, alert on a schema
// break. `instanceof` is the whole interface.

/** Non-2xx response from the API. */
export class AiDevBoardApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AiDevBoardApiError";
    this.status = status;
  }
}

/** 401/403. Not reachable via public search; see the note in the file header. */
export class AiDevBoardAuthError extends AiDevBoardApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "AiDevBoardAuthError";
  }
}

/** 429 — worth backing off rather than retrying immediately. */
export class AiDevBoardRateLimitError extends AiDevBoardApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "AiDevBoardRateLimitError";
  }
}

/** DNS failure, connection reset, or our own timeout firing. */
export class AiDevBoardNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiDevBoardNetworkError";
  }
}

/** 2xx that is not the JSON we can use — body unparseable or envelope wrong. */
export class AiDevBoardResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiDevBoardResponseError";
  }
}

// --- Raw API shapes (only what we consume) -----------------------------------

/**
 * A job exactly as `/jobs` returns it.
 *
 * Nullability is a judgement, not an observation: across 200 sampled rows the
 * API never returned null. The fields marked nullable here are the ones that
 * are *semantically* optional (not every posting states a salary), so a future
 * null cannot become a runtime crash.
 */
export interface AiDevBoardJob {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly url: string;
  readonly apply_url: string | null;
  readonly description: string | null;
  readonly tags: readonly string[];

  readonly company_id: string | null;
  readonly company_name: string | null;
  readonly company_slug: string | null;
  readonly company_logo_url: string | null;

  readonly location: string | null;
  /** "remote" | "hybrid" | "onsite" observed; typed open — it is their enum. */
  readonly workplace: string | null;
  /** "restricted" | "not_remote" | "unknown" observed. */
  readonly remote_scope: string | null;
  readonly job_type: string | null;
  /** "mid" | "senior" | "lead" | "principal" observed. */
  readonly experience_level: string | null;

  readonly salary_min: number | null;
  readonly salary_max: number | null;

  readonly published_at: string | null;
  readonly expires_at: string | null;
  readonly quality_score: number | null;
  readonly status: string | null;
}

/**
 * One page of results.
 *
 * camelCase here because this envelope is ours: it is a curated subset of the
 * API's response plus `droppedCount`, which the API does not send. The `jobs`
 * inside stay snake_case for the reason given in the file header.
 */
export interface AiDevBoardJobsPage {
  readonly jobs: readonly AiDevBoardJob[];
  readonly page: number;
  readonly perPage: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  /** The API estimates `total` on large result sets; false means "about". */
  readonly totalIsExact: boolean;
  /**
   * Rows the API returned that failed validation and were discarded. Normally
   * 0; a non-zero value is the early warning that their schema moved.
   */
  readonly droppedCount: number;
}

// --- Query parameters --------------------------------------------------------

/**
 * Search filters. Every field is optional — a bare `getJobs()` is a valid
 * "latest jobs" call, and no filter is baked into this module.
 */
export interface GetJobsParams {
  /** Free-text query, e.g. "LLM". */
  readonly q?: string;
  /** Repeated as a comma-joined value, e.g. ["llm", "agents"]. */
  readonly tags?: readonly string[] | string;
  /** Employment type, e.g. "full-time". */
  readonly type?: string;
  /** Experience level, e.g. "senior". */
  readonly level?: string;
  readonly location?: string;
  /** "remote" | "hybrid" | "onsite". */
  readonly workplace?: string;
  /** Restrict to globally-remote roles. */
  readonly global_remote?: boolean;
  readonly salary_min?: number;
  readonly salary_max?: number;
  /** Company slug, e.g. "abnormal-security". */
  readonly company?: string;
  /** 1-based. */
  readonly page?: number;
  /** Results per page; clamped to 1..100. */
  readonly limit?: number;
}

/** Transport-level options, kept separate from search filters. */
export interface RequestOptions {
  readonly timeoutMs?: number;
  /** Caller's own cancellation, combined with the timeout. */
  readonly signal?: AbortSignal;
}

// --- Runtime narrowing -------------------------------------------------------
// Small and local by design. The repo has no schema library and its
// `lib/validation.ts` validates form fields, not API payloads; `lib/capture`
// solves the same problem the same way.

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Non-empty string or null. Trims, because " " is not a value. */
function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Finite number or null. Rejects NaN/Infinity and numeric strings. */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Array of non-empty strings; anything else becomes []. */
function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Validate one job row.
 *
 * Returns null — rather than throwing — when the row lacks the two fields that
 * make it usable at all (`id`, `title`). A posting with no id cannot be
 * deduped and one with no title cannot be shown, so it is dropped and counted.
 */
function parseJob(raw: unknown): AiDevBoardJob | null {
  if (!isObject(raw)) return null;

  const id = str(raw.id);
  const title = str(raw.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    slug: str(raw.slug) ?? "",
    url: str(raw.url) ?? "",
    apply_url: str(raw.apply_url),
    description: str(raw.description),
    tags: strArray(raw.tags),

    company_id: str(raw.company_id),
    company_name: str(raw.company_name),
    company_slug: str(raw.company_slug),
    company_logo_url: str(raw.company_logo_url),

    location: str(raw.location),
    workplace: str(raw.workplace),
    remote_scope: str(raw.remote_scope),
    job_type: str(raw.job_type),
    experience_level: str(raw.experience_level),

    salary_min: num(raw.salary_min),
    salary_max: num(raw.salary_max),

    published_at: str(raw.published_at),
    expires_at: str(raw.expires_at),
    quality_score: num(raw.quality_score),
    status: str(raw.status),
  };
}

/**
 * Validate the envelope.
 *
 * `jobs` may legitimately be `null`: the live API returns `"jobs": null` — not
 * `[]` — when a query matches nothing, alongside `total: 0` and a normal
 * pagination block. Null therefore means "no results" and yields an empty page.
 *
 * The key must still be PRESENT. A body with no `jobs` field at all is not an
 * empty result, it is a different endpoint (or an error page), and silently
 * reporting "0 jobs" for it would hide a real failure behind a plausible
 * screen. Likewise any non-array, non-null value is a schema break and throws:
 * being permissive enough to accept `null` must not become permissive enough to
 * swallow a genuinely broken response.
 */
function parseJobsPage(body: unknown): AiDevBoardJobsPage {
  if (!isObject(body)) {
    throw new AiDevBoardResponseError("Expected a JSON object from AI Dev Jobs.");
  }
  if (!("jobs" in body)) {
    throw new AiDevBoardResponseError('AI Dev Jobs response is missing the "jobs" field.');
  }

  const rawJobs = body.jobs === null ? [] : body.jobs;
  if (!Array.isArray(rawJobs)) {
    throw new AiDevBoardResponseError('AI Dev Jobs response has a non-array "jobs" field.');
  }

  const jobs: AiDevBoardJob[] = [];
  let droppedCount = 0;
  for (const row of rawJobs) {
    const job = parseJob(row);
    if (job) jobs.push(job);
    else droppedCount += 1;
  }

  // Pagination is derived rather than trusted: these drive UI controls, and a
  // missing `total_pages` should not render "page 1 of NaN".
  const page = num(body.page) ?? 1;
  const perPage = num(body.per_page) ?? jobs.length;
  const total = num(body.total) ?? jobs.length;
  const totalPages = num(body.total_pages) ?? (perPage > 0 ? Math.ceil(total / perPage) : 1);

  return {
    jobs,
    page,
    perPage,
    total,
    totalPages,
    hasNext: bool(body.has_next, page < totalPages),
    totalIsExact: bool(body.total_is_exact, true),
    droppedCount,
  };
}

// --- Transport ---------------------------------------------------------------

/**
 * Build the query string.
 *
 * `URL.searchParams` does the escaping, so a value containing `&` or a space
 * cannot break out of its parameter. Undefined, null and empty values are
 * omitted entirely rather than sent as `q=` — an empty filter should mean "no
 * filter", not "match the empty string".
 */
function buildSearchParams(params: GetJobsParams): URLSearchParams {
  const search = new URLSearchParams();

  const put = (key: string, value: string | null) => {
    if (value !== null && value.length > 0) search.set(key, value);
  };

  put("q", str(params.q));
  put("type", str(params.type));
  put("level", str(params.level));
  put("location", str(params.location));
  put("workplace", str(params.workplace));
  put("company", str(params.company));

  if (params.tags !== undefined) {
    const tags = Array.isArray(params.tags) ? params.tags : [params.tags];
    put("tags", strArray(tags).join(","));
  }
  if (typeof params.global_remote === "boolean") {
    put("global_remote", String(params.global_remote));
  }

  const salaryMin = num(params.salary_min);
  if (salaryMin !== null) put("salary_min", String(Math.trunc(salaryMin)));
  const salaryMax = num(params.salary_max);
  if (salaryMax !== null) put("salary_max", String(Math.trunc(salaryMax)));

  const page = num(params.page);
  if (page !== null) put("page", String(Math.max(1, Math.trunc(page))));
  const limit = num(params.limit);
  if (limit !== null) {
    put("limit", String(Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))));
  }

  return search;
}

async function aidevboardFetch<T>(
  path: string,
  search: URLSearchParams,
  parse: (body: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${AIDEVBOARD_BASE}${path}`);
  url.search = search.toString();

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // AbortSignal.any lets the caller cancel without losing the timeout. It is
  // Node 20+/modern-browser; fall back to the timeout alone where absent.
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal =
    options.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([timeout, options.signal])
      : (options.signal ?? timeout);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      // Public, non-personalised data. Five minutes keeps a page refresh from
      // hammering a free API without letting the board go stale.
      next: { revalidate: 300 },
    });
  } catch (error) {
    // Timeouts and transport failures both land here as a thrown fetch. The
    // cause is preserved in the message but never the URL's query — see the
    // note on not leaking caller input into logs.
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? `timed out after ${timeoutMs}ms`
        : "network request failed";
    throw new AiDevBoardNetworkError(`AI Dev Jobs ${reason}.`);
  }

  if (!res.ok) {
    const message = `AI Dev Jobs API error (${res.status}).`;
    if (res.status === 401 || res.status === 403) throw new AiDevBoardAuthError(message, res.status);
    if (res.status === 429) throw new AiDevBoardRateLimitError(message, res.status);
    throw new AiDevBoardApiError(message, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiDevBoardResponseError("AI Dev Jobs returned a body that is not valid JSON.");
  }

  return parse(body);
}

// --- Public API --------------------------------------------------------------

/**
 * Search public job listings.
 *
 * @throws {AiDevBoardNetworkError}  transport failure or timeout
 * @throws {AiDevBoardRateLimitError} 429
 * @throws {AiDevBoardAuthError}     401/403 (not expected on public search)
 * @throws {AiDevBoardApiError}      any other non-2xx
 * @throws {AiDevBoardResponseError} 2xx whose body is not a usable envelope
 *
 * An empty result is NOT an error: it resolves with `jobs: []` and `total: 0`.
 * Callers distinguish "nothing matched" from "something broke" by which of
 * those two happened, so neither has to be inferred from a magic value.
 */
export async function getJobs(
  params: GetJobsParams = {},
  options: RequestOptions = {},
): Promise<AiDevBoardJobsPage> {
  return aidevboardFetch("/jobs", buildSearchParams(params), parseJobsPage, options);
}

/** Exported for tests: query construction is the easiest thing to get wrong. */
export const __testing = { buildSearchParams, parseJobsPage, parseJob };
