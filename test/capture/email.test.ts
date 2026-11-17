import { describe, it, expect } from "vitest";
import { isGmailEmail, extractEmailApplication } from "@/lib/capture/email";
import { structureDeterministically } from "@/lib/capture/structure";
import type { CapturedPage } from "@/types/capture";

/**
 * Gmail application email — the source-aware path.
 *
 * A sent application email is not a job posting, and the generic extractor
 * misreads it: the <title> becomes the role ("Application"), the subject becomes
 * the company, and mail.google.com becomes the job URL. These assert the email
 * path fixes each of those against the exact example that prompted the work.
 */

const gmail = (email: CapturedPage["email"], overrides: Partial<CapturedPage> = {}): CapturedPage => ({
  url: "https://mail.google.com/mail/u/0/#sent/abc123",
  title: "Application – Project Manager – Market Research | Shivam Chaturvedi - shivam@gmail.com - Gmail",
  h1: null,
  text: "Reply Forward Application – Project Manager ... Inbox Sent",
  sections: [],
  labels: [],
  email,
  ...overrides,
});

const EMAIL: CapturedPage["email"] = {
  subject: "Application – Project Manager – Market Research | Shivam Chaturvedi",
  body: "I am writing to apply for the Project Manager – Market Research position at Sciatius Research.",
  links: [],
};

describe("isGmailEmail", () => {
  it("is true for a Gmail message with content", () => {
    expect(isGmailEmail(gmail(EMAIL))).toBe(true);
  });

  it("is false on a job board, even one that carries an email object by accident", () => {
    expect(isGmailEmail({ ...gmail(EMAIL), url: "https://jobs.example.com/view/1" })).toBe(false);
  });

  it("is false on Gmail with no open message", () => {
    expect(isGmailEmail(gmail(null))).toBe(false);
  });
});

describe("extractEmailApplication — the required example", () => {
  const app = extractEmailApplication(gmail(EMAIL));

  it("reads the role from the application sentence, not the word 'Application'", () => {
    expect(app.title).toBe("Project Manager – Market Research");
    expect(app.title).not.toMatch(/^application$/i);
  });

  it("reads the company from 'at <company>'", () => {
    expect(app.company).toBe("Sciatius Research");
  });

  it("does not treat the applicant's name as the company", () => {
    expect(app.company).not.toMatch(/shivam/i);
  });

  it("captures the email body as the description, not Gmail UI text", () => {
    expect(app.job_description).toContain("apply for the Project Manager");
    expect(app.job_description).not.toMatch(/\b(reply|forward|inbox|sent)\b/i);
  });

  it("leaves the job URL empty when the email carries no external link", () => {
    expect(app.job_url).toBeNull();
  });
});

describe("structureDeterministically routes Gmail through the email path", () => {
  const { job, provenance } = structureDeterministically(gmail(EMAIL));

  it("produces the role and company", () => {
    expect(job.title).toBe("Project Manager – Market Research");
    expect(job.company).toBe("Sciatius Research");
  });

  it("never stores mail.google.com as the job URL", () => {
    expect(job.job_url).not.toMatch(/mail\.google\.com/);
    expect(job.job_url).toBe("");
  });

  it("leaves fields the email never states null", () => {
    expect(job.location).toBeNull();
    expect(job.location_type).toBeNull();
    expect(job.employment_type).toBeNull();
    expect(job.seniority).toBeNull();
    expect(job.salary_min).toBeNull();
  });

  it("marks the source gmail and the body as page evidence", () => {
    expect(job.source).toBe("gmail");
    expect(provenance.job_description).toBe("page");
    expect(provenance.title).toBe("heuristic");
  });
});

describe("job URL from the email body", () => {
  it("uses a genuine external job link when present", () => {
    const app = extractEmailApplication(
      gmail({
        ...EMAIL,
        links: [
          "https://mail.google.com/mail/u/0/logout",
          "https://accounts.google.com/x",
          "https://boards.greenhouse.io/sciatius/jobs/4567",
        ],
      }),
    );
    expect(app.job_url).toBe("https://boards.greenhouse.io/sciatius/jobs/4567");
  });

  it("finds a bare URL written in the body text", () => {
    const app = extractEmailApplication(
      gmail({
        ...EMAIL,
        body: EMAIL.body + "\nPosting: https://careers.sciatius.com/pm-market-research",
      }),
    );
    expect(app.job_url).toBe("https://careers.sciatius.com/pm-market-research");
  });

  it("ignores google-owned and gmail links entirely", () => {
    const app = extractEmailApplication(
      gmail({ ...EMAIL, links: ["https://www.google.com/x", "https://mail.google.com/y"] }),
    );
    expect(app.job_url).toBeNull();
  });
});

describe("other application phrasings", () => {
  const cases: [string, string, string][] = [
    [
      "I am applying for the Senior Data Analyst role at Acme Corp today.",
      "Senior Data Analyst",
      "Acme Corp",
    ],
    ["This is my application for the UX Designer position at Globex.", "UX Designer", "Globex"],
    ["Please consider my application for Backend Engineer at Initech.", "Backend Engineer", "Initech"],
  ];

  for (const [body, role, company] of cases) {
    it(`parses "${body.slice(0, 40)}…"`, () => {
      const app = extractEmailApplication(gmail({ subject: "Application", body, links: [] }));
      expect(app.title).toBe(role);
      expect(app.company).toBe(company);
    });
  }
});

describe("preserves ordinary job-page extraction", () => {
  it("a non-Gmail page with no email is untouched by the email path", () => {
    const page: CapturedPage = {
      url: "https://jobs.example.com/view/1",
      title: "Staff Engineer at Acme",
      h1: "Staff Engineer",
      text: "About the role. Build things.",
      sections: [{ heading: null, level: 0, text: "About the role. We build things at scale.", blocks: 1, cells: 0 }],
      labels: [],
    };
    expect(isGmailEmail(page)).toBe(false);
    const { job } = structureDeterministically(page);
    expect(job.job_url).toBe("https://jobs.example.com/view/1");
    expect(job.title).toBe("Staff Engineer");
    expect(job.company).toBe("Acme");
  });
});
