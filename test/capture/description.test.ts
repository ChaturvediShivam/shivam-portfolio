import { describe, it, expect } from "vitest";
import { structureDeterministically } from "@/lib/capture/structure";
import { trimAtEditorialBoundary, looksLikeFieldCard } from "@/lib/capture/sections";
import type { CapturedPage, CapturedSection } from "@/types/capture";

/**
 * Job-description boundary detection, across the shapes real postings take.
 *
 * The field has one job: hold the employer's own words, all of them, and
 * nothing else. Both halves of that are tested here — what must appear, and
 * what must not — because a description that quietly includes the board's
 * commentary is as wrong as one that quietly drops a section, and only the
 * second kind is obvious when you look at it.
 */

const section = (heading: string | null, text: string, level = 2, extra: Partial<CapturedSection> = {}): CapturedSection => ({
  heading,
  level,
  text,
  ...extra,
});

function page(overrides: Partial<CapturedPage> = {}): CapturedPage {
  return { url: "https://jobs.example.com/1", title: "Engineer at Acme", text: "", jsonLd: [], sections: [], labels: [], meta: {}, ...overrides };
}

const describeOf = (p: CapturedPage) => structureDeterministically(p).job.job_description ?? "";

describe("1. explicit 'Job Description' heading", () => {
  it("captures the section in full", () => {
    const d = describeOf(
      page({ sections: [section("Job Description", "You will own our billing platform and the services around it.")] }),
    );
    expect(d).toContain("own our billing platform");
  });
});

describe("2. 'About the Role' and its variants", () => {
  it("recognises the wordings boards actually use", () => {
    for (const heading of ["About the Role", "About this Role", "About the Position", "Role Overview", "Position Overview", "The Role"]) {
      const d = describeOf(page({ sections: [section(heading, "You will design and run our data platform end to end.")] }));
      expect(d, heading).toContain("design and run our data platform");
    }
  });
});

describe("3. no description heading at all", () => {
  it("keeps a substantial paragraph sitting under the title", () => {
    // The lead block, exactly as the live page presents it.
    const d = describeOf(
      page({
        sections: [section(null, "This role focuses on building practical AI agents, workflows, and automations.", 0)],
      }),
    );
    expect(d).toContain("practical AI agents");
  });

  it("still rejects a bare company name in that position", () => {
    expect(describeOf(page({ sections: [section(null, "BJAK", 0)] }))).toBe("");
  });
});

describe("4 & 14. short descriptions are still descriptions", () => {
  it("keeps a one-sentence posting under a heading, with no length floor", () => {
    const d = describeOf(page({ sections: [section("Job Description", "Run our support desk.")] }));
    expect(d).toContain("Run our support desk.");
  });

  it("keeps a very short overview", () => {
    const d = describeOf(page({ sections: [section("Overview", "Own the mobile app.")] }));
    expect(d).toContain("Own the mobile app.");
  });
});

describe("5. responsibilities and requirements only", () => {
  it("captures both with their bullets", () => {
    const d = describeOf(
      page({
        sections: [
          section("Responsibilities", "• Ship features\n• Operate services"),
          section("Requirements", "• 5 years experience\n• Go or Rust"),
        ],
      }),
    );
    expect(d).toContain("• Ship features");
    expect(d).toContain("• Go or Rust");
  });
});

describe("6. nested headings", () => {
  it("keeps a parent heading whose content lives under its children", () => {
    const d = describeOf(
      page({
        sections: [
          section("Skills & Requirements", "", 2),
          section("Required Skills", "• Python\n• SQL", 3),
          section("Nice to Have", "• Terraform", 3),
        ],
      }),
    );
    expect(d).toContain("Skills & Requirements");
    expect(d).toContain("• Python");
    expect(d).toContain("• Terraform");
  });

  it("drops an empty heading that leads nowhere", () => {
    const d = describeOf(
      page({ sections: [section("Responsibilities", "• Ship features", 2), section("Follow us", "", 2)] }),
    );
    expect(d).not.toContain("Follow us");
  });
});

