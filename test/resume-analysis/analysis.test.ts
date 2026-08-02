import { describe, it, expect } from "vitest";
import { normalizeText } from "@/lib/resume/normalize";
import { detectSections } from "@/lib/resume/sections";
import {
  extractCertifications,
  extractEducationLevel,
  extractYearsRequired,
  parseJobDescription,
} from "@/lib/resume-analysis/JobDescriptionParser";
import { analyzeResume } from "@/lib/resume-analysis/ResumeAnalysisService";
import { WEIGHTS, ENGINE_VERSION } from "@/lib/resume-analysis/ScoreCalculator";
import type { ParsedResume } from "@/types/resume";
import { SCORE_CATEGORIES } from "@/types/resume-analysis";

/**
 * Job description parsing, matching and scoring (Resume AI · Phase 3).
 *
 * The scoring assertions deliberately pin *properties* rather than exact
 * numbers wherever the exact number is an implementation detail — a test that
 * hard-codes 73 fails on every future weight change without telling anyone
 * whether the behaviour got better or worse. Where an exact figure IS the
 * contract (weights summing to 1, a perfect match scoring 100) it is asserted
 * exactly.
 */

const RESUME_LINES = [
  "ALICE MERCER",
  "alice.mercer@example.com | +44 7700 900123 | London, UK",
  "PROFESSIONAL SUMMARY",
  "Backend engineer with eight years building payment and ledger systems.",
  "Led a team of six through a migration to event sourcing.",
  "TECHNICAL SKILLS",
  "TypeScript, Go, PostgreSQL, Kafka, Terraform, AWS",
  "WORK EXPERIENCE",
  "Acme Payments - Senior Backend Engineer (2021-2024)",
  "Rebuilt the settlement pipeline, cutting reconciliation time by 70%.",
  "Owned reliability for a service handling 12k requests per second.",
  "EDUCATION",
  "BSc Computer Science, University of Leeds (2014-2017)",
  "CERTIFICATIONS",
  "AWS Certified Solutions Architect - Professional (2023)",
];

function resume(lines: string[] = RESUME_LINES): ParsedResume {
  const normalized = normalizeText(lines.join("\n"));
  return {
    text: normalized.text,
    lines: normalized.lines,
    sections: detectSections(normalized.lines),
    pageCount: 1,
    truncated: false,
    parser: "test",
    warnings: [],
  };
}

const JD = [
  "Senior Backend Engineer",
  "Requirements:",
  "5+ years of professional backend engineering experience",
  "Strong Go and PostgreSQL",
  "Experience with Kafka and event sourcing",
  "Bachelor's degree in Computer Science or equivalent",
  "Nice-to-Have Skills:",
  "Terraform and Kubernetes",
  "Exposure to Rust",
  "Responsibilities:",
  "Own the reliability of our payment services",
  "Lead the migration to event sourcing across teams",
].join("\n");

describe("extractYearsRequired", () => {
  it("reads a digit form", () => {
    expect(extractYearsRequired("5+ years of experience").years).toBe(5);
  });

  it("reads a spelled-out form", () => {
    expect(extractYearsRequired("eight years building systems").years).toBe(8);
  });

  it("takes the lower bound of a range", () => {
    expect(extractYearsRequired("3-5 years required").years).toBe(3);
  });

  it("takes the smallest figure when several are stated", () => {
    // "5+ years overall, 3+ in Go" is satisfied at 3 for the specific ask.
    expect(extractYearsRequired("5+ years overall and 3+ years in Go").years).toBe(3);
  });

  it("quotes a whole line as evidence, not a spliced fragment", () => {
    // A fixed character window produced fragments spanning three partial lines,
    // which reads as corruption rather than as a quotation from the resume.
    const text = "alice@example.com | London\nBackend engineer with eight years building systems.\nNext line";
    const { evidence } = extractYearsRequired(text);
    expect(evidence).toBe("Backend engineer with eight years building systems.");
    expect(evidence).not.toContain("\n");
  });

  it("returns null when no figure is stated", () => {
    expect(extractYearsRequired("We want a great engineer").years).toBeNull();
  });

  it("ignores implausible figures", () => {
    expect(extractYearsRequired("founded 1998 years ago").years).not.toBe(1998);
  });
});

