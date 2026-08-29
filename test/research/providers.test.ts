import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  fetchJson,
  isoDate,
  num,
  resetRateLimiter,
  __setBackoffBaseMs,
  ResearchApiError,
  ResearchAuthError,
  ResearchNetworkError,
  ResearchRateLimitError,
  ResearchResponseError,
  ResearchUnconfiguredError,
} from "@/lib/research/http";
import { aiJobsCoProvider, __testing as aiJobs } from "@/lib/research/providers/ai-jobs-co";
import { noozraProvider, __testing as noozra } from "@/lib/research/providers/noozra";
import { secEdgarProvider, __testing as sec } from "@/lib/research/providers/sec-edgar";
import { __testing as aiDev } from "@/lib/research/providers/ai-dev-jobs";
import { jobToApplication } from "@/lib/research/bridge";
import type { NormalizedJob } from "@/lib/research/types";

/**
 * Research providers.
 *
 * No live third-party call happens here. `fetch` is stubbed, so these suites
 * assert OUR behaviour: query construction, defensive normalization, the error
 * taxonomy, and the deduplication rules.
 *
 * The fixtures are copied from real responses captured with curl before the
 * adapters were written — which is why they include the awkward parts (a
 * `salary` that is display text, `filings.recent` as parallel arrays) rather
 * than an idealised shape.
 */

const AT = "2026-08-27T12:00:00.000Z";

beforeEach(() => {
  resetRateLimiter();
  // Retries are asserted for boundedness, not for wall-clock duration; real
  // backoff would add seconds to every run for no extra confidence.
  __setBackoffBaseMs(1);
});
afterEach(() => vi.unstubAllGlobals());

/** Stub fetch with a queue of responses; records the URLs requested. */
function stubFetch(responses: Array<{ ok?: boolean; status?: number; json?: () => unknown }>) {
  const calls: string[] = [];
  let i = 0;
  vi.stubGlobal("fetch", (url: URL | string) => {
    calls.push(url.toString());
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

// --- Shared transport --------------------------------------------------------

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    stubFetch([{ json: () => ({ ok: 1 }) }]);
    expect(await fetchJson({ provider: "p", url: "https://x.test/a" })).toEqual({ ok: 1 });
  });

  it("maps status codes to distinguishable errors", async () => {
    stubFetch([{ ok: false, status: 403 }]);
    await expect(fetchJson({ provider: "p", url: "https://x.test/a" })).rejects.toBeInstanceOf(
      ResearchAuthError,
    );

    stubFetch([{ ok: false, status: 404 }]);
    await expect(fetchJson({ provider: "p", url: "https://x.test/a" })).rejects.toBeInstanceOf(
      ResearchApiError,
    );
  });

  it("retries a transient 503 and succeeds", async () => {
    const calls = stubFetch([{ ok: false, status: 503 }, { json: () => ({ ok: 1 }) }]);
    expect(await fetchJson({ provider: "p", url: "https://x.test/a" })).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });

  it("gives up after a bounded number of attempts, never looping forever", async () => {
    const calls = stubFetch([{ ok: false, status: 503 }]);
    await expect(fetchJson({ provider: "p", url: "https://x.test/a" })).rejects.toBeInstanceOf(
      ResearchApiError,
    );
    expect(calls).toHaveLength(3);
  });

  it("surfaces a rate limit after exhausting retries", async () => {
    stubFetch([{ ok: false, status: 429 }]);
    await expect(fetchJson({ provider: "p", url: "https://x.test/a" })).rejects.toBeInstanceOf(
      ResearchRateLimitError,
    );
  });

  it("does not retry a 200 that is not JSON", async () => {
    const calls = stubFetch([
      {
        json: () => {
          throw new SyntaxError("<html>");
        },
      },
    ]);
    await expect(fetchJson({ provider: "p", url: "https://x.test/a" })).rejects.toBeInstanceOf(
      ResearchResponseError,
    );
    expect(calls).toHaveLength(1);
  });

  it("wraps a network failure and retries it", async () => {
    let n = 0;
    vi.stubGlobal("fetch", () => {
      n += 1;
      return Promise.reject(new TypeError("fetch failed"));
    });
    await expect(fetchJson({ provider: "p", url: "https://x.test/a" })).rejects.toBeInstanceOf(
      ResearchNetworkError,
    );
    expect(n).toBe(3);
  });

  it("does not retry a caller-initiated cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    let n = 0;
    vi.stubGlobal("fetch", () => {
      n += 1;
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(
      fetchJson({ provider: "p", url: "https://x.test/a", signal: controller.signal }),
    ).rejects.toThrow(/cancelled/);
    expect(n).toBe(1);
  });

  it("reports a timeout naming the budget", async () => {
    vi.stubGlobal("fetch", () => {
      const e = new Error("timeout");
      e.name = "TimeoutError";
      return Promise.reject(e);
    });
    await expect(
      fetchJson({ provider: "p", url: "https://x.test/a", timeoutMs: 40 }),
    ).rejects.toThrow(/timed out after 40ms/);
  });
});

