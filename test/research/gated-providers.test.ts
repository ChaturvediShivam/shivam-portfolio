import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  resetRateLimiter,
  __setBackoffBaseMs,
  __setRateLimitDisabled,
  ResearchApiError,
  ResearchAuthError,
  ResearchNetworkError,
  ResearchRateLimitError,
  ResearchResponseError,
  ResearchUnconfiguredError,
} from "@/lib/research/http";
import { adzunaProvider, __testing as adzuna } from "@/lib/research/providers/adzuna";
import { usaJobsProvider, __testing as usajobs } from "@/lib/research/providers/usajobs";
import { fredProvider, __testing as fred } from "@/lib/research/providers/fred";
import { gnewsProvider, __testing as gnews } from "@/lib/research/providers/gnews";

/**
 * Credential-gated research providers.
 *
 * Every one of these adapters is written against a PUBLISHED contract whose
 * success shape has not been observed live — no keys were available. That makes
 * two properties the most important things to test:
 *
 *   1. Without credentials the provider REFUSES to call. No request leaves the
 *      process, and the failure is a configuration error, not a mysterious 400.
 *   2. Every field is read defensively, so an unexpected shape degrades to
 *      nulls or a dropped row rather than a crash.
 *
 * No live third-party request is made here.
 */

const AT = "2026-08-27T12:00:00.000Z";