describe("extractEducationLevel", () => {
  it("reads each degree level", () => {
    expect(extractEducationLevel("PhD in Physics").level).toBe("doctorate");
    expect(extractEducationLevel("MSc Computer Science").level).toBe("master");
    expect(extractEducationLevel("Bachelor's degree required").level).toBe("bachelor");
    expect(extractEducationLevel("BSc Computer Science").level).toBe("bachelor");
  });

  it("prefers the highest level named", () => {
    expect(extractEducationLevel("BSc required, MSc preferred").level).toBe("master");
  });

  it("returns none when no degree is named", () => {
    expect(extractEducationLevel("Self-taught welcome").level).toBe("none");
  });
});

describe("extractCertifications", () => {
  it("finds a named certification", () => {
    const found = extractCertifications("AWS Certified Solutions Architect required");
    expect(found.join(" ")).toMatch(/AWS Certified Solutions Architect/i);
  });

  it("returns nothing when none are mentioned", () => {
    expect(extractCertifications("No certifications needed here")).toEqual([]);
  });
});

describe("parseJobDescription", () => {
  const jd = parseJobDescription(JD);

  it("reads the title from the first line", () => {
    expect(jd.title).toBe("Senior Backend Engineer");
  });

  it("attributes skills to required or preferred by their heading", () => {
    const required = jd.requiredSkills.map((s) => s.skill);
    const preferred = jd.preferredSkills.map((s) => s.skill);

    expect(required).toEqual(expect.arrayContaining(["go", "postgresql", "kafka", "event_sourcing"]));
    expect(preferred).toEqual(expect.arrayContaining(["terraform", "kubernetes", "rust"]));
    expect(required).not.toContain("rust");
  });

  it("carries the line each skill came from, so a wrong read is diagnosable", () => {
    const go = jd.requiredSkills.find((s) => s.skill === "go");
    expect(go?.evidence).toContain("Go");
  });

  it("reads the years and education requirements", () => {
    expect(jd.minYearsExperience).toBe(5);
    expect(jd.education.level).toBe("bachelor");
  });

  it("collects responsibilities from their own block only", () => {
    expect(jd.responsibilities).toHaveLength(2);
    expect(jd.responsibilities[0]).toMatch(/reliability/i);
  });

  it("does not list a skill as both required and preferred", () => {
    const required = new Set(jd.requiredSkills.map((s) => s.skill));
    expect(jd.preferredSkills.every((s) => !required.has(s.skill))).toBe(true);
  });

  it("treats text before the first heading as required", () => {
    const parsed = parseJobDescription("Backend Engineer\nYou will need strong Go and Kafka.");
    expect(parsed.requiredSkills.map((s) => s.skill)).toEqual(expect.arrayContaining(["go", "kafka"]));
  });

  it("ignores an about-the-company block", () => {
    const parsed = parseJobDescription(
      ["Engineer", "Requirements:", "Go", "About the Company", "We have been building with Rust for ten years."].join("\n"),
    );
    expect(parsed.requiredSkills.map((s) => s.skill)).not.toContain("rust");
    // The ten years belongs to the company, not the candidate.
    expect(parsed.minYearsExperience).toBeNull();
  });

  it("warns when it recognised nothing to match on", () => {
    const parsed = parseJobDescription("We want a wonderful human being to join us.");
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});

describe("scoring contract", () => {
  it("weights sum to exactly 1", () => {
    const total = Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(Math.round(total * 1000) / 1000).toBe(1);
  });

  it("covers every declared category exactly once", () => {
    const { analysis } = analyzeResume({ resume: resume(), jobDescription: JD });
    expect(analysis.breakdown.map((b) => b.category).sort()).toEqual([...SCORE_CATEGORIES].sort());
  });

  it("overall score equals the sum of contributions", () => {
    const { analysis } = analyzeResume({ resume: resume(), jobDescription: JD });
    const summed = analysis.breakdown.reduce((sum, b) => sum + b.contribution, 0);
    expect(analysis.overallScore).toBe(Math.round(summed));
  });

  it("stays within 0 and 100", () => {
    const { analysis } = analyzeResume({ resume: resume(), jobDescription: JD });
    expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
    expect(analysis.overallScore).toBeLessThanOrEqual(100);
    for (const entry of analysis.breakdown) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(100);
    }
  });

  it("every category explains itself", () => {
    const { analysis } = analyzeResume({ resume: resume(), jobDescription: JD });
    for (const entry of analysis.breakdown) {
      expect(entry.detail.length).toBeGreaterThan(10);
    }
  });
});

describe("analyzeResume — the worked example", () => {
  const { analysis, jobDescription } = analyzeResume({ resume: resume(), jobDescription: JD });

  it("matches the skills the resume genuinely lists", () => {
    const matched = analysis.skillMatches.map((m) => m.skill);
    expect(matched).toEqual(expect.arrayContaining(["go", "postgresql", "kafka", "terraform"]));
  });

  it("reports a skill the resume does not have as missing", () => {
    expect(analysis.missingSkills.map((m) => m.skill)).toContain("rust");
  });

  it("carries evidence on every match", () => {
    for (const match of analysis.skillMatches) {
      expect(match.evidence.length).toBeGreaterThan(0);
    }
  });

  it("attributes skill evidence to the section it came from", () => {
    const go = analysis.skillMatches.find((m) => m.skill === "go");
    expect(go?.section).toBe("skills");
  });

  it("reads the resume's stated years rather than inferring them", () => {
    expect(analysis.experience.resumeYears).toBe(8);
    expect(analysis.experience.derivedFrom).toBe("explicit_statement");
    expect(analysis.experience.meets).toBe(true);
  });

  it("meets the education requirement", () => {
    expect(analysis.education.resumeLevel).toBe("bachelor");
    expect(analysis.education.meets).toBe(true);
  });

  it("produces a factual summary, not a judgement", () => {
    expect(analysis.summary.headline).toMatch(/Scored \d+ out of 100/);
    expect(analysis.summary.headline).not.toMatch(/strong|excellent|great|poor/i);
  });

  it("emits no recommendations — that is the AI step's job", () => {
    expect(analysis.recommendations).toEqual([]);
  });

  it("stamps the engine version so old scores are never silently compared", () => {
    expect(analysis.engineVersion).toBe(ENGINE_VERSION);
  });

  it("exposes what it understood of the posting", () => {
    expect(jobDescription.title).toBe("Senior Backend Engineer");
  });

  it("is deterministic — the same inputs give the same score", () => {
    const again = analyzeResume({ resume: resume(), jobDescription: JD });
    expect(again.analysis.overallScore).toBe(analysis.overallScore);
    expect(again.analysis.breakdown).toEqual(analysis.breakdown);
  });
});

describe("analyzeResume — edges", () => {
  it("scores a resume that matches nothing well below one that matches", () => {
    const irrelevant = resume([
      "BOB SMITH",
      "PROFESSIONAL SUMMARY",
      "Pastry chef with a passion for laminated dough.",
      "TECHNICAL SKILLS",
      "Viennoiserie, chocolate tempering",
    ]);

    const poor = analyzeResume({ resume: irrelevant, jobDescription: JD }).analysis;
    const good = analyzeResume({ resume: resume(), jobDescription: JD }).analysis;

    expect(poor.overallScore).toBeLessThan(good.overallScore);
    expect(poor.missingSkills.length).toBeGreaterThan(0);
  });

  it("does not punish the candidate for what the posting never asked", () => {
    // A posting naming no degree must not score education as a failure.
    const vague = analyzeResume({
      resume: resume(),
      jobDescription: "Backend Engineer\nRequirements:\nStrong Go",
    }).analysis;

    const education = vague.breakdown.find((b) => b.category === "education");
    expect(education?.score).toBe(100);
    expect(education?.detail).toMatch(/did not state/i);
  });

  it("lowers confidence when the posting gave little to match on", () => {
    const vague = analyzeResume({
      resume: resume(),
      jobDescription: "We want a wonderful human being to join our team.",
    }).analysis;

    expect(vague.confidence.value).toBeLessThan(1);
    expect(vague.confidence.reasons.length).toBeGreaterThan(0);
  });

  it("keeps confidence high when both documents are substantial", () => {
    const { analysis } = analyzeResume({ resume: resume(), jobDescription: JD });
    expect(analysis.confidence.value).toBeGreaterThanOrEqual(0.8);
  });

  it("handles an empty job description without throwing", () => {
    const { analysis } = analyzeResume({ resume: resume(), jobDescription: "" });
    expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
    expect(analysis.confidence.value).toBeLessThan(1);
  });

  it("handles an empty resume without throwing", () => {
    const empty: ParsedResume = {
      text: "", lines: [], sections: [], pageCount: null,
      truncated: false, parser: "test", warnings: [],
    };
    const { analysis } = analyzeResume({ resume: empty, jobDescription: JD });
    expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
    expect(analysis.confidence.value).toBeLessThan(1);
  });
});