describe("7. bullet-heavy postings", () => {
  it("preserves every bullet rather than collapsing them into prose", () => {
    const bullets = Array.from({ length: 14 }, (_, i) => `• Requirement number ${i + 1}`).join("\n");
    const d = describeOf(page({ sections: [section("Requirements", bullets)] }));
    expect((d.match(/^• /gm) ?? []).length).toBe(14);
  });
});

describe("8 & 9. dl and table job details", () => {
  it("reads <dl> pairs into fields without putting them in the description", () => {
    const { job } = structureDeterministically(
      page({
        labels: [
          { label: "Employment type", value: "Contract" },
          { label: "Salary", value: "£90,000 - £120,000" },
        ],
        sections: [section("Job Description", "Build the reporting pipeline for our finance team.")],
      }),
    );
    expect(job.employment_type).toBe("contract");
    expect(job.salary_currency).toBe("GBP");
    expect(job.job_description).not.toContain("Employment type");
  });

  it("reads a two-column table the same way", () => {
    const { job, provenance } = structureDeterministically(
      page({ labels: [{ label: "Location", value: "Dublin, Ireland" }, { label: "Experience", value: "Senior" }] }),
    );
    expect(job.location).toBe("Dublin, Ireland");
    expect(job.seniority).toBe("senior");
    expect(provenance.location).toBe("page");
  });
});

describe("10. editorial content is excluded", () => {
  it("drops board sections while keeping the posting", () => {
    const d = describeOf(
      page({
        sections: [
          section("Responsibilities", "• Build the ingestion pipeline"),
          section("Editorial Analysis", "Our reading of this role and who it suits."),
          section("Application Guide", "Tailor your CV before applying to this one."),
          section("Growth Opportunities", "Where this role could take you in three years."),
        ],
      }),
    );
    expect(d).toContain("• Build the ingestion pipeline");
    expect(d).not.toMatch(/Our reading|Tailor your CV|could take you/);
  });
});

describe("11. 'remote' in unrelated prose", () => {
  it("does not set work type from a passing mention", () => {
    const { job } = structureDeterministically(
      page({ sections: [section("Job Description", "We maintain equipment in remote parts of the country.")] }),
    );
    expect(job.location_type).toBeNull();
  });
});

describe("12 & 13. 'Job Summary' cuts both ways", () => {
  it("treats the employer's own summary prose as description", () => {
    const d = describeOf(
      page({
        sections: [
          section("Job Summary", "We are seeking an engineer to lead our platform work and mentor the team as we grow."),
        ],
      }),
    );
    expect(d).toContain("lead our platform work");
  });

  it("treats a generated field card as metadata", () => {
    const card = section("Job Summary", "Company\nAcme\nEmployment\nFull-time\nExperience\nSenior\nPosted\nToday", 2, {
      blocks: 8,
      cells: 8,
    });
    const { job } = structureDeterministically(
      page({ sections: [section("Responsibilities", "• Build things that last"), card] }),
    );
    expect(job.job_description).not.toContain("Posted");
    // Still read: the card is where the fields live.
    expect(job.employment_type).toBe("full_time");
    expect(job.seniority).toBe("senior");
  });

  it("identifies a card by its shape rather than its heading", () => {
    expect(looksLikeFieldCard(section("x", "Company\nAcme\nEmployment\nFull-time"))).toBe(true);
    expect(looksLikeFieldCard(section("x", "We are hiring an engineer to build and run our platform."))).toBe(false);
  });
});

