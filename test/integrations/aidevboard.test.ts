import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getJobs,
  AiDevBoardApiError,
  AiDevBoardAuthError,
  AiDevBoardRateLimitError,
  AiDevBoardNetworkError,
  AiDevBoardResponseError,
  __testing,
  type AiDevBoardJob,
} from "@/lib/integrations/aidevboard/client";
import { normalizeJob } from "@/lib/integrations/aidevboard/normalize";

/**
 * AI Dev Jobs adapter.
 *
 * `fetch` is stubbed rather than hit for real: a suite that depends on a
 * third-party host is a suite that fails on a plane. The one thing that cannot
 * be asserted this way — that the live API still returns this shape — is
 * covered by `parseJobsPage` dropping rows and reporting `droppedCount`.
 */

const { buildSearchParams, parseJobsPage } = __testing;

/** One row copied from a real `curl` response, trimmed to the fields we read. */
const REAL_JOB = {
  id: "a583cfdf-e13d-431b-bedd-172ede971ced",
  title: "Software Engineer II - Dev Accelerator",
  slug: "software-engineer-ii-dev-accelerator-95beb30d",
  url: "https://aidevboard.com/job/a583cfdf-e13d-431b-bedd-172ede971ced",
  apply_url: "https://abnormal.ai/careers/jobs/7967606003",
  description: "About the Team...",
  tags: ["llm", "api-design", "agents"],
  company_id: "7455e78c-482b-4f7b-9d62-11b78645818a",
  company_name: "Abnormal Security",
  company_slug: "abnormal-security",
  company_logo_url: "https://example.com/favicon.png",
  location: "Remote (US)",
  workplace: "remote",
  remote_scope: "restricted",
  job_type: "full-time",
  experience_level: "mid",
  salary_min: 149200,
  salary_max: 214500,
  published_at: "2026-08-25T18:54:00Z",
  expires_at: "2026-09-25T13:34:24.065498Z",
  quality_score: 90,
  status: "active",
};

function envelope(jobs: unknown[], extra: Record<string, unknown> = {}) {
  return {
    jobs,
    page: 1,
    per_page: jobs.length,
    total: jobs.length,
    total_pages: 1,
    has_next: false,
    total_is_exact: true,
    ...extra,
  };
}

