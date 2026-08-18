import { describe, it, expect } from "vitest";
import {
  parseTitleAndCompany,
  guessLocationType,
  guessEmploymentType,
  guessSeniority,
  guessSalary,
  guessLocation,
  applyHeuristics,
  isPlausibleRole,
} from "@/lib/capture/heuristics";
import type { CapturedJob, CaptureProvenance } from "@/types/capture";

/**
 * Heuristic extraction.
 *
 * These exist because the two authored sources — schema.org JobPosting and
 * Open Graph — are absent far more often than the spec would suggest. Verified
 * live: modern Greenhouse publishes no JobPosting, LinkedIn renders job views
 * client-side with none, and the SurelyRemote posting that prompted this had
 * neither, nor any og: tags at all. On those pages the capture returned one
 * field and the review form arrived blank.
 *
 * Every value produced here is a guess and is labelled `heuristic`. The tests
 * that matter most are therefore the ones asserting a guess is NOT made: a
 * wrong company or an invented salary is worse than an empty field, because an
 * empty field gets typed in and a filled one gets saved.
 */

describe("parseTitleAndCompany", () => {
  it("splits the common page-title shapes", () => {
    const cases: [string, string, string | null][] = [
      ["Applied AI Engineer at Bjak", "Applied AI Engineer", "Bjak"],
      ["Senior Engineer - Acme Corp", "Senior Engineer", "Acme Corp"],
      ["Senior Engineer | Acme", "Senior Engineer", "Acme"],
      ["Job Application for Anthropic Fellows Program at Anthropic", "Anthropic Fellows Program", "Anthropic"],
      ["Apply for Backend Engineer at Globex", "Backend Engineer", "Globex"],
    ];
    for (const [input, title, company] of cases) {
      expect(parseTitleAndCompany(input), input).toEqual({ title, company });
    }
  });

  it("refuses to treat a work arrangement as an employer", () => {
    // "Senior Engineer - Remote" must not file Remote as the company.
    for (const input of ["Senior Engineer - Remote", "Data Analyst | Hybrid", "PM - Full-time"]) {
      expect(parseTitleAndCompany(input).company, input).toBeNull();
    }
  });

  it("refuses to treat a job board as an employer", () => {
    for (const input of ["Senior Engineer | Greenhouse", "Analyst - LinkedIn", "Engineer | Workday"]) {
      expect(parseTitleAndCompany(input).company, input).toBeNull();
    }
  });

  it("strips a trailing board name but keeps the real company", () => {
    expect(parseTitleAndCompany("Applied AI Engineer at Bjak | Greenhouse")).toEqual({
      title: "Applied AI Engineer",
      company: "Bjak",
    });
  });

  it("returns the whole string as the role when there is no separator", () => {
    expect(parseTitleAndCompany("Applied AI Engineer")).toEqual({ title: "Applied AI Engineer", company: null });
  });

  it("handles blank input", () => {
    expect(parseTitleAndCompany(null)).toEqual({ title: null, company: null });
    expect(parseTitleAndCompany("   ")).toEqual({ title: null, company: null });
  });
});

describe("isPlausibleRole", () => {
  it("rejects headings that name a page rather than a role", () => {
    for (const generic of ["Jobs", "Careers", "Search", "Openings", ""]) {
      expect(isPlausibleRole(generic), generic).toBe(false);
    }
    expect(isPlausibleRole("Applied AI Engineer")).toBe(true);
  });
});

describe("guessSeniority", () => {
  it("reads seniority from the title only", () => {
    expect(guessSeniority("Senior Backend Engineer")).toBe("senior");
    expect(guessSeniority("Staff Engineer")).toBe("staff");
    expect(guessSeniority("Engineering Intern")).toBe("intern");
    expect(guessSeniority("Applied AI Engineer")).toBeNull();
  });

  it("does not pick up seniority words from prose", () => {
    // Measured on a real posting: scanning the body of an "Applied AI Engineer"
    // page matched "lead" inside ordinary prose ("lead the design of...") and
    // would have filed a mid-level role as a lead position.
    const body = "You will lead the design of AI features and work with senior stakeholders.";
    expect(guessSeniority("Applied AI Engineer")).toBeNull();
    expect(guessSeniority(body)).not.toBeNull(); // proof the words are there
  });
});