describe("isoDate", () => {
  it("normalizes epoch seconds, ISO strings and bare dates", () => {
    expect(isoDate(1787812269)).toBe("2026-08-27T06:31:09.000Z");
    expect(isoDate("2026-08-11T18:03:48Z")).toBe("2026-08-11T18:03:48.000Z");
    expect(isoDate("2026-08-20")).toBe("2026-08-20T00:00:00.000Z");
  });

  it("returns null for unparseable input rather than an Invalid Date", () => {
    // A wrong timestamp on an evidence record is worse than a missing one.
    expect(isoDate("not a date")).toBeNull();
    expect(isoDate(null)).toBeNull();
    expect(isoDate(NaN)).toBeNull();
  });

  it("accepts numeric strings in num()", () => {
    expect(num("42")).toBe(42);
    expect(num("abc")).toBeNull();
  });
});

// --- Artificial Intelligence Jobs -------------------------------------------

const AI_JOB_ROW = {
  title: "Manager, Applied AI Engineering",
  company: "OpenAI",
  location: "San Francisco, CA",
  remote: true,
  category: "Engineering",
  level: "Lead+",
  region: "US",
  salary: "$251K – $335K • Offers Equity",
  posted: "2026-08-27",
  url: "https://artificialintelligencejobs.co/jobs/openai-manager",
  apply_url: "https://jobs.ashbyhq.com/openai/123",
};

describe("ai_jobs_co", () => {
  it("normalizes a real row", () => {
    const job = aiJobs.normalize(AI_JOB_ROW, AT);
    expect(job?.title).toBe("Manager, Applied AI Engineering");
    expect(job?.company).toBe("OpenAI");
    expect(job?.workplace).toBe("remote");
    expect(job?.applyUrl).toBe("https://jobs.ashbyhq.com/openai/123");
    expect(job?.provenance.publishedAt).toBe("2026-08-27T00:00:00.000Z");
  });

  it("keeps display-text salary verbatim and invents no numbers", () => {
    // Parsing "$251K – $335K • Offers Equity" into 251000 would manufacture
    // precision the source never gave.
    const job = aiJobs.normalize(AI_JOB_ROW, AT);
    expect(job?.salaryText).toBe("$251K – $335K • Offers Equity");
    expect(job?.salaryMin).toBeNull();
    expect(job?.salaryMax).toBeNull();
  });

  it("reports a non-remote posting as unknown, not onsite", () => {
    // Their boolean cannot distinguish hybrid from onsite.
    expect(aiJobs.normalize({ ...AI_JOB_ROW, remote: false }, AT)?.workplace).toBe("unknown");
  });

  it("handles missing optional fields", () => {
    const job = aiJobs.normalize({ title: "T", url: "https://x.test/j" }, AT);
    expect(job?.company).toBeNull();
    expect(job?.salaryText).toBeNull();
    expect(job?.tags).toEqual([]);
  });

  it("drops a row with no title or no url", () => {
    expect(aiJobs.normalize({ title: "T" }, AT)).toBeNull();
    expect(aiJobs.normalize({ url: "https://x.test/j" }, AT)).toBeNull();
    expect(aiJobs.normalize(null, AT)).toBeNull();
  });

  it("builds the documented query and paginates by offset", async () => {
    const calls = stubFetch([{ json: () => ({ jobs: [AI_JOB_ROW] }) }]);
    await aiJobsCoProvider.searchJobs({ query: "AI engineer", remoteOnly: true, limit: 10, page: 3 });
    const url = new URL(calls[0]);
    expect(url.searchParams.get("q")).toBe("AI engineer");
    expect(url.searchParams.get("remote")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("20");
  });

  it("omits absent filters entirely", async () => {
    const calls = stubFetch([{ json: () => ({ jobs: [] }) }]);
    await aiJobsCoProvider.searchJobs({});
    const url = new URL(calls[0]);
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("remote")).toBe(false);
  });

  it("keeps good rows when one is malformed", async () => {
    stubFetch([{ json: () => ({ jobs: [AI_JOB_ROW, { junk: 1 }, null] }) }]);
    expect(await aiJobsCoProvider.searchJobs({})).toHaveLength(1);
  });

  it("returns an empty array for an empty result", async () => {
    stubFetch([{ json: () => ({ jobs: [] }) }]);
    expect(await aiJobsCoProvider.searchJobs({ query: "x" })).toEqual([]);
  });

  it("throws on a malformed envelope", async () => {
    stubFetch([{ json: () => ({ results: [] }) }]);
    await expect(aiJobsCoProvider.searchJobs({})).rejects.toBeInstanceOf(ResearchResponseError);
  });
});

