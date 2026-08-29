import "server-only";

/**
 * Shared transport for research providers.
 *
 * Phase 1's AI Dev Jobs adapter owns a private fetch wrapper, which was correct
 * when there was one provider. With four, the same concerns — timeout, error
 * taxonomy, backoff, per-host rate limiting — would be copied four times, so
 * they live here once. The Phase 1 adapter is deliberately NOT refactored onto
 * this: it is verified, shipped and untouched, and rewriting working code to
 * satisfy a symmetry argument is how a working integration acquires a
 * regression.
 *
 * Every policy here exists because a free public API is a shared resource:
 * we bound our own concurrency rather than discovering the provider's limit by
 * tripping it.
 */

const DEFAULT_TIMEOUT_MS = 12_000;

/** Attempts total, not retries — 3 means the original plus two retries. */
const MAX_ATTEMPTS = 3;

/** Base for exponential backoff. Attempt n waits BASE * 2^(n-1), plus jitter. */
const BACKOFF_BASE_MS = 400;

/**
 * Overridable so the test suite does not spend real seconds asleep proving that
 * retries are bounded. Production never calls the setter.
 */
let backoffBaseMs = BACKOFF_BASE_MS;

// --- Errors ------------------------------------------------------------------

export class ResearchApiError extends Error {
  readonly provider: string;
  readonly status: number;
  constructor(provider: string, status: number, message?: string) {
    super(message ?? `${provider} API error (${status}).`);
    this.name = "ResearchApiError";
    this.provider = provider;
    this.status = status;
  }
}

/** 401/403 — a missing or rejected credential, or a policy violation. */
export class ResearchAuthError extends ResearchApiError {
  constructor(provider: string, status: number, message?: string) {
    super(provider, status, message ?? `${provider} rejected the request (${status}).`);
    this.name = "ResearchAuthError";
  }
}

/** 429 or a provider-declared quota breach. */
export class ResearchRateLimitError extends ResearchApiError {
  constructor(provider: string, status: number) {
    super(provider, status, `${provider} rate limit reached (${status}).`);
    this.name = "ResearchRateLimitError";
  }
}

/** Transport failure or our own timeout. */
export class ResearchNetworkError extends Error {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = "ResearchNetworkError";
    this.provider = provider;
  }
}

/** 2xx whose body is not the JSON we can use. */
export class ResearchResponseError extends Error {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = "ResearchResponseError";
    this.provider = provider;
  }
}

/** Provider not configured — a missing key. Never thrown mid-request. */
export class ResearchUnconfiguredError extends Error {
  readonly provider: string;
  constructor(provider: string, envVar: string) {
    super(`${provider} is not configured. Set ${envVar}.`);
    this.name = "ResearchUnconfiguredError";
    this.provider = provider;
  }
}

// --- Per-host rate limiting --------------------------------------------------

/**
 * Minimum spacing between requests to one host, enforced in-process.
 *
 * A serial gate rather than a token bucket: research calls are user-triggered
 * and low-volume, and the failure this prevents (SEC's documented 10 req/s
 * ceiling, tripped by a burst) does not need a sophisticated limiter.
 *
 * ponytail: per-process only. A serverless deployment runs several instances,
 * so the real ceiling is this times the instance count — move to a shared
 * limiter (Redis, or the existing `lib/rateLimit`) if a provider starts 429ing.
 */
const lastRequestAt = new Map<string, number>();

/** Test seam: skip the real sleep. Production never sets this. */
let rateLimitDisabled = false;