describe("guessLocationType and guessEmploymentType", () => {
  it("reads work arrangement from the title or the top of the posting", () => {
    expect(guessLocationType("Engineer", "This is a fully remote role.")).toBe("remote");
    expect(guessLocationType("Engineer (Hybrid)", "")).toBe("hybrid");
    expect(guessLocationType("Engineer", "Work on-site in our Pune office.")).toBe("onsite");
    expect(guessLocationType("Engineer", "No mention at all.")).toBeNull();
  });

  it("prefers hybrid when a posting mentions both", () => {
    expect(guessLocationType("Engineer", "Hybrid role with remote days.")).toBe("hybrid");
  });

  it("does not stitch a stated phrase across a line break", () => {
    // The live page puts the byline "Written by Surely Remote" immediately
    // above the heading "Job Summary". With `\s+` between the words, the
    // pattern `remote job` matched straight across the paragraph boundary and
    // reported a remote role from two lines that each say nothing of the sort.
    expect(guessLocationType(null, "Written by Surely Remote\n\nJob Summary\nCompany\nBjak")).toBeNull();
    expect(guessLocationType(null, "Contact Remote\nWork with us")).toBeNull();
    // The same phrase on ONE line is still evidence.
    expect(guessLocationType(null, "This is a remote role based anywhere in India.")).toBe("remote");
  });

  it("does not treat a byline containing 'Remote' as a remote role", () => {
    // The page this was built against carries "Written by Surely Remote" in its
    // body. A bare-word search reports every posting on that site as remote.
    expect(guessLocationType("Applied AI Engineer", "Written by Surely Remote\nGrowth Opportunities")).toBeNull();
    expect(guessLocationType(null, "We partner with Remote Technologies Inc for payroll.")).toBeNull();
  });

  it("accepts a line made only of job attributes", () => {
    expect(guessLocationType(null, "Full-time. Remote.")).toBe("remote");
    expect(guessLocationType(null, "Remote")).toBe("remote");
  });

  it("accepts a bare word from the title or a labelled value", () => {
    expect(guessLocationType("Senior Engineer (Remote)", "")).toBe("remote");
    expect(guessLocationType("Hybrid", "")).toBe("hybrid");
  });

  it("ignores a match buried deep in the page", () => {
    const far = `${"x".repeat(4000)}\nthis is a fully remote role`;
    expect(guessLocationType("Engineer", far)).toBeNull();
  });

  it("maps employment type to the schema's vocabulary", () => {
    expect(guessEmploymentType("Engineer", "This is a Full-time position.")).toBe("full_time");
    expect(guessEmploymentType("Engineer", "6 month contract.")).toBe("contract");
    expect(guessEmploymentType("Summer Intern", "")).toBe("internship");
    expect(guessEmploymentType("Engineer", "Nothing stated.")).toBeNull();
  });
});

describe("guessSalary", () => {
  it("reads a stated range with a currency", () => {
    expect(guessSalary("Compensation: $120,000 - $160,000 per year")).toEqual({
      min: "120000",
      max: "160000",
      currency: "USD",
    });
    expect(guessSalary("₹20,00,000 to ₹35,00,000")?.currency).toBe("INR");
    expect(guessSalary("Salary £90k – £120k")).toEqual({ min: "90000", max: "120000", currency: "GBP" });
  });

  it("returns null rather than inventing a figure", () => {
    for (const text of [
      "Competitive salary and equity.",
      "We are a team of 20 - 30 people.",
      "Founded 2019 - 2024.",
      "Section 3 - 5 of the handbook.",
    ]) {
      expect(guessSalary(text), text).toBeNull();
    }
  });

  it("rejects amounts too small to be pay", () => {
    // A currency symbol next to a list number is a parse failure, not a salary.
    expect(guessSalary("$3 - $5 coffee budget")).toBeNull();
  });

  it("rejects an inverted range", () => {
    expect(guessSalary("$160,000 - $120,000")).toBeNull();
  });
});

