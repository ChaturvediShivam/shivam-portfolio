import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { structureDeterministically } from "@/lib/capture/structure";
import type { CapturedPage, CapturedSection } from "@/types/capture";

/**
 * The capture scenarios that matter, one per real-world shape of job page.
 *
 * Numbered against the acceptance list so a gap is visible rather than implied.
 * The theme running through all of them: a page states what it states. Where it
 * is explicit, capture it; where it is silent, leave the field null and let the
 * person fill it in. Every assertion below is either "this was found" or "this
 * was NOT invented", and the second kind is the one that keeps the review step
 * honest.
 */

const section = (heading: string | null, text: string, level = 2): CapturedSection => ({ heading, level, text });

function page(overrides: Partial<CapturedPage> = {}): CapturedPage {
  return {
    url: "https://jobs.example.com/view/1",
    title: "Engineer at Acme",
    text: "",
    jsonLd: [],
    sections: [],
    labels: [],
    meta: {},
    ...overrides,
  };
}

/** Deterministic capture only — no provider involved anywhere in this file. */
const capture = (p: CapturedPage) => structureDeterministically(p);

describe("1. highly structured page (schema.org JobPosting)", () => {
  it("takes every field the employer published and marks it structured", () => {
    const { job, provenance } = capture(
      page({
        jsonLd: [
          {
            "@type": "JobPosting",
            title: "Staff Platform Engineer",
            hiringOrganization: { name: "Globex" },
            jobLocation: { address: { addressLocality: "Berlin", addressCountry: "Germany" } },
            employmentType: "FULL_TIME",
            baseSalary: { currency: "EUR", value: { minValue: 90000, maxValue: 120000 } },
            description: "<p>Own the platform.</p>",
            validThrough: "2026-12-01",
          },
        ],
      }),
    );

    expect(job.title).toBe("Staff Platform Engineer");
    expect(job.company).toBe("Globex");
    expect(job.location).toBe("Berlin, Germany");
    expect(job.salary_min).toBe("90000");
    expect(job.salary_currency).toBe("EUR");
    expect(job.deadline_at).toBe("2026-12-01");
    expect(provenance.title).toBe("structured");
  });
});

describe("2. detailed job description", () => {
  it("captures the substance, not a summary of it", () => {
    const { job } = capture(
      page({
        sections: [
          section(null, "We are hiring an Applied AI Engineer to build production LLM systems."),
          section("Responsibilities", "• Build agents\n• Ship evaluation harnesses\n• Operate services"),
          section("Required Skills", "• TypeScript\n• Postgres\n• Retrieval systems"),
          section("Nice-to-Have Skills", "• Kubernetes\n• Terraform"),
          section("About the Company", "We build financial products used across South East Asia."),
        ],
      }),
    );

    // Every section present, bullets intact. The description is evidence read
    // later to prepare for an interview, so it is kept as written.
    for (const fragment of [
      "production LLM systems",
      "• Ship evaluation harnesses",
      "• Retrieval systems",
      "• Kubernetes",
      "financial products",
    ]) {
      expect(job.job_description, fragment).toContain(fragment);
    }
    expect(job.job_description!.length).toBeGreaterThan(200);
  });
});

describe("3. minimal page", () => {
  it("captures the little there is and invents nothing", () => {
    const { job } = capture(page({ title: "Bookkeeper at Tiny Co", sections: [], text: "" }));

    expect(job.job_url).toBeTruthy();
    expect(job.job_description).toBeNull();
    expect(job.salary_min).toBeNull();
    expect(job.seniority).toBeNull();
  });
});

describe("4-6. work arrangement", () => {
  it("4. reads remote from a labelled field", () => {
    const { job, provenance } = capture(page({ labels: [{ label: "Work Type", value: "Remote" }] }));
    expect(job.location_type).toBe("remote");
    expect(provenance.location_type).toBe("page");
  });

  it("5. reads onsite from a labelled field", () => {
    const { job } = capture(page({ labels: [{ label: "Workplace", value: "On-site" }] }));
    expect(job.location_type).toBe("onsite");
  });

  it("6. reads hybrid from a labelled field", () => {
    const { job } = capture(page({ labels: [{ label: "Work Type", value: "Hybrid" }] }));
    expect(job.location_type).toBe("hybrid");
  });

  it("prefers hybrid when a posting says both, because hybrid is the narrower claim", () => {
    const { job } = capture(page({ text: "Hybrid role with some remote days each week." }));
    expect(job.location_type).toBe("hybrid");
  });
});

describe("7-8. salary", () => {
  it("7. reads a stated range with its currency", () => {
    const { job, provenance } = capture(page({ labels: [{ label: "Salary", value: "$120,000 - $160,000" }] }));
    expect(job.salary_min).toBe("120000");
    expect(job.salary_max).toBe("160000");
    expect(job.salary_currency).toBe("USD");
    expect(provenance.salary_min).toBe("page");
  });

  it("8. leaves salary null when the page does not state one", () => {
    const { job } = capture(
      page({ sections: [section("Compensation", "We offer a competitive salary and meaningful equity.")] }),
    );
    expect(job.salary_min).toBeNull();
    expect(job.salary_max).toBeNull();
    expect(job.salary_currency).toBeNull();
  });

  it("8b. leaves salary null when the page explicitly says it is not specified", () => {
    const { job } = capture(page({ labels: [{ label: "Salary", value: "Not specified" }] }));
    expect(job.salary_min).toBeNull();
  });
});

