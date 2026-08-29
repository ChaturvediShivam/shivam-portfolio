import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { JobProvider, NewsProvider, NormalizedJob } from "@/lib/research/types";

/**
 * Cross-provider search.
 *
 * The registry is mocked so these suites test the merge rules — partial
 * failure, deduplication, ordering — without depending on which feature flags
 * happen to be set in the environment running the tests.
 */

const { listJobProviders, listNewsProviders, listUnavailableOfKind } = vi.hoisted(() => ({
  listJobProviders: vi.fn(),
  listNewsProviders: vi.fn(),
  listUnavailableOfKind: vi.fn(() => []),
}));

vi.mock("@/lib/research/registry", () => ({
  listJobProviders,
  listNewsProviders,
  listUnavailableOfKind,
}));

const { searchJobsAcrossProviders, searchNewsAcrossProviders, didNotRun } = await import(
  "@/lib/research/search"
);

afterEach(() => vi.restoreAllMocks());

beforeEach(() => listUnavailableOfKind.mockReturnValue([]));

function job(over: Partial<NormalizedJob> & { title: string }): NormalizedJob {
  return {
    provenance: {
      provider: "ai_jobs_co",
      externalId: over.title,
      sourceUrl: `https://x.test/${over.title}`,
      retrievedAt: "2026-08-27T12:00:00.000Z",
      publishedAt: "2026-08-01T00:00:00.000Z",
    },
    company: "Acme",
    location: null,
    workplace: "remote",
    description: null,
    applyUrl: null,
    tags: [],
    experienceLevel: null,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryText: null,
    ...over,
  };
}

function jobProvider(id: string, impl: () => Promise<NormalizedJob[]>): JobProvider {
  return {
    kind: "job",
    id: id as JobProvider["id"],
    displayName: id,
    configured: true,
    rateLimitPerSecond: 5,
    searchJobs: impl,
  };
}