describe("guessLocation", () => {
  it("reads a labelled line", () => {
    expect(guessLocation("Role: Engineer\nLocation: Bengaluru, India\nTeam: Platform")).toBe("Bengaluru, India");
  });

  it("does not match the word 'location' mid-sentence", () => {
    // A real posting contained "...location. This often indicates the company's
    // home base..." and an unanchored search stored that sentence as the location.
    const prose = "We list a location. This often indicates the company's home base or preferred region.";
    expect(guessLocation(prose)).toBeNull();
  });

  it("does not return a work arrangement as a place", () => {
    expect(guessLocation("Location: Remote")).toBeNull();
  });
});

describe("applyHeuristics", () => {
  const emptyJob = (): CapturedJob => ({
    title: null, company: null, location: null, location_type: null, employment_type: null,
    seniority: null, salary_min: null, salary_max: null, salary_currency: null,
    job_description: null, skills: [], experience: null, deadline_at: null,
    contact_name: null, contact_email: null, job_url: "https://x/1", source: "x",
  });

  it("never overwrites a value an authored source already supplied", () => {
    const job = emptyJob();
    job.title = "Role From JobPosting";
    job.company = "Company From JobPosting";
    const provenance: CaptureProvenance = { title: "page", company: "page" };

    applyHeuristics(job, provenance, { title: "Different Role at Different Co", h1: "Another Role", text: "" });

    expect(job.title).toBe("Role From JobPosting");
    expect(job.company).toBe("Company From JobPosting");
    expect(provenance.title).toBe("page");
  });

  it("prefers a plausible h1 over the document title for the role", () => {
    const job = emptyJob();
    const provenance: CaptureProvenance = {};
    applyHeuristics(job, provenance, { title: "Applied AI Engineer at Bjak", h1: "Applied AI Engineer", text: "" });

    expect(job.title).toBe("Applied AI Engineer");
    // The company still comes from the document title, which is where it lives.
    expect(job.company).toBe("Bjak");
    expect(provenance.title).toBe("heuristic");
  });

  it("falls back to the page text for the job description", () => {
    const job = emptyJob();
    const provenance: CaptureProvenance = {};
    const body = "This role focuses on building practical AI agents. ".repeat(10);
    applyHeuristics(job, provenance, { title: "Engineer", h1: null, text: body });

    // The extension already sent this text. Presenting an empty description
    // next to it would discard information we are holding.
    expect(job.job_description).toContain("practical AI agents");
    expect(provenance.job_description).toBe("heuristic");
  });

  it("does not use a trivially short page as a description", () => {
    const job = emptyJob();
    applyHeuristics(job, {}, { title: "Engineer", h1: null, text: "Not found" });
    expect(job.job_description).toBeNull();
  });

  it("marks everything it produces as a guess", () => {
    const job = emptyJob();
    const provenance: CaptureProvenance = {};
    applyHeuristics(job, provenance, {
      title: "Senior Engineer at Acme",
      h1: "Senior Engineer",
      text: "Full-time, fully remote.\nLocation: Berlin, Germany\nSalary: $100,000 - $140,000\n".padEnd(400, "."),
    });

    for (const value of Object.values(provenance)) expect(value).toBe("heuristic");
    expect(job.seniority).toBe("senior");
    expect(job.location_type).toBe("remote");
    expect(job.employment_type).toBe("full_time");
    expect(job.location).toBe("Berlin, Germany");
    expect(job.salary_min).toBe("100000");
  });
});