/** Stub `fetch` and capture the URL it was called with. */
function stubFetch(response: Partial<Response> & { json?: () => unknown }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: URL | string) => {
    calls.push(url.toString());
    return Promise.resolve({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: response.json ?? (() => ({})),
    } as Response);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("buildSearchParams", () => {
  it("omits absent filters entirely rather than sending empty values", () => {
    // `q=` would mean "match the empty string" to some APIs; "no filter" must
    // be the absence of the key.
    expect(buildSearchParams({}).toString()).toBe("");
    expect(buildSearchParams({ q: "   ", location: "" }).toString()).toBe("");
  });

  it("builds the documented query", () => {
    const s = buildSearchParams({ q: "LLM", workplace: "remote", limit: 5 });
    expect(s.get("q")).toBe("LLM");
    expect(s.get("workplace")).toBe("remote");
    expect(s.get("limit")).toBe("5");
  });

  it("escapes values so they cannot break out of their parameter", () => {
    const s = buildSearchParams({ q: "c++ & rust", company: "a b" });
    expect(s.get("q")).toBe("c++ & rust");
    expect(s.toString()).toContain("q=c%2B%2B+%26+rust");
  });

  it("joins tags into one comma-separated value, accepting a bare string", () => {
    expect(buildSearchParams({ tags: ["llm", "agents"] }).get("tags")).toBe("llm,agents");
    expect(buildSearchParams({ tags: "llm" }).get("tags")).toBe("llm");
  });

  it("clamps limit to 1..100 and page to >= 1", () => {
    expect(buildSearchParams({ limit: 5000 }).get("limit")).toBe("100");
    expect(buildSearchParams({ limit: 0 }).get("limit")).toBe("1");
    expect(buildSearchParams({ page: -3 }).get("page")).toBe("1");
  });

  it("sends global_remote=false but ignores a non-boolean", () => {
    // false is a real filter ("exclude global remote"), so it must survive the
    // falsy check that drops empty strings.
    expect(buildSearchParams({ global_remote: false }).get("global_remote")).toBe("false");
    expect(buildSearchParams({ global_remote: undefined }).has("global_remote")).toBe(false);
  });

  it("rejects NaN and Infinity instead of serialising them", () => {
    expect(buildSearchParams({ salary_min: NaN }).has("salary_min")).toBe(false);
    expect(buildSearchParams({ limit: Infinity }).has("limit")).toBe(false);
  });
});

describe("parseJobsPage", () => {
  it("parses a real row", () => {
    const page = parseJobsPage(envelope([REAL_JOB]));
    expect(page.jobs).toHaveLength(1);
    expect(page.jobs[0].title).toBe("Software Engineer II - Dev Accelerator");
    expect(page.jobs[0].salary_min).toBe(149200);
    expect(page.jobs[0].tags).toEqual(["llm", "api-design", "agents"]);
    expect(page.droppedCount).toBe(0);
  });

  it("treats an empty result as data, not an error", () => {
    const page = parseJobsPage(envelope([]));
    expect(page.jobs).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('accepts "jobs": null as zero results', () => {
    // Verified against the live API: a query matching nothing returns
    // `"jobs": null` with `total: 0`, not an empty array. Throwing on that
    // would turn every no-match search into a fake outage.
    const page = parseJobsPage({
      jobs: null,
      page: 1,
      per_page: 5,
      total: 0,
      total_pages: 1,
      has_next: false,
    });
    expect(page.jobs).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.droppedCount).toBe(0);
  });

  it("still rejects a non-array, non-null jobs field", () => {
    // The permissiveness above must not extend to a real schema break.
    expect(() => parseJobsPage({ jobs: "nope" })).toThrow(AiDevBoardResponseError);
    expect(() => parseJobsPage({ jobs: { 0: REAL_JOB } })).toThrow(AiDevBoardResponseError);
  });

  it("rejects a body with no jobs key at all, rather than reporting zero", () => {
    // `jobs: null` is an empty result; a missing key is a different endpoint.
    // Reporting "0 jobs" for the latter would hide an outage behind a
    // plausible-looking empty screen.
    expect(() => parseJobsPage({ results: [], total: 0 })).toThrow(AiDevBoardResponseError);
  });

  it("drops unusable rows but keeps the rest, and counts them", () => {
    // The point of the whole defensive layer: one bad row must not cost the
    // caller the good ones.
    const page = parseJobsPage(envelope([REAL_JOB, { id: "x" }, null, "nope", { title: "no id" }]));
    expect(page.jobs).toHaveLength(1);
    expect(page.droppedCount).toBe(4);
  });

  it("nulls missing optional fields rather than leaving them undefined", () => {
    const page = parseJobsPage(envelope([{ id: "1", title: "Bare" }]));
    const job = page.jobs[0];
    expect(job.salary_min).toBeNull();
    expect(job.company_name).toBeNull();
    expect(job.location).toBeNull();
    expect(job.tags).toEqual([]);
  });

  it("coerces wrong-typed fields to null instead of trusting them", () => {
    const page = parseJobsPage(
      envelope([{ ...REAL_JOB, salary_min: "149200", tags: "llm", quality_score: null }]),
    );
    expect(page.jobs[0].salary_min).toBeNull();
    expect(page.jobs[0].tags).toEqual([]);
    expect(page.jobs[0].quality_score).toBeNull();
  });

  it("derives pagination when the API omits it", () => {
    const page = parseJobsPage({ jobs: [REAL_JOB], per_page: 1, total: 10 });
    expect(page.totalPages).toBe(10);
    expect(page.hasNext).toBe(true);
  });

  it("throws on a malformed envelope", () => {
    expect(() => parseJobsPage(null)).toThrow(AiDevBoardResponseError);
    expect(() => parseJobsPage([REAL_JOB])).toThrow(AiDevBoardResponseError);
    expect(() => parseJobsPage("<html>502</html>")).toThrow(AiDevBoardResponseError);
  });
});

describe("getJobs", () => {
  it("calls the documented endpoint", async () => {
    const calls = stubFetch({ json: () => envelope([REAL_JOB]) });
    await getJobs({ q: "LLM", workplace: "remote", limit: 5 });
    expect(calls[0]).toBe("https://aidevboard.com/api/v1/jobs?q=LLM&workplace=remote&limit=5");
  });

  it("requests the bare endpoint when given no filters", async () => {
    const calls = stubFetch({ json: () => envelope([]) });
    await getJobs();
    expect(calls[0]).toBe("https://aidevboard.com/api/v1/jobs");
  });

  it("sends no Authorization header — the public API needs no key", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", (_u: unknown, init: RequestInit) => {
      seen.push(init);
      return Promise.resolve({ ok: true, status: 200, json: () => envelope([]) } as Response);
    });
    await getJobs({ q: "LLM" });
    expect(seen[0].headers).toEqual({ Accept: "application/json" });
  });

  it("maps status codes to distinguishable errors", async () => {
    stubFetch({ ok: false, status: 500 });
    await expect(getJobs()).rejects.toBeInstanceOf(AiDevBoardApiError);

    stubFetch({ ok: false, status: 429 });
    await expect(getJobs()).rejects.toBeInstanceOf(AiDevBoardRateLimitError);

    stubFetch({ ok: false, status: 401 });
    await expect(getJobs()).rejects.toBeInstanceOf(AiDevBoardAuthError);
  });

  it("wraps a network failure", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    await expect(getJobs()).rejects.toBeInstanceOf(AiDevBoardNetworkError);
  });

  it("reports a timeout as a network error naming the budget", async () => {
    vi.stubGlobal("fetch", () => {
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      return Promise.reject(e);
    });
    await expect(getJobs({}, { timeoutMs: 50 })).rejects.toThrow(/timed out after 50ms/);
  });

  it("raises a response error when a 200 body is not JSON", async () => {
    stubFetch({
      json: () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(getJobs()).rejects.toBeInstanceOf(AiDevBoardResponseError);
  });

  it("never leaks the query or a stack into the error message", async () => {
    // These messages reach a server log and, in a route handler, could reach a
    // client. They must carry no caller input.
    stubFetch({ ok: false, status: 503 });
    await expect(getJobs({ q: "secret-search-term" })).rejects.toThrow(
      "AI Dev Jobs API error (503).",
    );
  });
});