describe("searchJobsAcrossProviders", () => {
  it("returns an empty outcome when no provider is available", async () => {
    listJobProviders.mockReturnValue([]);
    const outcome = await searchJobsAcrossProviders({});
    expect(outcome.results).toEqual([]);
    expect(outcome.failed).toEqual([]);
  });

  it("reports WHY nothing ran rather than implying the market is empty", async () => {
    // The distinction the standing instruction requires: an unconfigured
    // provider must never be indistinguishable from one that found nothing.
    listJobProviders.mockReturnValue([]);
    listUnavailableOfKind.mockReturnValue([
      {
        provider: "adzuna",
        displayName: "Adzuna",
        reason: "unconfigured",
        remedy: "Set ADZUNA_APP_ID + ADZUNA_APP_KEY",
      },
    ]);
    const outcome = await searchJobsAcrossProviders({});
    expect(outcome.results).toEqual([]);
    expect(outcome.unavailable).toHaveLength(1);
    expect(outcome.unavailable[0].reason).toBe("unconfigured");
    expect(outcome.unavailable[0].remedy).toContain("ADZUNA_APP_ID");
    expect(didNotRun(outcome)).toBe(true);
  });

  it("distinguishes a genuine zero-result search from one that never ran", async () => {
    listJobProviders.mockReturnValue([jobProvider("a", async () => [])]);
    const outcome = await searchJobsAcrossProviders({});
    expect(outcome.results).toEqual([]);
    // A provider ran and honestly found nothing — a different answer entirely.
    expect(didNotRun(outcome)).toBe(false);
    expect(outcome.succeeded).toEqual(["a"]);
  });

  it("still carries unavailable providers alongside successful ones", async () => {
    listJobProviders.mockReturnValue([jobProvider("a", async () => [job({ title: "One" })])]);
    listUnavailableOfKind.mockReturnValue([
      { provider: "usajobs", displayName: "USAJOBS", reason: "disabled", remedy: "Set FEATURE_RESEARCH_JOBS=true" },
    ]);
    const outcome = await searchJobsAcrossProviders({});
    expect(outcome.results).toHaveLength(1);
    expect(outcome.unavailable).toHaveLength(1);
    expect(didNotRun(outcome)).toBe(false);
  });

  it("merges results from several providers", async () => {
    listJobProviders.mockReturnValue([
      jobProvider("a", async () => [job({ title: "One" })]),
      jobProvider("b", async () => [job({ title: "Two" })]),
    ]);
    const outcome = await searchJobsAcrossProviders({});
    expect(outcome.results).toHaveLength(2);
    expect(outcome.succeeded).toEqual(["a", "b"]);
  });

  it("survives one provider failing and names it", async () => {
    // A partial result with a named failure beats an error page.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listJobProviders.mockReturnValue([
      jobProvider("good", async () => [job({ title: "One" })]),
      jobProvider("bad", async () => {
        throw new Error("provider down");
      }),
    ]);
    const outcome = await searchJobsAcrossProviders({});
    expect(outcome.results).toHaveLength(1);
    expect(outcome.succeeded).toEqual(["good"]);
    expect(outcome.failed).toEqual([{ provider: "bad", reason: "provider down" }]);
    spy.mockRestore();
  });

  it("returns nothing but does not throw when every provider fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listJobProviders.mockReturnValue([
      jobProvider("a", async () => {
        throw new Error("down");
      }),
    ]);
    const outcome = await searchJobsAcrossProviders({});
    expect(outcome.results).toEqual([]);
    expect(outcome.failed).toHaveLength(1);
    spy.mockRestore();
  });

  it("deduplicates the same role syndicated to two boards", async () => {
    listJobProviders.mockReturnValue([
      jobProvider("a", async () => [job({ title: "AI Engineer", company: "OpenAI" })]),
      jobProvider("b", async () => [job({ title: "ai engineer", company: "openai" })]),
    ]);
    expect((await searchJobsAcrossProviders({})).results).toHaveLength(1);
  });

  it("keeps the richer record when duplicates collide", async () => {
    // A posting with a description and a salary is more useful than a bare one.
    listJobProviders.mockReturnValue([
      jobProvider("thin", async () => [job({ title: "AI Engineer" })]),
      jobProvider("rich", async () => [
        job({ title: "AI Engineer", description: "Full JD", salaryMin: 150000 }),
      ]),
    ]);
    const [result] = (await searchJobsAcrossProviders({})).results;
    expect(result.description).toBe("Full JD");
  });

  it("orders newest first and tolerates a missing published date", async () => {
    listJobProviders.mockReturnValue([
      jobProvider("a", async () => [
        job({ title: "Old", provenance: { ...job({ title: "Old" }).provenance, publishedAt: "2026-01-01T00:00:00.000Z" } }),
        job({ title: "New", provenance: { ...job({ title: "New" }).provenance, publishedAt: "2026-08-01T00:00:00.000Z" } }),
        job({ title: "Undated", provenance: { ...job({ title: "Undated" }).provenance, publishedAt: null } }),
      ]),
    ]);
    const titles = (await searchJobsAcrossProviders({})).results.map((r) => r.title);
    expect(titles).toEqual(["New", "Old", "Undated"]);
  });
});

describe("searchNewsAcrossProviders", () => {
  function newsProvider(id: string, urls: string[]): NewsProvider {
    return {
      kind: "news",
      id: id as NewsProvider["id"],
      displayName: id,
      configured: true,
      rateLimitPerSecond: 2,
      searchNews: async () =>
        urls.map((url, i) => ({
          provenance: {
            provider: "noozra" as const,
            externalId: url,
            sourceUrl: url,
            retrievedAt: "2026-08-27T12:00:00.000Z",
            publishedAt: `2026-08-0${i + 1}T00:00:00.000Z`,
          },
          headline: `H${i}`,
          summary: null,
          source: "Outlet",
          category: null,
          imageUrl: null,
        })),
    };
  }

  it("deduplicates the same article across providers by url", async () => {
    listNewsProviders.mockReturnValue([
      newsProvider("a", ["https://x.test/1"]),
      newsProvider("b", ["https://x.test/1"]),
    ]);
    expect((await searchNewsAcrossProviders("ai")).results).toHaveLength(1);
  });

  it("respects the requested limit after merging", async () => {
    listNewsProviders.mockReturnValue([
      newsProvider("a", ["https://x.test/1", "https://x.test/2", "https://x.test/3"]),
    ]);
    expect((await searchNewsAcrossProviders("ai", 2)).results).toHaveLength(2);
  });

  it("returns an empty outcome when no news provider is available", async () => {
    listNewsProviders.mockReturnValue([]);
    expect((await searchNewsAcrossProviders("ai")).results).toEqual([]);
  });
});
