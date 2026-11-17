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

/**
 * Hand the fixture over as the extension would send it.
 *
 * Passes every field through. It used to blank `text`, which quietly meant the
 * fixtures were exercising a payload no extension ever produces — and hid the
 * fallback path entirely once that path moved.
 */
const asPage = (f: CapturedPage & { note: string }): CapturedPage => ({
  url: f.url,
  canonicalUrl: f.canonicalUrl ?? null,
  title: f.title,
  h1: f.h1 ?? null,
  text: f.text ?? "",
  sections: f.sections ?? [],
  labels: f.labels ?? [],
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
      // Lever publishes a JobPosting block, which outranks every other source.
      expect(provenance[field]).toBe("structured");
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

  it("recovers the company from the page title, marked as inferred", () => {
    // This board sets no og:site_name and publishes no structured company, so
    // the only statement of the employer is the document title: "Job
    // Application for Anthropic Fellows Program at Anthropic". Splitting that
    // is a guess and is labelled one — but a labelled guess the person can
    // confirm at a glance beats an empty field they have to go and look up.
    expect(job.company).toBe("Anthropic");
    expect(provenance.company).toBe("heuristic");
  });

  it("still reports location as not found rather than inventing one", () => {
    // og:description carries "London, UK; Ontario, CAN; ..." but that is the
    // board's own summary line, not a labelled location field. Guessing from it
    // would pick one city out of four.
    expect(job.location).toBeNull();
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

describe("SurelyRemote (no JobPosting, no Open Graph at all)", () => {
  /**
   * The regression this file exists for.
   *
   * This page publishes no structured data and no og: tags. Before heuristics,
   * capture returned `title` (the raw document title, company and all),
   * `job_url` and `source` — and nothing else. Every field the review form
   * shows was blank, on a page that plainly stated the role, the employer, the
   * work arrangement and several paragraphs of description.
   */
  const fixture = FIXTURES.surelyremote;
  const { job, provenance } = structureDeterministically(asPage(fixture));

  it("recovers the role without the company appended", () => {
    expect(job.title).toBe("Applied AI Engineer");
  });

  it("recovers the employer from the document title", () => {
    expect(job.company).toBe("Bjak");
  });

  it("recovers the work arrangement and employment type", () => {
    expect(job.location_type).toBe("remote");
    expect(job.employment_type).toBe("full_time");
  });

  it("keeps the posting body instead of discarding it", () => {
    expect(job.job_description).toContain("practical AI agents");
    expect(job.job_description).toContain("Responsibilities");
  });

  it("still invents no salary, because the page states none", () => {
    expect(job.salary_min).toBeNull();
    expect(job.salary_max).toBeNull();
  });

  it("labels every recovered field as a guess, not as published data", () => {
    for (const field of ["title", "company", "location_type", "employment_type", "job_description"] as const) {
      expect(provenance[field], field).toBe("heuristic");
    }
  });
});

describe("SurelyRemote labelled summary block", () => {
  /**
   * The page ends with a `Label\nValue` summary — a shape a great many boards
   * emit. Reading it is what turns a mostly-empty capture into a usable one
   * without a model, and it is also what keeps a stray word in the body from
   * being mistaken for a field.
   */
  const fixture = FIXTURES.surelyremote;
  const { job, provenance } = structureDeterministically(asPage(fixture));

  it("reads employment type and seniority from the labelled block", () => {
    expect(job.employment_type).toBe("full_time");
    expect(job.seniority).toBe("mid");
  });

  it("decides the arrangement from the posting, not from the site byline", () => {
    // "Written by Surely Remote" is the site's own byline. It must not be the
    // thing that decides this. The arrangement comes from the posting's own
    // "Full-time. Remote." line instead — a line made only of job attributes.
    expect(fixture.text).toContain("Written by Surely Remote");
    expect(job.location_type).toBe("remote");
  });

  it("does not file the next label as the company name", () => {
    expect(job.company).toBe("Bjak");
    expect(job.company).not.toBe("Experience");
  });
});

describe("20. Surely Remote / Bjak — full-page regression", () => {
  /**
   * The acceptance case, captured live with the shipped extractor.
   *
   * This page has no JobPosting, no Open Graph, and no <dl>/<table> labels.
   * Sections are the only structure it offers, and the employer's posting sits
   * directly alongside the board's own editorial — which is exactly what makes
   * it the case worth pinning. Everything asserted here must hold with no
   * provider involved at all.
   */
  const fixture = FIXTURES.surelyremote_sections;
  const { job, provenance } = structureDeterministically(fixture as never);
  const description = job.job_description ?? "";

  it("captures the role and the employer", () => {
    expect(job.title).toBe("Applied AI Engineer");
    expect(job.company).toBe("Bjak");
  });

  it("reads employment and seniority from the Job Summary card", () => {
    // That card is a 12-cell <div> grid — no <dl>, no <table>, no <p>. Before
    // leaf containers were captured it came back with zero characters and
    // neither field was extracted at all.
    expect(job.employment_type).toBe("full_time");
    expect(job.seniority).toBe("mid");
  });

  it("keeps the parent heading whose content lives under its children", () => {
    // "Skills & Requirements" has no body of its own; "Required Skills:" and
    // "Nice-to-Have Skills:" sit beneath it. Dropping it flattens a grouping
    // the employer wrote deliberately.
    expect(description).toContain("Skills & Requirements");
    expect(description.indexOf("Skills & Requirements")).toBeLessThan(description.indexOf("Required Skills:"));
  });

  it("captures the role overview, which is headed with the job title itself", () => {
    // The <h1> heads the opening paragraph. Matching no employer keyword, it
    // would classify as unknown and be dropped — losing the single most
    // important paragraph on the page.
    expect(description).toContain("building practical AI agents");
    expect(description).toContain("full lifecycle of AI features");
  });

  it("captures every employer section, with its bullets intact", () => {
    for (const fragment of [
      "• Build AI agents, workflows, tools",
      "• Apply LLMs, retrieval, tool calling",
      "• Python",
      "• RAG systems",
      "• Fintech experience",
      "• KYC/Risk management",
      "Bjak is a leading Southeast Asian insurance",
    ]) {
      expect(description, fragment).toContain(fragment);
    }
  });

  it("keeps the employer's section headings", () => {
    for (const heading of ["Responsibilities", "Required Skills:", "Nice-to-Have Skills:", "About the Company"]) {
      expect(description, heading).toContain(heading);
    }
  });

  it("excludes every one of the board's own sections", () => {
    // §2: these are the board writing ABOUT the job, not the job.
    for (const fragment of [
      "The Job in a Nutshell",
      "Skills You'll Develop",
      "Tailor your CV",
      "remote-first culture and distributed teams",
      "Never pay to apply",
      "We verify employers where possible",
    ]) {
      expect(description, fragment).not.toContain(fragment);
    }
  });

  it("excludes the Job Summary card from the description while still reading it", () => {
    expect(description).not.toContain("Posted\n1 month ago");
    expect(job.employment_type).toBe("full_time");
  });

  it("is a substantial description, not a summary of one", () => {
    expect(description.length).toBeGreaterThan(1500);
  });

  it("contains only employer content, measured line by line", () => {
    // Every non-blank line must trace back to an employer section. A whitelist
    // check rather than a blacklist: a blacklist only catches the contamination
    // someone thought to name.
    const employerText = fixture.sections
      .filter((s: { heading: string | null }) =>
        [null, "Applied AI Engineer", "Responsibilities", "Skills & Requirements",
         "Required Skills:", "Nice-to-Have Skills:", "About the Company"].includes(s.heading))
      .map((s: { heading: string | null; text: string }) => `${s.heading ?? ""}\n${s.text}`)
      .join("\n");

    for (const line of description.split("\n").map((l) => l.trim()).filter(Boolean)) {
      expect(employerText, `leaked line: ${line}`).toContain(line);
    }
  });

  it("does not conclude remote from the board's editorial", () => {
    // The board's "Remote Readiness Overview" states, in as many words, "The
    // role is fully remote". It is still the BOARD's analysis, not the
    // employer's posting, so it must not set the field — and the only reason it
    // cannot is that heuristics read employer sections rather than page text.
    expect(fixture.sections.some((s: { text: string }) => /fully remote/i.test(s.text))).toBe(true);
    expect(job.location_type).toBeNull();
  });

  it("invents no salary and no location, because the page states neither", () => {
    expect(job.salary_min).toBeNull();
    expect(job.salary_max).toBeNull();
    expect(job.location).toBeNull();
  });

  it("labels provenance honestly across the tiers it used", () => {
    expect(provenance.job_description).toBe("page");
    expect(provenance.employment_type).toBe("heuristic");
    expect(provenance.title).toBe("heuristic");
  });
});
