import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { structureDeterministically, sourceFor } from "@/lib/capture/structure";
import type { CapturedPage } from "@/types/capture";

/**
 * Real job boards, captured live.
 *
 * The unit tests above use markup shaped the way the schema.org spec says it
 * should be. Actual applicant tracking systems do not read the spec, and the
 * assumptions that break are never the ones you expect — so these fixtures were
 * lifted from live postings with the extension's own extractor and are asserted
 * against unchanged.
 *
 * What running them against reality actually corrected:
 *
 *   * Greenhouse's current domain (job-boards.greenhouse.io) publishes NO
 *     JobPosting block at all. The original assumption — "every major ATS emits
 *     one, because Google for Jobs requires it" — is simply false there, and a
 *     capture flow that relied on it would have silently produced nothing on one
 *     of the most common boards.
 *   * Lever DOES publish one, but fills unknown address parts with explicit
 *     `null` rather than omitting them, which a naive join renders as
 *     "Amsterdam, Netherlands, null, null".
 *
 * Refresh with the extractor in extension/extractor.js if a board changes shape.
 */

const FIXTURES = JSON.parse(
  readFileSync(join(process.cwd(), "test/capture/fixtures/real-pages.json"), "utf8"),
) as Record<string, CapturedPage & { note: string }>;

const asPage = (f: CapturedPage & { note: string }): CapturedPage => ({
  url: f.url,
  title: f.title,
  text: "",
  meta: f.meta,
  jsonLd: f.jsonLd,
});

describe("Lever (publishes JobPosting)", () => {
  const { job, provenance } = structureDeterministically(asPage(FIXTURES.lever));

  it("fills the role, company and location from the page itself", () => {
    expect(job.title).toBe("Account Executive");
    expect(job.company).toBe("Lever Demo 2");
    expect(job.location).toBe("Amsterdam, Netherlands");
    for (const field of ["title", "company", "location"] as const) {
      expect(provenance[field]).toBe("page");
    }
  });

  it("does not render Lever's explicit address nulls into the location", () => {
    // addressRegion and addressCountry come back as literal null on every Lever
    // posting. Joining them produces "Amsterdam, Netherlands, null, null".
    expect(job.location).not.toMatch(/null/);
  });

  it("leaves employmentType null rather than storing the string 'null'", () => {
    expect(job.employment_type).toBeNull();
    expect(provenance.employment_type).toBeUndefined();
  });

  it("converts the HTML description to readable text", () => {
    expect(job.job_description).toContain("aegaegdagdag");
    expect(job.job_description).not.toContain("<p>");
    expect(job.job_description).not.toContain("&nbsp;");
  });

  it("labels the source lever", () => {
    expect(sourceFor(FIXTURES.lever.url)).toBe("lever");
  });
});

describe("Greenhouse (publishes NO JobPosting)", () => {
  const { job, provenance } = structureDeterministically(asPage(FIXTURES.greenhouse));

  it("still recovers the role from og:title", () => {
    // The <title> is "Job Application for Anthropic Fellows Program at
    // Anthropic"; og:title is the role on its own, which is what belongs here.
    expect(job.title).toBe("Anthropic Fellows Program");
    expect(provenance.title).toBe("page");
  });

  it("reports company and location as not found rather than guessing", () => {
    // This board sets no og:site_name and no structured company. Leaving these
    // null is the correct outcome: the AI pass reads the page text for them,
    // and if that is unavailable the person fills them in.
    expect(job.company).toBeNull();
    expect(job.location).toBeNull();
    expect(provenance.company).toBeUndefined();
    expect(provenance.location).toBeUndefined();
  });

  it("labels the source greenhouse", () => {
    expect(sourceFor(FIXTURES.greenhouse.url)).toBe("greenhouse");
  });
});

describe("every fixture", () => {
  it("produces a normalized job_url that can deduplicate", () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      const { job } = structureDeterministically(asPage(fixture));
      expect(job.job_url, name).toBeTruthy();
      expect(job.job_url, name).not.toMatch(/#|utm_|gh_src/);
    }
  });

  it("never invents a value it did not find", () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      const { job, provenance } = structureDeterministically(asPage(fixture));
      for (const [field, value] of Object.entries(job)) {
        if (field === "job_url" || field === "source" || field === "skills") continue;
        // A recorded provenance and a filled value must agree in both
        // directions: no badge without a value, no value without a badge.
        expect(Boolean(value), `${name}.${field}`).toBe(Boolean(provenance[field as never]));
      }
    }
  });
});
