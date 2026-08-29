import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resetRateLimiter,
  __setBackoffBaseMs,
  __setRateLimitDisabled,
  ResearchApiError,
  ResearchAuthError,
  ResearchNetworkError,
  ResearchRateLimitError,
  ResearchResponseError,
} from "@/lib/research/http";
import { openAlexProvider, __testing as oa } from "@/lib/research/providers/openalex";
import { getProvider, listProviderStatus, listScholarlyProviders } from "@/lib/research/registry";

/**
 * OpenAlex adapter.
 *
 * The fixture below is trimmed from a REAL response captured with curl before
 * the adapter was written, which is why it includes the awkward parts: the
 * abstract as an inverted index, a null `primary_location.source`, and an
 * authorship with no institutions. No live request is made here.
 */

const AT = "2026-08-27T12:00:00.000Z";

beforeEach(() => {
  resetRateLimiter();
  __setBackoffBaseMs(1);
  __setRateLimitDisabled(true);
});

afterEach(() => vi.unstubAllGlobals());

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

/** Trimmed from a real `api.openalex.org/works?search=...` response. */
const WORK = {
  id: "https://openalex.org/W4318827233",
  doi: "https://doi.org/10.1016/j.lindif.2023.102274",
  title: "ChatGPT for good? On opportunities and challenges of large language models",
  display_name: "ChatGPT for good?",
  publication_year: 2023,
  publication_date: "2023-04-01",
  type: "article",
  cited_by_count: 6032,
  abstract_inverted_index: { Large: [0], language: [1], models: [2], are: [3], useful: [4] },
  authorships: [
    {
      author: { id: "https://openalex.org/A123", display_name: "Enkelejda Kasneci", orcid: null },
      institutions: [{ id: "https://openalex.org/I62916508", display_name: "Technical University of Munich" }],
    },
    {
      author: { id: "https://openalex.org/A456", display_name: "Kathrin Sessler" },
      // Real responses frequently carry an author with no institution.
      institutions: [],
    },
  ],
  primary_location: {
    landing_page_url: "https://doi.org/10.1016/j.lindif.2023.102274",
    pdf_url: null,
    source: { display_name: "Learning and Individual Differences" },
  },
  open_access: { is_oa: true, oa_status: "hybrid", oa_url: "https://example.org/paper.pdf" },
  topics: [{ id: "https://openalex.org/T10181", display_name: "Natural Language Processing" }],
  concepts: [{ id: "https://openalex.org/C41008148", display_name: "Computer science" }],
};

// --- Normalization -----------------------------------------------------------