describe("15. very long descriptions survive intact", () => {
  it("does not truncate a 6,000-character posting", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} describing the work in detail. `.repeat(3)).join("\n\n");
    const d = describeOf(page({ sections: [section("Job Description", long)] }));
    expect(d.length).toBeGreaterThan(4000);
    expect(d).toContain("Paragraph 39");
  });
});

describe("16 & 17. with and without JSON-LD", () => {
  it("uses the JobPosting description when the employer published one", () => {
    const { job, provenance } = structureDeterministically(
      page({
        jsonLd: [{ "@type": "JobPosting", title: "Engineer", description: "<p>Own the platform.</p><ul><li>Go</li></ul>" }],
      }),
    );
    expect(job.job_description).toContain("Own the platform.");
    expect(job.job_description).toContain("• Go");
    expect(provenance.job_description).toBe("structured");
  });

  it("falls back to sections when there is none", () => {
    const { job, provenance } = structureDeterministically(
      page({ jsonLd: [], sections: [section("Job Description", "Own the platform and the team around it.")] }),
    );
    expect(job.job_description).toContain("Own the platform");
    expect(provenance.job_description).toBe("page");
  });
});

describe("last-resort raw text is still cut at the editorial boundary", () => {
  it("keeps the posting and drops everything from the first board heading on", () => {
    const raw = [
      "Applied AI Engineer",
      "This role focuses on building practical AI agents and automations for the team.",
      "Editorial Analysis",
      "Our take on why this role matters right now.",
      "Written by Surely Remote",
    ].join("\n");

    expect(trimAtEditorialBoundary(raw)).toContain("practical AI agents");
    expect(trimAtEditorialBoundary(raw)).not.toContain("Our take");
    expect(trimAtEditorialBoundary(raw)).not.toContain("Written by Surely Remote");
  });

  it("leaves a posting with no editorial alone", () => {
    const raw = "Engineer\nBuild and operate our services.";
    expect(trimAtEditorialBoundary(raw)).toBe(raw);
  });

  it("does not cut on an editorial phrase buried inside a sentence", () => {
    // A heading is a short line of its own. The same words mid-paragraph are prose.
    const raw = "We will ask for an analysis of your previous work during the interview process here.";
    expect(trimAtEditorialBoundary(raw)).toBe(raw);
  });

  it("is what protects a page with no sections at all", () => {
    // The path taken by an older extension build, or a page the walker cannot read.
    const d = describeOf(
      page({
        sections: [],
        text: "Applied AI Engineer\nThis role focuses on building practical AI agents and automations.\nEditorial Analysis\nOur commentary about the role.",
      }),
    );
    expect(d).toContain("practical AI agents");
    expect(d).not.toContain("Our commentary");
  });
});

describe("label scope vs prose scope", () => {
  it("reads a label from anywhere on the page", () => {
    // "Employment: Full-time" states a fact about the job wherever it sits.
    const { job } = structureDeterministically(
      page({
        sections: [section("Responsibilities", "• Build things")],
        text: "Responsibilities\n• Build things\nWritten by Some Board\nJob Summary\nEmployment\nFull-time\nExperience\nSenior",
      }),
    );
    expect(job.employment_type).toBe("full_time");
    expect(job.seniority).toBe("senior");
  });

  it("refuses to infer work type from prose outside the employer's sections", () => {
    // The board's analysis says, in as many words, that the role is fully
    // remote. It is still the board talking.
    const { job } = structureDeterministically(
      page({
        sections: [
          section("Responsibilities", "• Build things"),
          section("Remote Readiness Overview", "The role is fully remote, with a distributed team."),
        ],
        text: "Responsibilities\n• Build things\nRemote Readiness Overview\nThe role is fully remote, with a distributed team.",
      }),
    );
    expect(job.location_type).toBeNull();
  });

  it("does infer work type when the employer's own section says it", () => {
    const { job, provenance } = structureDeterministically(
      page({
        sections: [section("About the Role", "This is a fully remote position open across India.")],
      }),
    );
    expect(job.location_type).toBe("remote");
    expect(provenance.location_type).toBe("heuristic");
  });
});