describe("9-10. seniority", () => {
  it("9. prefers an explicitly labelled level over the role title", () => {
    const { job, provenance } = capture(
      page({ title: "Senior Engineer at Acme", labels: [{ label: "Experience", value: "Mid-Level" }] }),
    );
    // The label is what the employer filled in; the title word is incidental.
    expect(job.seniority).toBe("mid");
    expect(provenance.seniority).toBe("page");
  });

  it("10. leaves seniority null when neither the label nor the title says", () => {
    const { job } = capture(page({ title: "Applied AI Engineer at Bjak" }));
    expect(job.seniority).toBeNull();
  });

  it("10b. falls back to the title, marked as the guess it is", () => {
    const { job, provenance } = capture(page({ title: "Staff Engineer at Acme" }));
    expect(job.seniority).toBe("staff");
    expect(provenance.seniority).toBe("heuristic");
  });
});

describe("11. description spread across multiple sections", () => {
  it("combines them in document order", () => {
    const { job } = capture(
      page({
        sections: [
          section("The Role", "You will design and operate our data ingestion platform end to end."),
          section("What you'll do", "• Build pipelines\n• Own reliability"),
          section("What we're looking for", "• 5 years of backend experience"),
          section("Benefits", "Health cover, learning budget, and four weeks of paid leave."),
        ],
      }),
    );

    const d = job.job_description!;
    expect(d.indexOf("The Role")).toBeLessThan(d.indexOf("What you'll do"));
    expect(d.indexOf("What you'll do")).toBeLessThan(d.indexOf("What we're looking for"));
    expect(d).toContain("Health cover");
  });
});

describe("12. sidebar summary card", () => {
  it("reads the card into fields without letting it into the description", () => {
    const { job } = capture(
      page({
        labels: [
          { label: "Company", value: "Bjak" },
          { label: "Employment", value: "Full-time" },
          { label: "Experience", value: "Mid-Level" },
          { label: "Location", value: "Kuala Lumpur, Malaysia" },
        ],
        sections: [section(null, "We are hiring an Applied AI Engineer to build production systems.")],
      }),
    );

    expect(job.company).toBe("Bjak");
    expect(job.employment_type).toBe("full_time");
    expect(job.seniority).toBe("mid");
    expect(job.location).toBe("Kuala Lumpur, Malaysia");
    expect(job.job_description).not.toContain("Employment");
  });
});

describe("13-15. board editorial and stray words", () => {
  it("13. excludes the board's own commentary from the description", () => {
    const { job } = capture(
      page({
        sections: [
          section("Responsibilities", "Build and operate the retrieval systems behind our product."),
          section("Editorial Analysis", "Our view: this role suits someone moving from research into production."),
          section("Growth Opportunities", "This position could lead to a staff-level track within two years."),
          section("Application Guide", "Tailor your CV and mention the specific systems you have run."),
        ],
      }),
    );

    expect(job.job_description).toContain("retrieval systems");
    expect(job.job_description).not.toContain("Our view");
    expect(job.job_description).not.toContain("staff-level track");
    expect(job.job_description).not.toContain("Tailor your CV");
  });

  it("14. does not read 'Written by Surely Remote' as a remote role", () => {
    const { job } = capture(
      page({
        title: "Applied AI Engineer at Bjak",
        text: "Written by Surely Remote\n\nThis role focuses on building practical AI agents for the team.",
      }),
    );
    expect(job.location_type).toBeNull();
  });

  it("15. ignores 'remote' appearing in unrelated prose", () => {
    const { job } = capture(
      page({
        title: "Field Technician at Acme",
        text: "We service equipment in remote parts of the country, often far from major towns.",
      }),
    );
    expect(job.location_type).toBeNull();
  });
});

describe("19. dynamic / client-rendered page", () => {
  it("works from sections alone when there is no structured data or metadata", () => {
    // LinkedIn and most modern boards render job views client-side and publish
    // neither JobPosting nor og: tags. Sections are all there is.
    const { job, provenance } = capture(
      page({
        title: "Machine Learning Engineer | Initech",
        h1: "Machine Learning Engineer",
        jsonLd: [],
        meta: {},
        sections: [
          section(null, "Initech is looking for an ML engineer to own model serving infrastructure."),
          section("Requirements", "• Python\n• Kubernetes\n• 4+ years in production ML"),
        ],
      }),
    );

    expect(job.title).toBe("Machine Learning Engineer");
    expect(job.company).toBe("Initech");
    expect(job.job_description).toContain("model serving infrastructure");
    expect(job.job_description).toContain("• Kubernetes");
    expect(provenance.title).toBe("heuristic");
  });
});