describe("normalize", () => {
  it("maps a real work onto the contract", () => {
    const work = oa.normalize(WORK, AT);
    expect(work?.title).toBe(WORK.title);
    expect(work?.publicationYear).toBe(2023);
    expect(work?.citedByCount).toBe(6032);
    expect(work?.workType).toBe("article");
    expect(work?.venue).toBe("Learning and Individual Differences");
    expect(work?.doi).toBe(WORK.doi);
    expect(work?.openAccessUrl).toBe("https://example.org/paper.pdf");
  });

  it("extracts the authors and institutions that answer the actual question", () => {
    // "Who is doing the work" is the whole point of this provider.
    const work = oa.normalize(WORK, AT);
    expect(work?.authors).toEqual(["Enkelejda Kasneci", "Kathrin Sessler"]);
    expect(work?.institutions).toEqual(["Technical University of Munich"]);
  });

  it("records provenance with the publisher landing page", () => {
    const work = oa.normalize(WORK, AT);
    expect(work?.provenance.provider).toBe("openalex");
    expect(work?.provenance.externalId).toBe(WORK.id);
    expect(work?.provenance.sourceUrl).toBe(WORK.primary_location.landing_page_url);
    expect(work?.provenance.publishedAt).toBe("2023-04-01T00:00:00.000Z");
    expect(work?.provenance.retrievedAt).toBe(AT);
  });

  it("prefers topics but falls back to legacy concepts", () => {
    expect(oa.normalize(WORK, AT)?.topics).toEqual(["Natural Language Processing"]);
    const legacy = { ...WORK, topics: [] };
    expect(oa.normalize(legacy, AT)?.topics).toEqual(["Computer science"]);
  });

  it("falls back through landing page → doi → record id for the source url", () => {
    const noLanding = { ...WORK, primary_location: { landing_page_url: null, source: null } };
    expect(oa.normalize(noLanding, AT)?.provenance.sourceUrl).toBe(WORK.doi);
    const bare = { id: WORK.id, title: "T" };
    expect(oa.normalize(bare, AT)?.provenance.sourceUrl).toBe(WORK.id);
  });

  it("handles a null primary_location.source without throwing", () => {
    // Observed in a real response.
    const work = oa.normalize({ ...WORK, primary_location: { landing_page_url: "u", source: null } }, AT);
    expect(work?.venue).toBeNull();
  });

  it("nulls every optional field rather than inventing one", () => {
    const work = oa.normalize({ id: WORK.id, title: "Bare work" }, AT);
    expect(work?.authors).toEqual([]);
    expect(work?.institutions).toEqual([]);
    expect(work?.venue).toBeNull();
    expect(work?.publicationYear).toBeNull();
    expect(work?.citedByCount).toBeNull();
    expect(work?.doi).toBeNull();
    expect(work?.openAccessUrl).toBeNull();
    expect(work?.abstract).toBeNull();
    expect(work?.topics).toEqual([]);
    expect(work?.provenance.publishedAt).toBeNull();
  });

  it("falls back to display_name when title is absent", () => {
    const work = oa.normalize({ id: WORK.id, display_name: "Fallback title" }, AT);
    expect(work?.title).toBe("Fallback title");
  });

  it("drops a record with no id or no title", () => {
    expect(oa.normalize({ title: "T" }, AT)).toBeNull();
    expect(oa.normalize({ id: WORK.id }, AT)).toBeNull();
    expect(oa.normalize(null, AT)).toBeNull();
    expect(oa.normalize("nope", AT)).toBeNull();
  });

  it("survives malformed nested structures", () => {
    const work = oa.normalize(
      {
        id: WORK.id,
        title: "T",
        authorships: "not an array",
        primary_location: 42,
        open_access: [],
        topics: { bad: true },
      },
      AT,
    );
    expect(work?.authors).toEqual([]);
    expect(work?.venue).toBeNull();
    expect(work?.openAccessUrl).toBeNull();
  });
});

// --- Abstract reconstruction -------------------------------------------------

describe("reconstructAbstract", () => {
  it("rebuilds text from the inverted index in position order", () => {
    // OpenAlex publishes abstracts as {word: [positions]}, not as text.
    expect(oa.reconstructAbstract({ world: [1], Hello: [0] })).toBe("Hello world");
  });

  it("handles a word appearing at several positions", () => {
    expect(oa.reconstructAbstract({ the: [0, 2], cat: [1], sat: [3] })).toBe("the cat the sat");
  });

  it("returns null for a missing or unusable index", () => {
    expect(oa.reconstructAbstract(undefined)).toBeNull();
    expect(oa.reconstructAbstract(null)).toBeNull();
    expect(oa.reconstructAbstract({})).toBeNull();
    expect(oa.reconstructAbstract("text")).toBeNull();
    expect(oa.reconstructAbstract({ word: "not an array" })).toBeNull();
  });

  it("bounds a pathological index instead of building a huge string", () => {
    // Third-party data of unbounded size must not become a 2MB string.
    const huge: Record<string, number[]> = {};
    for (let i = 0; i < 5_000; i += 1) huge[`w${i}`] = [i];
    const text = oa.reconstructAbstract(huge);
    expect(text).not.toBeNull();
    expect((text as string).length).toBeLessThanOrEqual(1_500);
  });
});