const ENV_KEYS = [
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "ADZUNA_COUNTRY",
  "USAJOBS_API_KEY",
  "USAJOBS_USER_AGENT",
  "FRED_API_KEY",
  "GNEWS_API_KEY",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  resetRateLimiter();
  __setBackoffBaseMs(1);
  __setRateLimitDisabled(true);
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function stubFetch(responses: Array<{ ok?: boolean; status?: number; json?: () => unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  vi.stubGlobal("fetch", (url: URL | string, init: RequestInit) => {
    calls.push({ url: url.toString(), init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return Promise.resolve({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: r.json ?? (() => ({})),
    } as Response);
  });
  return calls;
}

// --- The gate itself ---------------------------------------------------------

describe("credential gating", () => {
  const cases: Array<[string, { configured: boolean }, () => Promise<unknown>]> = [
    ["adzuna", adzunaProvider, () => adzunaProvider.searchJobs({ query: "x" })],
    ["usajobs", usaJobsProvider, () => usaJobsProvider.searchJobs({ query: "x" })],
    ["fred", fredProvider, () => fredProvider.getSeries("GDP")],
    ["gnews", gnewsProvider, () => gnewsProvider.searchNews("ai")],
  ];

  for (const [name, provider, call] of cases) {
    it(`${name}: reports unconfigured and makes no request without credentials`, async () => {
      const calls = stubFetch([{ json: () => ({}) }]);
      expect(provider.configured).toBe(false);
      await expect(call()).rejects.toBeInstanceOf(ResearchUnconfiguredError);
      // The whole point: "not configured" never becomes a network round-trip
      // that returns a confusing 400 the operator has to decode.
      expect(calls).toHaveLength(0);
    });
  }

  it("adzuna requires BOTH id and key, not either", () => {
    process.env.ADZUNA_APP_ID = "id";
    expect(adzunaProvider.configured).toBe(false);
    process.env.ADZUNA_APP_KEY = "key";
    expect(adzunaProvider.configured).toBe(true);
  });

  it("usajobs requires both the key and the registered contact address", () => {
    process.env.USAJOBS_API_KEY = "k";
    expect(usaJobsProvider.configured).toBe(false);
    process.env.USAJOBS_USER_AGENT = "dev@example.com";
    expect(usaJobsProvider.configured).toBe(true);
  });

  it("treats a blank-string credential as absent", () => {
    process.env.FRED_API_KEY = "   ";
    expect(fredProvider.configured).toBe(false);
  });
});

// --- Adzuna ------------------------------------------------------------------

const ADZUNA_ROW = {
  id: "4123",
  title: "AI Engineer",
  description: "Build LLM features.",
  created: "2026-08-20T10:00:00Z",
  redirect_url: "https://www.adzuna.com/land/ad/4123",
  company: { display_name: "Acme AI" },
  location: { display_name: "New York, NY" },
  category: { label: "IT Jobs" },
  salary_min: 150000,
  salary_max: 200000,
  salary_is_predicted: "0",
  contract_time: "full_time",
};

describe("adzuna", () => {
  beforeEach(() => {
    process.env.ADZUNA_APP_ID = "id";
    process.env.ADZUNA_APP_KEY = "key";
  });

  it("normalizes a documented row", () => {
    const job = adzuna.normalize(ADZUNA_ROW, AT);
    expect(job?.title).toBe("AI Engineer");
    expect(job?.company).toBe("Acme AI");
    expect(job?.location).toBe("New York, NY");
    expect(job?.salaryMin).toBe(150000);
    expect(job?.provenance.publishedAt).toBe("2026-08-20T10:00:00.000Z");
  });

  it("labels a PREDICTED salary instead of presenting it as stated", () => {
    // salary_is_predicted="1" means Adzuna's model, not the employer.
    const job = adzuna.normalize({ ...ADZUNA_ROW, salary_is_predicted: "1" }, AT);
    expect(job?.salaryMin).toBeNull();
    expect(job?.salaryText).toContain("estimated");
  });

  it("never asserts a workplace Adzuna does not publish", () => {
    // A remote-sounding title is not a remote role.
    expect(adzuna.normalize({ ...ADZUNA_ROW, title: "Remote AI Engineer" }, AT)?.workplace).toBe(
      "unknown",
    );
  });

  it("handles missing nested objects without throwing", () => {
    const job = adzuna.normalize({ id: "1", title: "T" }, AT);
    expect(job?.company).toBeNull();
    expect(job?.location).toBeNull();
    expect(job?.salaryMin).toBeNull();
    expect(job?.tags).toEqual([]);
  });

  it("drops a row with no id or no title", () => {
    expect(adzuna.normalize({ title: "T" }, AT)).toBeNull();
    expect(adzuna.normalize({ id: "1" }, AT)).toBeNull();
    expect(adzuna.normalize("nope", AT)).toBeNull();
  });

  it("sends credentials and paginates by path segment", async () => {
    const calls = stubFetch([{ json: () => ({ results: [ADZUNA_ROW] }) }]);
    await adzunaProvider.searchJobs({ query: "ai", limit: 5, page: 2 });
    expect(calls[0].url).toContain("/jobs/us/search/2");
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("app_id")).toBe("id");
    expect(url.searchParams.get("results_per_page")).toBe("5");
  });

  it("honours ADZUNA_COUNTRY", async () => {
    process.env.ADZUNA_COUNTRY = "gb";
    const calls = stubFetch([{ json: () => ({ results: [] }) }]);
    await adzunaProvider.searchJobs({});
    expect(calls[0].url).toContain("/jobs/gb/search/1");
  });

  it("returns an empty array for an empty result set", async () => {
    stubFetch([{ json: () => ({ results: [] }) }]);
    expect(await adzunaProvider.searchJobs({ query: "x" })).toEqual([]);
  });

  it("throws on a malformed envelope", async () => {
    stubFetch([{ json: () => ({ jobs: [] }) }]);
    await expect(adzunaProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchResponseError);
  });

  it("keeps good rows when one is malformed", async () => {
    stubFetch([{ json: () => ({ results: [ADZUNA_ROW, null, { junk: 1 }] }) }]);
    expect(await adzunaProvider.searchJobs({})).toHaveLength(1);
  });

  it("surfaces auth, rate-limit and server errors distinctly", async () => {
    stubFetch([{ ok: false, status: 403 }]);
    await expect(adzunaProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchAuthError);

    stubFetch([{ ok: false, status: 429 }]);
    await expect(adzunaProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchRateLimitError);

    stubFetch([{ ok: false, status: 500 }]);
    await expect(adzunaProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchApiError);
  });

  it("bounds retries on a persistent 503", async () => {
    const calls = stubFetch([{ ok: false, status: 503 }]);
    await expect(adzunaProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchApiError);
    expect(calls).toHaveLength(3);
  });

  it("propagates a timeout as a network error", async () => {
    vi.stubGlobal("fetch", () => {
      const e = new Error("t");
      e.name = "TimeoutError";
      return Promise.reject(e);
    });
    await expect(adzunaProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchNetworkError);
  });

  it("stops immediately when the caller cancels", async () => {
    const controller = new AbortController();
    controller.abort();
    let n = 0;
    vi.stubGlobal("fetch", () => {
      n += 1;
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(adzunaProvider.searchJobs({}, controller.signal)).rejects.toThrow(/cancelled/);
    expect(n).toBe(1);
  });
});

// --- USAJOBS -----------------------------------------------------------------

const USAJOBS_ITEM = {
  MatchedObjectId: "830216800",
  MatchedObjectDescriptor: {
    PositionID: "ST-12345",
    PositionTitle: "Operations Research Analyst",
    PositionURI: "https://www.usajobs.gov/job/830216800",
    ApplyURI: ["https://www.usajobs.gov/job/830216800/apply"],
    OrganizationName: "Bureau of Labor Statistics",
    DepartmentName: "Department of Labor",
    PositionLocation: [{ LocationName: "Washington, DC" }],
    PositionSchedule: [{ Name: "Full-Time" }],
    JobCategory: [{ Name: "Operations Research" }],
    PublicationStartDate: "2026-08-01",
    RemoteIndicator: true,
    QualificationSummary: "Experience in quantitative analysis.",
    PositionRemuneration: [{ MinimumRange: "99000", MaximumRange: "128000", RateIntervalCode: "PA" }],
    UserArea: { Details: { LowGrade: "12", JobSummary: "Analyse labour data." } },
  },
};

describe("usajobs", () => {
  beforeEach(() => {
    process.env.USAJOBS_API_KEY = "k";
    process.env.USAJOBS_USER_AGENT = "dev@example.com";
  });

  it("normalizes the deeply nested descriptor", () => {
    const job = usajobs.normalize(USAJOBS_ITEM, AT);
    expect(job?.title).toBe("Operations Research Analyst");
    expect(job?.company).toBe("Bureau of Labor Statistics");
    expect(job?.location).toBe("Washington, DC");
    expect(job?.workplace).toBe("remote");
    expect(job?.employmentType).toBe("Full-Time");
  });

  it("parses pay from numeric strings and keeps the rate interval", () => {
    // A federal band is meaningless without knowing it is per annum.
    const job = usajobs.normalize(USAJOBS_ITEM, AT);
    expect(job?.salaryMin).toBe(99000);
    expect(job?.salaryMax).toBe(128000);
    expect(job?.salaryText).toContain("PA");
  });

  it("treats an absent RemoteIndicator as unknown, not onsite", () => {
    const descriptor = { ...USAJOBS_ITEM.MatchedObjectDescriptor };
    delete (descriptor as Record<string, unknown>).RemoteIndicator;
    expect(usajobs.normalize({ ...USAJOBS_ITEM, MatchedObjectDescriptor: descriptor }, AT)?.workplace).toBe(
      "unknown",
    );
  });

  it("drops an item with no descriptor or no title", () => {
    expect(usajobs.normalize({ MatchedObjectId: "1" }, AT)).toBeNull();
    expect(usajobs.normalize({ MatchedObjectDescriptor: { PositionID: "x" } }, AT)).toBeNull();
  });

  it("survives missing pay, locations and UserArea", () => {
    const job = usajobs.normalize(
      { MatchedObjectId: "1", MatchedObjectDescriptor: { PositionTitle: "T" } },
      AT,
    );
    expect(job?.salaryMin).toBeNull();
    expect(job?.location).toBeNull();
    expect(job?.experienceLevel).toBeNull();
  });

  it("sends the key in a header, never in the query string", async () => {
    // A URL carrying a credential ends up in logs, proxies and history.
    const calls = stubFetch([{ json: () => ({ SearchResult: { SearchResultItems: [] } }) }]);
    await usaJobsProvider.searchJobs({ query: "analyst" });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization-Key"]).toBe("k");
    expect(calls[0].url).not.toContain("k");
    expect(new URL(calls[0].url).searchParams.get("Keyword")).toBe("analyst");
  });

  it("throws on a malformed envelope", async () => {
    stubFetch([{ json: () => ({ results: [] }) }]);
    await expect(usaJobsProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchResponseError);
  });

  it("maps a 403 to an auth error", async () => {
    stubFetch([{ ok: false, status: 403 }]);
    await expect(usaJobsProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchAuthError);
  });
});

// --- FRED --------------------------------------------------------------------

describe("fred", () => {
  beforeEach(() => {
    process.env.FRED_API_KEY = "k";
  });

  it('treats FRED\'s "." placeholder as null, never as zero', () => {
    // Coercing "." to 0 would put a fabricated data point on a chart.
    expect(fred.toObservation({ date: "2026-01-01", value: "." })?.value).toBeNull();
    expect(fred.toObservation({ date: "2026-01-01", value: "0" })?.value).toBe(0);
    expect(fred.toObservation({ date: "2026-01-01", value: "27000.5" })?.value).toBe(27000.5);
  });

  it("drops an observation with no date", () => {
    expect(fred.toObservation({ value: "1" })).toBeNull();
    expect(fred.toObservation(null)).toBeNull();
  });

  it("returns a normalized series with provenance", async () => {
    stubFetch([
      { json: () => ({ observations: [{ date: "2026-06-01", value: "29000" }] }) },
      { json: () => ({ seriess: [{ title: "Gross Domestic Product", units: "Billions", frequency: "Quarterly" }] }) },
    ]);
    const series = await fredProvider.getSeries("GDP", 5);
    expect(series?.seriesId).toBe("GDP");
    expect(series?.title).toBe("Gross Domestic Product");
    expect(series?.observations).toHaveLength(1);
    expect(series?.provenance.sourceUrl).toBe("https://fred.stlouisfed.org/series/GDP");
  });

  it("still returns observations when metadata is unavailable", async () => {
    stubFetch([
      { json: () => ({ observations: [{ date: "2026-06-01", value: "1" }] }) },
      { json: () => ({}) },
    ]);
    const series = await fredProvider.getSeries("GDP");
    expect(series?.title).toBeNull();
    expect(series?.observations).toHaveLength(1);
  });

  it("returns null for an empty series id without calling the API", async () => {
    const calls = stubFetch([{ json: () => ({}) }]);
    expect(await fredProvider.getSeries("  ")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("handles an empty observation set", async () => {
    stubFetch([{ json: () => ({ observations: [] }) }, { json: () => ({ seriess: [] }) }]);
    const series = await fredProvider.getSeries("GDP");
    expect(series?.observations).toEqual([]);
    expect(series?.provenance.publishedAt).toBeNull();
  });

  it("throws on a malformed envelope", async () => {
    stubFetch([{ json: () => ({ data: [] }) }]);
    await expect(fredProvider.getSeries("GDP")).rejects.toBeInstanceOf(ResearchResponseError);
  });
});

// --- GNews -------------------------------------------------------------------

const GNEWS_ARTICLE = {
  title: "Chipmaker posts record quarter",
  description: "Revenue rose sharply.",
  url: "https://example.com/article",
  image: "https://example.com/a.jpg",
  publishedAt: "2026-08-25T09:00:00Z",
  source: { name: "Reuters", url: "https://reuters.com" },
};

describe("gnews", () => {
  beforeEach(() => {
    process.env.GNEWS_API_KEY = "k";
  });

  it("attributes the originating outlet from the nested source object", () => {
    const item = gnews.normalize(GNEWS_ARTICLE, AT);
    expect(item?.source).toBe("Reuters");
    expect(item?.provenance.publishedAt).toBe("2026-08-25T09:00:00.000Z");
  });

  it("asserts no category, because the search endpoint returns none", () => {
    expect(gnews.normalize(GNEWS_ARTICLE, AT)?.category).toBeNull();
  });

  it("drops an article with no title or no url", () => {
    expect(gnews.normalize({ ...GNEWS_ARTICLE, title: "" }, AT)).toBeNull();
    expect(gnews.normalize({ ...GNEWS_ARTICLE, url: null }, AT)).toBeNull();
  });

  it("survives a missing source object", () => {
    expect(gnews.normalize({ ...GNEWS_ARTICLE, source: null }, AT)?.source).toBeNull();
  });

  it("deduplicates repeated urls", async () => {
    stubFetch([{ json: () => ({ articles: [GNEWS_ARTICLE, { ...GNEWS_ARTICLE }] }) }]);
    expect(await gnewsProvider.searchNews("chip")).toHaveLength(1);
  });

  it("refuses an empty query without spending quota", async () => {
    const calls = stubFetch([{ json: () => ({ articles: [] }) }]);
    expect(await gnewsProvider.searchNews("  ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("throws on a malformed envelope", async () => {
    stubFetch([{ json: () => ({ errors: ["bad"] }) }]);
    await expect(gnewsProvider.searchNews("ai")).rejects.toBeInstanceOf(ResearchResponseError);
  });

  it("handles an empty article list", async () => {
    stubFetch([{ json: () => ({ articles: [] }) }]);
    expect(await gnewsProvider.searchNews("ai")).toEqual([]);
  });
});