async function throttle(host: string, perSecond: number): Promise<void> {
  if (rateLimitDisabled || perSecond <= 0) return;
  const minGap = 1000 / perSecond;
  const previous = lastRequestAt.get(host) ?? 0;
  const wait = previous + minGap - Date.now();
  // Reserve the slot before awaiting, so concurrent callers queue behind each
  // other instead of all reading the same stale timestamp.
  lastRequestAt.set(host, Math.max(Date.now(), previous + minGap));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** Test seam. Not used by application code. */
export function resetRateLimiter(): void {
  lastRequestAt.clear();
}

/** Test seam: shrink retry backoff. Not used by application code. */
export function __setBackoffBaseMs(ms: number): void {
  backoffBaseMs = ms > 0 ? ms : BACKOFF_BASE_MS;
}

/**
 * Test seam: bypass the per-host throttle.
 *
 * The limiter is asserted directly in its own test; every other suite only
 * needs the request to happen, and paying a real 1-second gap per call would
 * add ten seconds to the suite for no extra confidence.
 */
export function __setRateLimitDisabled(disabled: boolean): void {
  rateLimitDisabled = disabled;
}

// --- Request -----------------------------------------------------------------

export interface ResearchRequest {
  readonly provider: string;
  readonly url: URL | string;
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Requests per second for this provider's host. */
  readonly rateLimitPerSecond?: number;
  /** Cache lifetime in seconds. 0 disables caching for this call. */
  readonly revalidateSeconds?: number;
}

/** Retry only what a retry can fix: transient server faults and throttling. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function backoffDelay(attempt: number): number {
  const base = backoffBaseMs * 2 ** (attempt - 1);
  // Jitter prevents several providers retrying in lockstep after one outage.
  return base + Math.random() * base * 0.25;
}

/**
 * Fetch JSON from a research provider.
 *
 * @throws {ResearchNetworkError}  transport failure or timeout
 * @throws {ResearchRateLimitError} 429 after exhausting attempts
 * @throws {ResearchAuthError}     401/403
 * @throws {ResearchApiError}      any other non-2xx
 * @throws {ResearchResponseError} 2xx that is not parseable JSON
 *
 * Bounded by construction: at most MAX_ATTEMPTS, each with its own timeout, so
 * a hanging provider cannot hold a request open indefinitely and a retry loop
 * cannot become infinite.
 */
export async function fetchJson<T = unknown>(request: ResearchRequest): Promise<T> {
  const url = typeof request.url === "string" ? new URL(request.url) : request.url;
  const provider = request.provider;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await throttle(url.host, request.rateLimitPerSecond ?? 0);

    const timeout = AbortSignal.timeout(timeoutMs);
    const signal =
      request.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([timeout, request.signal])
        : (request.signal ?? timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...request.headers },
        signal,
        next:
          request.revalidateSeconds === 0
            ? { revalidate: 0 }
            : { revalidate: request.revalidateSeconds ?? 300 },
      });
    } catch (error) {
      // A caller-initiated abort is not a provider fault and must not be retried.
      if (request.signal?.aborted) throw new ResearchNetworkError(provider, `${provider} request cancelled.`);
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      lastError = new ResearchNetworkError(
        provider,
        timedOut ? `${provider} timed out after ${timeoutMs}ms.` : `${provider} network request failed.`,
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt)));
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      try {
        return (await response.json()) as T;
      } catch {
        // Not retryable: a 200 that is not JSON will not become JSON.
        throw new ResearchResponseError(provider, `${provider} returned a body that is not valid JSON.`);
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new ResearchAuthError(provider, response.status);
    }

    if (isRetryable(response.status) && attempt < MAX_ATTEMPTS) {
      lastError = new ResearchApiError(provider, response.status);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt)));
      continue;
    }

    if (response.status === 429) throw new ResearchRateLimitError(provider, response.status);
    throw new ResearchApiError(provider, response.status);
  }

  throw lastError ?? new ResearchNetworkError(provider, `${provider} request failed.`);
}

// --- Narrowing helpers -------------------------------------------------------
// Shared because four adapters need the same defensive reads. The repo has no
// schema library; `lib/validation.ts` validates form fields, not API payloads.

export type Json = Record<string, unknown>;

export const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Non-empty trimmed string, or null. */
export function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Finite number, or null. Accepts a numeric string, since JSON APIs mix both. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Array of non-empty strings; anything else yields []. */
export function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Coerce a source timestamp to an ISO 8601 string, or null.
 *
 * Sources publish epoch seconds (Arbeitnow), ISO strings (Noozra) and bare
 * dates (SEC). An unparseable value becomes null rather than "Invalid Date",
 * because a wrong timestamp on an evidence record is worse than a missing one.
 */
export function isoDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Heuristic: values below ~year 2286 in ms are almost certainly seconds.
    const ms = v < 10_000_000_000 ? v * 1000 : v;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const s = str(v);
  if (!s) return null;

  // A datetime with no timezone means UTC here, not the server's local zone.
  // USAJOBS publishes "2026-08-19T11:03:40.7670" with no suffix; `new Date`
  // would read that as local time and shift it by the host's offset, which
  // moves a late-evening posting to the wrong calendar day. Date-only values
  // ("2026-08-19") already parse as UTC and are left alone.
  const zoneless = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s);
  const date = new Date(zoneless ? `${s.replace(" ", "T")}Z` : s);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