// --- Noozra ------------------------------------------------------------------

const ARTICLE = {
  id: "dc787065-7e51-4645-896f-0484b9bc14da",
  headline: "The Difference Between AI and Artificial Intelligence",
  url: "https://aibusiness.com/ai-ethics/the-difference",
  published_at: "2026-08-11T18:03:48Z",
  source: "AI Business",
  category: "ai",
  image_url: "https://img.test/a.jpg",
  description: "Intelligence involves imagination and emotions.",
};

describe("noozra", () => {
  it("attributes the originating outlet, not the aggregator", () => {
    // A brief citing "Noozra" instead of the outlet is not evidence.
    const item = noozra.normalize(ARTICLE, AT);
    expect(item?.source).toBe("AI Business");
    expect(item?.provenance.provider).toBe("noozra");
    expect(item?.provenance.sourceUrl).toBe(ARTICLE.url);
    expect(item?.provenance.publishedAt).toBe("2026-08-11T18:03:48.000Z");
  });

  it("drops an article with no headline or no url", () => {
    expect(noozra.normalize({ ...ARTICLE, headline: "  " }, AT)).toBeNull();
    expect(noozra.normalize({ ...ARTICLE, url: null }, AT)).toBeNull();
  });

  it("falls back to the url when the source gives no id", () => {
    expect(noozra.normalize({ ...ARTICLE, id: null }, AT)?.provenance.externalId).toBe(ARTICLE.url);
  });

  it("deduplicates syndicated articles by url", async () => {
    stubFetch([{ json: () => ({ articles: [ARTICLE, { ...ARTICLE, id: "other" }] }) }]);
    expect(await noozraProvider.searchNews("ai")).toHaveLength(1);
  });

  it("refuses an empty query without calling the API", async () => {
    const calls = stubFetch([{ json: () => ({ articles: [] }) }]);
    expect(await noozraProvider.searchNews("   ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("throws on a malformed envelope", async () => {
    stubFetch([{ json: () => ({ items: [] }) }]);
    await expect(noozraProvider.searchNews("ai")).rejects.toBeInstanceOf(ResearchResponseError);
  });
});

// --- SEC EDGAR ---------------------------------------------------------------

describe("sec_edgar", () => {
  const OLD_UA = process.env.SEC_EDGAR_USER_AGENT;
  afterEach(() => {
    if (OLD_UA === undefined) delete process.env.SEC_EDGAR_USER_AGENT;
    else process.env.SEC_EDGAR_USER_AGENT = OLD_UA;
  });

  it("refuses to call the SEC without a configured contact User-Agent", async () => {
    // Verified against the live API: a blank User-Agent is answered with 403.
    // Sending a fabricated contact to a regulator is not an acceptable default.
    delete process.env.SEC_EDGAR_USER_AGENT;
    const calls = stubFetch([{ json: () => ({}) }]);
    await expect(secEdgarProvider.getCompany("320193")).rejects.toBeInstanceOf(
      ResearchUnconfiguredError,
    );
    expect(calls).toHaveLength(0);
    expect(secEdgarProvider.configured).toBe(false);
  });

  it("reports itself configured once the User-Agent is set", () => {
    process.env.SEC_EDGAR_USER_AGENT = "CareerCRM/1.0 (dev@example.com)";
    expect(secEdgarProvider.configured).toBe(true);
  });

  it("zero-pads a CIK to EDGAR's 10-digit form", () => {
    expect(sec.padCik("320193")).toBe("0000320193");
    expect(sec.padCik(1045810)).toBe("0001045810");
    expect(sec.padCik("CIK0000320193")).toBe("0000320193");
  });

  it("zips column-oriented filings into records", () => {
    // filings.recent is parallel arrays, not an array of objects.
    const filings = sec.zipFilings(
      {
        form: ["10-K", "8-K"],
        filingDate: ["2026-08-20", "2026-07-01"],
        reportDate: ["2026-06-30", ""],
        accessionNumber: ["0000320193-26-000001", "0000320193-26-000002"],
        primaryDocument: ["aapl-10k.htm", "aapl-8k.htm"],
      },
      "0000320193",
    );
    expect(filings).toHaveLength(2);
    expect(filings[0].form).toBe("10-K");
    expect(filings[0].documentUrl).toContain("/Archives/edgar/data/320193/000032019326000001/aapl-10k.htm");
    expect(filings[1].reportDate).toBeNull();
  });

  it("truncates to the shortest column so a filing cannot take another's date", () => {
    const filings = sec.zipFilings(
      { form: ["10-K", "8-K", "4"], filingDate: ["2026-08-20"], accessionNumber: ["a-1", "a-2"] },
      "0000320193",
    );
    expect(filings).toHaveLength(1);
  });

  it("returns no filings for a malformed block rather than throwing", () => {
    expect(sec.zipFilings(null, "0000320193")).toEqual([]);
    expect(sec.zipFilings({ form: "10-K" }, "0000320193")).toEqual([]);
  });

  it("ranks an exact ticker match above a name substring match", async () => {
    process.env.SEC_EDGAR_USER_AGENT = "CareerCRM/1.0 (dev@example.com)";
    stubFetch([
      {
        json: () => ({
          "0": { cik_str: 1, ticker: "ABCD", title: "Some Apple Supplier Inc" },
          "1": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
        }),
      },
    ]);
    const refs = await secEdgarProvider.findCompanies("aapl");
    expect(refs[0].name).toBe("Apple Inc.");
    expect(refs[0].ref).toBe("0000320193");
  });

  it("returns no candidates for an empty query without calling the API", async () => {
    process.env.SEC_EDGAR_USER_AGENT = "CareerCRM/1.0 (dev@example.com)";
    const calls = stubFetch([{ json: () => ({}) }]);
    expect(await secEdgarProvider.findCompanies("  ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("treats a 404 concept as 'not reported', not an error", async () => {
    // Many registrants file RevenueFromContractWithCustomer… rather than Revenues.
    process.env.SEC_EDGAR_USER_AGENT = "CareerCRM/1.0 (dev@example.com)";
    stubFetch([{ ok: false, status: 404 }]);
    expect(await secEdgarProvider.getFinancials("320193", ["Revenues"])).toEqual([]);
  });

  it("normalizes XBRL facts newest-first and keeps the reporting filing", async () => {
    process.env.SEC_EDGAR_USER_AGENT = "CareerCRM/1.0 (dev@example.com)";
    stubFetch([
      {
        json: () => ({
          label: "Revenues",
          units: {
            USD: [
              { val: 1, end: "2024-09-28", fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
              { val: 2, end: "2026-06-30", fy: 2026, fp: "Q3", form: "10-Q", filed: "2026-08-01" },
              { val: null, end: "2023-09-30" },
            ],
          },
        }),
      },
    ]);
    const facts = await secEdgarProvider.getFinancials("320193", ["Revenues"]);
    expect(facts).toHaveLength(2);
    expect(facts[0].periodEnd).toBe("2026-06-30T00:00:00.000Z");
    expect(facts[0].form).toBe("10-Q");
    expect(facts[0].unit).toBe("USD");
  });
});

// --- AI Dev Jobs adapter (Phase 1 wrapped, not modified) ---------------------

describe("aidevboard adapter", () => {
  it("maps integer salary bounds and leaves salaryText null", () => {
    // The asymmetry with ai_jobs_co is the point: each provider reports only
    // what its source actually gave.
    const job = aiDev.normalize(
      {
        id: "a583cfdf",
        title: "AI Application Engineer",
        slug: "s",
        url: "https://aidevboard.com/job/a583cfdf",
        apply_url: "https://example.com/apply",
        description: "d",
        tags: ["llm"],
        company_id: null,
        company_name: "Example AI",
        company_slug: null,
        company_logo_url: null,
        location: "Remote (US)",
        workplace: "remote",
        remote_scope: "restricted",
        job_type: "full-time",
        experience_level: "mid",
        salary_min: 150000,
        salary_max: 200000,
        published_at: "2026-08-25T18:54:00Z",
        expires_at: null,
        quality_score: 90,
        status: "active",
      },
      AT,
    );
    expect(job.salaryMin).toBe(150000);
    expect(job.salaryText).toBeNull();
    expect(job.workplace).toBe("remote");
    expect(job.provenance.provider).toBe("aidevboard");
  });
});

// --- Bridge ------------------------------------------------------------------

describe("jobToApplication", () => {
  const job: NormalizedJob = {
    provenance: {
      provider: "ai_jobs_co",
      externalId: "https://x.test/j",
      sourceUrl: "https://x.test/j",
      retrievedAt: AT,
      publishedAt: "2026-08-27T00:00:00.000Z",
    },
    title: "AI Application Engineer",
    company: "OpenAI",
    location: "SF",
    workplace: "remote",
    description: "d",
    applyUrl: "https://apply.test/1",
    tags: ["llm"],
    experienceLevel: "Mid",
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryText: "$251K – $335K",
  };

  it("maps onto the existing ingestion contract", () => {
    const app = jobToApplication(job);
    expect(app.title).toBe("AI Application Engineer");
    expect(app.company?.name).toBe("OpenAI");
    expect(app.locationType).toBe("remote");
    expect(app.jobUrl).toBe("https://apply.test/1");
    expect(app.raw.fetchedAt).toBe(AT);
  });

  it("asserts no stage and no applied date", () => {
    // Bridging records interest, not an application; a research action must not
    // silently advance a pipeline the human has not moved.
    const app = jobToApplication(job);
    expect(app.stageHint ?? null).toBeNull();
    expect(app.appliedAt ?? null).toBeNull();
  });

  it("maps an unknown workplace to null rather than guessing", () => {
    expect(jobToApplication({ ...job, workplace: "unknown" }).locationType).toBeNull();
  });

  it("never invents a salary currency", () => {
    expect(jobToApplication(job).salaryCurrency).toBeNull();
  });

  it("preserves provenance and display-text salary in extra", () => {
    const app = jobToApplication(job);
    expect(app.extra?.researchProvider).toBe("ai_jobs_co");
    expect(app.extra?.salaryText).toBe("$251K – $335K");
    expect(app.extra?.sourceUrl).toBe("https://x.test/j");
  });
});

describe("isoDate — timezone handling", () => {
  it("treats a zoneless datetime as UTC, not local", () => {
    // USAJOBS publishes "2026-08-19T11:03:40.7670" with no suffix. Parsing it
    // as local time shifts it by the host offset and can move a posting onto
    // the wrong calendar day.
    expect(isoDate("2026-08-19T11:03:40.7670")).toBe("2026-08-19T11:03:40.767Z");
    expect(isoDate("2026-08-19T11:03:40")).toBe("2026-08-19T11:03:40.000Z");
    expect(isoDate("2026-08-19T11:03")).toBe("2026-08-19T11:03:00.000Z");
  });

  it("leaves an explicit timezone untouched", () => {
    expect(isoDate("2026-08-29T00:40:02Z")).toBe("2026-08-29T00:40:02.000Z");
    expect(isoDate("2026-08-01T09:30:00-04:00")).toBe("2026-08-01T13:30:00.000Z");
  });

  it("still parses date-only and epoch values as before", () => {
    expect(isoDate("2026-08-19")).toBe("2026-08-19T00:00:00.000Z");
    expect(isoDate(1787812269)).toBe("2026-08-27T06:31:09.000Z");
  });
});
