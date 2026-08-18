import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { structureDeterministically, sourceFor, domainOf } from "@/lib/capture/structure";
import type { CapturedPage } from "@/types/capture";

/**
 * Capture structuring.
 *
 * Two properties carry the whole design.
 *
 * The first is precedence: what the employer published must never be replaced
 * by what a model inferred. Structured data runs first and wins; the model only
 * fills holes. If that ordering inverts, a confident guess quietly overwrites a
 * fact, and the review step cannot catch it because both look identical.
 *
 * The second is honesty: a field nobody found stays null and carries no
 * provenance. The entire justification for putting a human in front of the
 * result is that a filled field means something was actually read. A capture
 * that pre-fills a plausible salary is worse than one that leaves it blank —
 * blank gets typed in, wrong gets saved.
 */

function page(overrides: Partial<CapturedPage> = {}): CapturedPage {
  return {
    url: "https://boards.greenhouse.io/acme/jobs/123",
    title: "Senior AI Engineer at Acme",
    text: "",
    jsonLd: [],
    ...overrides,
  };
}

const POSTING = {
  "@type": "JobPosting",
  title: "Senior AI Engineer",
  hiringOrganization: { name: "Acme Corp" },
  description: "<p>Do the work.</p>",
};

describe("structureDeterministically", () => {
  it("prefers JobPosting over the document title for the role", () => {
    const { job, provenance } = structureDeterministically(
      page({ jsonLd: [POSTING], title: "Senior AI Engineer at Acme | Greenhouse" }),
    );
    // The <title> carries the company and the board name; the structured field
    // carries the role alone, which is what belongs in `title`.
    expect(job.title).toBe("Senior AI Engineer");
    expect(job.company).toBe("Acme Corp");
    expect(provenance.title).toBe("page");
  });

  it("falls back to og:title and the document title when there is no structured data", () => {
    const { job, provenance } = structureDeterministically(
      page({ title: "Backend Engineer — Globex", meta: { ogTitle: "Backend Engineer" } }),
    );
    expect(job.title).toBe("Backend Engineer");
    expect(provenance.title).toBe("page");
  });

  it("does not let og:site_name override a company the posting named", () => {
    const { job } = structureDeterministically(
      page({ jsonLd: [POSTING], meta: { ogSiteName: "Greenhouse" } }),
    );
    // On an aggregator, og:site_name is the board, not the employer. It may
    // only fill a slot that structured data left empty.
    expect(job.company).toBe("Acme Corp");
  });

  it("uses og:site_name only when nothing better exists", () => {
    const { job, provenance } = structureDeterministically(page({ meta: { ogSiteName: "Globex Careers" } }));
    expect(job.company).toBe("Globex Careers");
    expect(provenance.company).toBe("page");
  });

  it("leaves unfound fields null and records no provenance for them", () => {
    const { job, provenance } = structureDeterministically(page({ title: "Some role" }));
    for (const field of ["salary_min", "salary_max", "location", "seniority", "contact_email"] as const) {
      expect(job[field], field).toBeNull();
      expect(provenance[field], field).toBeUndefined();
    }
  });

  it("normalizes the job URL so a captured link deduplicates against a typed one", () => {
    const { job } = structureDeterministically(
      page({ url: "https://www.boards.greenhouse.io/acme/jobs/123/?gh_src=email#apply" }),
    );
    expect(job.job_url).toBe("https://boards.greenhouse.io/acme/jobs/123");
  });

  it("always produces a job_url even when the URL cannot be parsed", () => {
    const { job } = structureDeterministically(page({ url: "not-a-url" }));
    expect(job.job_url).toBe("not-a-url");
  });

  it("starts skills as an empty array, never null", () => {
    // The popup joins this for display; null would render "null".
    expect(structureDeterministically(page()).job.skills).toEqual([]);
  });
});

describe("sourceFor", () => {
  it("labels the boards worth distinguishing", () => {
    const cases: [string, string][] = [
      ["https://www.linkedin.com/jobs/view/4012345678/", "linkedin"],
      ["https://in.indeed.com/viewjob?jk=abc", "indeed"],
      ["https://boards.greenhouse.io/acme/jobs/1", "greenhouse"],
      ["https://jobs.lever.co/acme/1", "lever"],
      ["https://jobs.ashbyhq.com/acme/1", "ashby"],
      ["https://www.naukri.com/job-listings-x", "naukri"],
      ["https://acme.wd1.myworkdayjobs.com/careers/job/1", "workday"],
      ["https://mail.google.com/mail/u/0/#inbox/abc", "gmail"],
    ];
    for (const [url, expected] of cases) {
      expect(sourceFor(url), url).toBe(expected);
    }
  });

  it("falls back to the bare host for a company careers page", () => {
    // For a company-hosted posting the domain IS the useful answer; inventing a
    // board label would be wrong.
    expect(sourceFor("https://www.acme.com/careers/senior-engineer")).toBe("acme.com");
  });

  it("does not match a lookalike domain", () => {
    expect(sourceFor("https://notlinkedin.com/jobs/1")).toBe("notlinkedin.com");
    expect(sourceFor("https://linkedin.com.evil.example/jobs/1")).toBe("linkedin.com.evil.example");
  });

  it("returns null for an unparseable URL rather than throwing", () => {
    expect(sourceFor("nonsense")).toBeNull();
    expect(domainOf("nonsense")).toBeNull();
  });
});

describe("structureCapture degradation", () => {
  const ENV = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    process.env = { ...ENV };
    vi.restoreAllMocks();
  });

  it("returns the deterministic result with a notice when AI is disabled", async () => {
    process.env.FEATURE_AI = "false";
    process.env.FEATURE_RESUME_AI = "false";
    const { structureCapture } = await import("@/lib/capture/structure");
    const { createSupabaseStub } = await import("@/test/stubs/supabase");

    const result = await structureCapture(
      createSupabaseStub({}).client,
      "owner-1",
      page({ jsonLd: [POSTING], text: "x".repeat(1000) }),
    );

    // Losing a capture because the model was unavailable would be the wrong
    // trade: URL, title and company are still far faster than typing.
    expect(result.job.title).toBe("Senior AI Engineer");
    expect(result.deterministicOnly).toBe(true);
    expect(result.notice).toMatch(/AI structuring is off/i);
  });

  it("refuses to call the provider for a page with almost no text", async () => {
    process.env.FEATURE_AI = "true";
    process.env.FEATURE_RESUME_AI = "true";
    const { structureCapture } = await import("@/lib/capture/structure");
    const { createSupabaseStub } = await import("@/test/stubs/supabase");

    const result = await structureCapture(createSupabaseStub({}).client, "owner-1", page({ text: "short" }));

    expect(result.deterministicOnly).toBe(true);
    expect(result.notice).toMatch(/too little readable text/i);
  });
});