// --- Request construction ----------------------------------------------------

describe("searchWorks", () => {
  const OLD = process.env.OPENALEX_CONTACT_EMAIL;
  afterEach(() => {
    if (OLD === undefined) delete process.env.OPENALEX_CONTACT_EMAIL;
    else process.env.OPENALEX_CONTACT_EMAIL = OLD;
  });

  it("builds the verified endpoint and query", async () => {
    delete process.env.OPENALEX_CONTACT_EMAIL;
    const calls = stubFetch([{ json: () => ({ meta: { count: 1 }, results: [WORK] }) }]);
    await openAlexProvider.searchWorks({ query: "large language model", limit: 5 });
    const url = new URL(calls[0]);
    expect(url.origin + url.pathname).toBe("https://api.openalex.org/works");
    expect(url.searchParams.get("search")).toBe("large language model");
    expect(url.searchParams.get("per-page")).toBe("5");
  });

  it("adds the optional mailto only when a contact is configured", async () => {
    // A courtesy for OpenAlex's documented polite pool — never a credential.
    delete process.env.OPENALEX_CONTACT_EMAIL;
    let calls = stubFetch([{ json: () => ({ results: [] }) }]);
    await openAlexProvider.searchWorks({ query: "x" });
    expect(new URL(calls[0]).searchParams.has("mailto")).toBe(false);

    process.env.OPENALEX_CONTACT_EMAIL = "dev@example.com";
    calls = stubFetch([{ json: () => ({ results: [] }) }]);
    await openAlexProvider.searchWorks({ query: "x" });
    expect(new URL(calls[0]).searchParams.get("mailto")).toBe("dev@example.com");
  });

  it("applies a publication date filter when asked", async () => {
    const calls = stubFetch([{ json: () => ({ results: [] }) }]);
    await openAlexProvider.searchWorks({ query: "x", fromDate: "2025-01-01" });
    expect(new URL(calls[0]).searchParams.get("filter")).toBe("from_publication_date:2025-01-01");
  });

  it("clamps the page size and page number", async () => {
    const calls = stubFetch([{ json: () => ({ results: [] }) }]);
    await openAlexProvider.searchWorks({ query: "x", limit: 5_000, page: 3 });
    const url = new URL(calls[0]);
    expect(url.searchParams.get("per-page")).toBe("50");
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("refuses an empty query without calling the API", async () => {
    const calls = stubFetch([{ json: () => ({ results: [] }) }]);
    expect(await openAlexProvider.searchWorks({ query: "   " })).toEqual([]);
    expect(await openAlexProvider.searchWorks({})).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("sends no credential header — OpenAlex needs none", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", (_u: unknown, init: RequestInit) => {
      seen.push(init);
      return Promise.resolve({ ok: true, status: 200, json: () => ({ results: [] }) } as Response);
    });
    await openAlexProvider.searchWorks({ query: "x" });
    expect(seen[0].headers).toEqual({ Accept: "application/json" });
  });

  it("returns an empty array for a zero-result response", async () => {
    // Verified live: OpenAlex answers 200 with count 0 and results [].
    stubFetch([{ json: () => ({ meta: { count: 0 }, results: [] }) }]);
    expect(await openAlexProvider.searchWorks({ query: "zzqqxx" })).toEqual([]);
  });

  it("keeps good rows when one is malformed", async () => {
    stubFetch([{ json: () => ({ results: [WORK, null, { junk: 1 }, "nope"] }) }]);
    expect(await openAlexProvider.searchWorks({ query: "x" })).toHaveLength(1);
  });

  it("deduplicates repeated record ids", async () => {
    stubFetch([{ json: () => ({ results: [WORK, { ...WORK }] }) }]);
    expect(await openAlexProvider.searchWorks({ query: "x" })).toHaveLength(1);
  });

  it("throws on a malformed envelope", async () => {
    stubFetch([{ json: () => ({ meta: { count: 1 } }) }]);
    await expect(openAlexProvider.searchWorks({ query: "x" })).rejects.toBeInstanceOf(
      ResearchResponseError,
    );
    stubFetch([{ json: () => [WORK] }]);
    await expect(openAlexProvider.searchWorks({ query: "x" })).rejects.toBeInstanceOf(
      ResearchResponseError,
    );
  });

  it("maps HTTP failures to the shared taxonomy", async () => {
    // Verified live: a bad filter returns 400, not 401.
    stubFetch([{ ok: false, status: 400 }]);
    await expect(openAlexProvider.searchWorks({ query: "x" })).rejects.toBeInstanceOf(ResearchApiError);

    stubFetch([{ ok: false, status: 403 }]);
    await expect(openAlexProvider.searchWorks({ query: "x" })).rejects.toBeInstanceOf(ResearchAuthError);

    stubFetch([{ ok: false, status: 429 }]);
    await expect(openAlexProvider.searchWorks({ query: "x" })).rejects.toBeInstanceOf(
      ResearchRateLimitError,
    );
  });

  it("bounds retries on a persistent 503", async () => {
    const calls = stubFetch([{ ok: false, status: 503 }]);
    await expect(openAlexProvider.searchWorks({ query: "x" })).rejects.toBeInstanceOf(ResearchApiError);
    expect(calls).toHaveLength(3);
  });

  it("wraps a network failure and a timeout", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    await expect(openAlexProvider.searchWorks({ query: "x" })).rejects.toBeInstanceOf(
      ResearchNetworkError,
    );

    vi.stubGlobal("fetch", () => {
      const e = new Error("t");
      e.name = "TimeoutError";
      return Promise.reject(e);
    });
    await expect(openAlexProvider.searchWorks({ query: "x" })).rejects.toThrow(/timed out/);
  });

  it("stops immediately when the caller cancels", async () => {
    const controller = new AbortController();
    controller.abort();
    let n = 0;
    vi.stubGlobal("fetch", () => {
      n += 1;
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(
      openAlexProvider.searchWorks({ query: "x" }, controller.signal),
    ).rejects.toThrow(/cancelled/);
    expect(n).toBe(1);
  });
});

// --- Registry and capability metadata ---------------------------------------

describe("registry integration", () => {
  const FLAG = "FEATURE_RESEARCH_SCHOLARLY";
  const OLD = process.env[FLAG];
  afterEach(() => {
    if (OLD === undefined) delete process.env[FLAG];
    else process.env[FLAG] = OLD;
  });

  it("is registered with scholarly capability metadata", () => {
    const provider = getProvider("openalex");
    expect(provider?.kind).toBe("scholarly");
    expect(provider?.displayName).toBe("OpenAlex");
    expect(provider?.rateLimitPerSecond).toBeGreaterThan(0);
  });

  it("NEVER reports as needing a credential", () => {
    // The failure this guards: a keyless provider looking broken because the
    // status panel says "no key".
    delete process.env[FLAG];
    const row = listProviderStatus().find((r) => r.id === "openalex");
    expect(row?.configured).toBe(true);
    expect(row?.requiredEnv).toBeNull();
    expect(openAlexProvider.configured).toBe(true);
  });

  it("is gated by its flag alone", () => {
    delete process.env[FLAG];
    expect(listScholarlyProviders()).toEqual([]);
    const row = listProviderStatus().find((r) => r.id === "openalex");
    expect(row?.enabled).toBe(false);
    expect(row?.available).toBe(false);

    process.env[FLAG] = "true";
    expect(listScholarlyProviders().map((p) => p.id)).toEqual(["openalex"]);
    expect(listProviderStatus().find((r) => r.id === "openalex")?.available).toBe(true);
  });

  it("stays available with no OPENALEX_CONTACT_EMAIL set", () => {
    process.env[FLAG] = "true";
    delete process.env.OPENALEX_CONTACT_EMAIL;
    expect(listScholarlyProviders()).toHaveLength(1);
  });
});
