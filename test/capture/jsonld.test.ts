import { describe, it, expect } from "vitest";
import { fromJsonLd, stripHtml } from "@/lib/capture/jsonld";

/**
 * schema.org JobPosting extraction.
 *
 * This is the highest-value path in capture: Greenhouse, Lever, Ashby, Workday
 * and most company career pages publish a JobPosting block because Google for
 * Jobs requires one. When it is present, capture costs nothing and the values
 * are the employer's own — so every field it can fill is a field the model is
 * never asked to guess at.
 *
 * The input is third-party markup from an arbitrary page. It is malformed,
 * doubly-nested, wrapped in an `@graph`, or a string where an object was
 * promised. None of that may throw: a broken block must degrade to "found
 * nothing", because the capture still has the page text to fall back on.
 */

const POSTING = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Senior AI Engineer",
  description: "<p>Build things.</p><ul><li>TypeScript</li><li>Postgres</li></ul>",
  hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
  jobLocation: { "@type": "Place", address: { addressLocality: "Bengaluru", addressCountry: "India" } },
  employmentType: "FULL_TIME",
  validThrough: "2026-09-30",
  baseSalary: { "@type": "MonetaryAmount", currency: "INR", value: { minValue: 2000000, maxValue: 3500000 } },
};

describe("fromJsonLd", () => {
  it("extracts a complete posting and marks every field as page-sourced", () => {
    const { job, provenance } = fromJsonLd([POSTING]);

    expect(job.title).toBe("Senior AI Engineer");
    expect(job.company).toBe("Acme Corp");
    expect(job.location).toBe("Bengaluru, India");
    expect(job.employment_type).toBe("FULL_TIME");
    expect(job.deadline_at).toBe("2026-09-30");
    expect(job.salary_min).toBe("2000000");
    expect(job.salary_max).toBe("3500000");
    expect(job.salary_currency).toBe("INR");
    expect(job.job_description).toContain("Build things.");

    for (const key of ["title", "company", "location", "salary_min"] as const) {
      expect(provenance[key]).toBe("page");
    }
  });

  it("finds the posting inside an @graph wrapper", () => {
    const { job } = fromJsonLd([{ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, POSTING] }]);
    expect(job.title).toBe("Senior AI Engineer");
  });

  it("finds the posting when @type is an array", () => {
    const { job } = fromJsonLd([{ ...POSTING, "@type": ["JobPosting", "Thing"] }]);
    expect(job.company).toBe("Acme Corp");
  });

  it("accepts hiringOrganization given as a bare string", () => {
    const { job } = fromJsonLd([{ ...POSTING, hiringOrganization: "Globex" }]);
    expect(job.company).toBe("Globex");
  });

  it("takes the first entry when jobLocation is an array", () => {
    const { job } = fromJsonLd([
      { ...POSTING, jobLocation: [{ address: { addressLocality: "Pune" } }, { address: { addressLocality: "Delhi" } }] },
    ]);
    expect(job.location).toBe("Pune");
  });

  it("reads a flat baseSalary without a nested value object", () => {
    const { job } = fromJsonLd([{ ...POSTING, baseSalary: { currency: "USD", value: 150000 } }]);
    expect(job.salary_min).toBe("150000");
    expect(job.salary_currency).toBe("USD");
  });

  it("maps TELECOMMUTE to remote and leaves work type alone otherwise", () => {
    expect(fromJsonLd([{ ...POSTING, jobLocationType: "TELECOMMUTE" }]).job.location_type).toBe("remote");
    expect(fromJsonLd([POSTING]).job.location_type).toBeUndefined();
  });

  it("reports nothing found rather than throwing on hostile or broken input", () => {
    // Every one of these has been seen in the wild on a real careers page.
    const hostile: unknown[][] = [
      [],
      [null],
      ["a string, not an object"],
      [{ "@type": "Organization", name: "Not a posting" }],
      [{ "@type": "JobPosting" }],
      [{ "@type": "JobPosting", hiringOrganization: 42, jobLocation: "somewhere", baseSalary: "lots" }],
      [{ "@graph": "not an array" }],
    ];
    for (const blocks of hostile) {
      expect(() => fromJsonLd(blocks)).not.toThrow();
    }
    expect(fromJsonLd([{ "@type": "Organization" }]).job).toEqual({});
  });

  it("omits fields the posting left blank instead of recording empty strings", () => {
    const { job, provenance } = fromJsonLd([{ "@type": "JobPosting", title: "Role", description: "   " }]);
    expect(job.title).toBe("Role");
    expect(job).not.toHaveProperty("company");
    expect(provenance.company).toBeUndefined();
  });

  it("does not recurse forever on a self-referencing @graph", () => {
    const loop: Record<string, unknown> = { "@type": "Thing" };
    loop["@graph"] = [loop];
    expect(() => fromJsonLd([loop])).not.toThrow();
  });
});

describe("stripHtml", () => {
  it("keeps the paragraphing that makes a posting readable", () => {
    const out = stripHtml("<p>One</p><p>Two</p><ul><li>A</li><li>B</li></ul>");
    expect(out).toContain("One");
    expect(out).toContain("• A");
    expect(out.split("\n").length).toBeGreaterThan(2);
  });

  it("drops script and style bodies rather than inlining their source", () => {
    const out = stripHtml("<p>Real</p><script>alert(1)</script><style>.x{color:red}</style>");
    expect(out).toContain("Real");
    expect(out).not.toContain("alert");
    expect(out).not.toContain("color:red");
  });

  it("decodes the entities that appear in every real posting", () => {
    expect(stripHtml("<p>R&amp;D &nbsp;&quot;team&quot; &lt;3</p>")).toBe('R&D "team" <3');
  });
});