describe("normalizeJob", () => {
  const job = parseJobsPage(envelope([REAL_JOB])).jobs[0];
  const AT = "2026-08-27T10:00:00.000Z";

  it("maps onto the domain shape", () => {
    const n = normalizeJob(job, AT);
    expect(n.externalId).toBe(REAL_JOB.id);
    expect(n.title).toBe(REAL_JOB.title);
    expect(n.company?.name).toBe("Abnormal Security");
    expect(n.locationType).toBe("remote");
    expect(n.salaryMin).toBe(149200);
    expect(n.employmentType).toBe("full-time");
  });

  it("prefers the employer's apply_url over the board's own page", () => {
    expect(normalizeJob(job, AT).jobUrl).toBe(REAL_JOB.apply_url);
  });

  it("falls back to the board url when apply_url is missing", () => {
    const bare = { ...job, apply_url: null } as AiDevBoardJob;
    expect(normalizeJob(bare, AT).jobUrl).toBe(REAL_JOB.url);
  });

  it("leaves an unknown workplace null instead of guessing", () => {
    const odd = { ...job, workplace: "flexible" } as AiDevBoardJob;
    expect(normalizeJob(odd, AT).locationType).toBeNull();
  });

  it("never invents a salary currency", () => {
    expect(normalizeJob(job, AT).salaryCurrency).toBeNull();
  });

  it("retains the raw row for replay", () => {
    const n = normalizeJob(job, AT);
    expect(n.raw.externalId).toBe(REAL_JOB.id);
    expect(n.raw.fetchedAt).toBe(AT);
    expect(n.raw.payload).toBe(job);
  });

  it("keeps board-specific fields in extra rather than dropping them", () => {
    const n = normalizeJob(job, AT);
    expect(n.extra?.source).toBe("aidevboard");
    expect(n.extra?.tags).toEqual(["llm", "api-design", "agents"]);
    expect(n.extra?.experience_level).toBe("mid");
  });
});