describe("16-18. AI is an enhancement, never a dependency", () => {
  const ENV = { ...process.env };

  beforeEach(() => vi.resetModules());
  afterEach(() => {
    process.env = { ...ENV };
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/ai/gateway");
    vi.doUnmock("@/lib/ai/providers");
  });

  /**
   * Stand in for the provider resolver as well as the gateway.
   *
   * `getAiProvider()` throws when no API key is configured, which is the state
   * of the test environment. Without this the resolver throws first and every
   * one of these tests passes down the error path — including the ones meant to
   * prove the model's output is applied. Mocking it is what makes the
   * distinction testable at all.
   */
  function mockGateway(complete: () => Promise<unknown>) {
    vi.doMock("@/lib/ai/providers", () => ({ getAiProvider: () => ({ name: "test" }) }));
    vi.doMock("@/lib/ai/gateway", () => ({ AiGateway: class { complete = complete; } }));
  }

  /** A page whose fields are all deterministically available. */
  const rich = () =>
    page({
      title: "Applied AI Engineer at Bjak",
      h1: "Applied AI Engineer",
      labels: [
        { label: "Employment", value: "Full-time" },
        { label: "Experience", value: "Mid-Level" },
        { label: "Work Type", value: "Remote" },
      ],
      sections: [
        section(null, "This role focuses on building practical AI agents and automations."),
        section("Responsibilities", "• Build agents\n• Ship features"),
      ],
      text: "This role focuses on building practical AI agents and automations. ".repeat(6),
    });

  /** Every deterministic field survived, whatever the provider did. */
  function expectDeterministicIntact(result: { job: Record<string, unknown> }) {
    expect(result.job.title).toBe("Applied AI Engineer");
    expect(result.job.company).toBe("Bjak");
    expect(result.job.employment_type).toBe("full_time");
    expect(result.job.seniority).toBe("mid");
    expect(result.job.location_type).toBe("remote");
    expect(result.job.job_url).toBeTruthy();
    expect(String(result.job.job_description)).toContain("practical AI agents");
  }

  it("18. keeps everything when the AI flag is off", async () => {
    process.env.FEATURE_AI = "false";
    process.env.FEATURE_RESUME_AI = "false";
    const { structureCapture } = await import("@/lib/capture/structure");
    const { createSupabaseStub } = await import("@/test/stubs/supabase");

    const result = await structureCapture(createSupabaseStub({}).client, "owner-1", rich());

    expectDeterministicIntact(result);
    expect(result.deterministicOnly).toBe(true);
    expect(result.notice).toMatch(/AI structuring is off/i);
  });

  it("16. keeps everything when the provider throws", async () => {
    process.env.FEATURE_AI = "true";
    process.env.FEATURE_RESUME_AI = "true";
    mockGateway(() => Promise.reject(new Error("provider unreachable")));

    const { structureCapture } = await import("@/lib/capture/structure");
    const { createSupabaseStub } = await import("@/test/stubs/supabase");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await structureCapture(createSupabaseStub({}).client, "owner-1", rich());

    // The regression this guards: a failing provider used to collapse the whole
    // capture to a near-empty object and discard page content already in hand.
    expectDeterministicIntact(result);
    expect(result.notice).toMatch(/unavailable/i);
  });

  it("17. keeps everything when the model returns a malformed reply", async () => {
    process.env.FEATURE_AI = "true";
    process.env.FEATURE_RESUME_AI = "true";
    mockGateway(() => Promise.resolve({ stopReason: "end_turn", parsed: null }));

    const { structureCapture } = await import("@/lib/capture/structure");
    const { createSupabaseStub } = await import("@/test/stubs/supabase");

    const result = await structureCapture(createSupabaseStub({}).client, "owner-1", rich());

    expectDeterministicIntact(result);
    expect(result.deterministicOnly).toBe(true);
  });

  it("never lets the model overwrite what the page stated", async () => {
    process.env.FEATURE_AI = "true";
    process.env.FEATURE_RESUME_AI = "true";
    mockGateway(() =>
      Promise.resolve({
        stopReason: "end_turn",
        parsed: {
          is_job_posting: true,
          title: "WRONG ROLE",
          company: "WRONG COMPANY",
          employment_type: "contract",
          seniority: "principal",
          location_type: "onsite",
          job_description: "A short summary that would replace the real posting.",
          location: "Somewhere Else",
          skills: ["TypeScript"],
        },
      }),
    );

    const { structureCapture } = await import("@/lib/capture/structure");
    const { createSupabaseStub } = await import("@/test/stubs/supabase");

    const result = await structureCapture(createSupabaseStub({}).client, "owner-1", rich());

    expectDeterministicIntact(result);
    // Only genuinely empty slots are the model's to fill.
    expect(result.job.location).toBe("Somewhere Else");
    expect(result.provenance.location).toBe("ai");
    expect(result.provenance.title).not.toBe("ai");
  });
});
