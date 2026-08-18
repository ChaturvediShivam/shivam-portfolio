import { describe, it, expect } from "vitest";
import { createSupabaseStub } from "@/test/stubs/supabase";
import { normalizeJobUrl, findOpportunityByJobUrl } from "@/lib/opportunities";

/**
 * Duplicate detection for job postings.
 *
 * The failure this prevents is mundane and constant: the same role reaches you
 * from a LinkedIn feed, an email alert and a recruiter's message, each carrying
 * a different tracking parameter, and a raw string comparison files all three as
 * separate pursuits. A pipeline that says you have applied to 40 jobs when you
 * have applied to 28 is worse than no pipeline.
 *
 * `normalizeJobUrl` is a pure function and is tested as one. The lookup is
 * tested through the shared Supabase stub, which records the filter chain — so
 * these assert that the right predicate was *issued*, not merely that a query
 * happened.
 */

describe("normalizeJobUrl", () => {
  it("returns null for blank input", () => {
    for (const blank of [null, undefined, "", "   "]) {
      expect(normalizeJobUrl(blank)).toBeNull();
    }
  });

  it("treats the same posting shared three ways as one URL", () => {
    const canonical = normalizeJobUrl("https://boards.greenhouse.io/acme/jobs/123");
    const shared = [
      "https://boards.greenhouse.io/acme/jobs/123/",
      "https://boards.greenhouse.io/acme/jobs/123#apply",
      "https://boards.greenhouse.io/acme/jobs/123?gh_src=newsletter",
      "https://boards.greenhouse.io/acme/jobs/123?utm_source=x&utm_medium=email",
      "https://www.boards.greenhouse.io/acme/jobs/123",
    ];
    for (const variant of shared) {
      expect(normalizeJobUrl(variant), variant).toBe(canonical);
    }
  });

  it("ignores query parameter order", () => {
    expect(normalizeJobUrl("https://jobs.example.com/x?b=2&a=1")).toBe(
      normalizeJobUrl("https://jobs.example.com/x?a=1&b=2"),
    );
  });

  it("KEEPS identifiers that name the posting", () => {
    // The whole risk of stripping parameters is merging two different roles.
    // These carry the job identity on their respective boards.
    for (const [param, value] of [
      ["vjk", "abc123"],
      ["gh_jid", "456"],
      ["currentJobId", "789"],
      ["jobId", "42"],
    ] as const) {
      const withId = normalizeJobUrl(`https://jobs.example.com/search?${param}=${value}`)!;
      expect(withId, param).toContain(`${param}=${value}`);
      expect(withId).not.toBe(normalizeJobUrl("https://jobs.example.com/search"));
    }
  });

  it("distinguishes genuinely different postings", () => {
    expect(normalizeJobUrl("https://jobs.example.com/a")).not.toBe(
      normalizeJobUrl("https://jobs.example.com/b"),
    );
  });

  it("keeps the root path rather than producing a pathless URL", () => {
    expect(normalizeJobUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("returns unparseable and non-web values unchanged rather than refusing them", () => {
    // Refusing to save a job because its link is malformed would be a worse
    // outcome than failing to deduplicate it.
    expect(normalizeJobUrl("  not a url  ")).toBe("not a url");
    expect(normalizeJobUrl("mailto:recruiter@example.com")).toBe("mailto:recruiter@example.com");
  });
});

describe("findOpportunityByJobUrl", () => {
  const row = { id: "opp-1", title: "Senior Engineer", stage: "applied", archived_at: null };

  it("queries the normalized URL and the raw string together", async () => {
    const stub = createSupabaseStub({ select: { opportunities: row } });
    const found = await findOpportunityByJobUrl(
      stub.client,
      "https://www.boards.greenhouse.io/acme/jobs/123/?gh_src=x",
    );

    expect(found).toEqual(row);
    const [op] = stub.opsFor("opportunities");
    const filter = op.filters.find((f) => f.op === "in" && f.column === "job_url");
    expect(filter).toBeDefined();
    // Both spellings: the normalized form matches rows written since
    // normalization landed, the raw form catches rows written before it.
    expect(filter!.value).toContain("https://boards.greenhouse.io/acme/jobs/123");
    expect(filter!.value).toContain("https://www.boards.greenhouse.io/acme/jobs/123/?gh_src=x");
  });

  it("collapses the candidate list when the URL is already canonical", async () => {
    const stub = createSupabaseStub({ select: { opportunities: null } });
    await findOpportunityByJobUrl(stub.client, "https://jobs.example.com/x");

    const filter = stub.opsFor("opportunities")[0].filters.find((f) => f.op === "in")!;
    expect(filter.value).toEqual(["https://jobs.example.com/x"]);
  });

  it("returns null when nothing matches", async () => {
    const stub = createSupabaseStub({ select: { opportunities: null } });
    expect(await findOpportunityByJobUrl(stub.client, "https://jobs.example.com/new")).toBeNull();
  });

  it("excludes the row being edited, so saving an opportunity is not a self-collision", async () => {
    const stub = createSupabaseStub({ select: { opportunities: null } });
    await findOpportunityByJobUrl(stub.client, "https://jobs.example.com/x", "opp-1");

    const op = stub.opsFor("opportunities")[0];
    expect(op.filters.some((f) => f.op === "neq" && f.column === "id" && f.value === "opp-1")).toBe(true);
  });

  it("does not query at all for a blank URL", async () => {
    const stub = createSupabaseStub({});
    expect(await findOpportunityByJobUrl(stub.client, "   ")).toBeNull();
    expect(stub.opsFor("opportunities")).toHaveLength(0);
  });

  it("surfaces archived matches, so an earlier decision is not silently repeated", async () => {
    const archived = { ...row, archived_at: "2026-08-01T00:00:00Z" };
    const stub = createSupabaseStub({ select: { opportunities: archived } });
    const found = await findOpportunityByJobUrl(stub.client, "https://jobs.example.com/x");

    expect(found?.archived_at).toBe("2026-08-01T00:00:00Z");
    // No `archived_at is null` predicate: archived rows must still be found.
    expect(stub.opsFor("opportunities")[0].filters.some((f) => f.column === "archived_at")).toBe(false);
  });
});
