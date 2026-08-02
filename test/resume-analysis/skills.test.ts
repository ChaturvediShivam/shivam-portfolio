import { describe, it, expect } from "vitest";
import { detectSkills, findEvidence, relate, skillLabel } from "@/lib/resume-analysis/SkillMatcher";

/**
 * Skill recognition (Resume AI · Phase 3).
 *
 * Weighted heavily toward false positives. A skill credited to a resume that
 * never claimed it inflates the score with evidence that does not exist — the
 * single most damaging error this module can make, and the one substring
 * matching produces constantly.
 */

describe("detectSkills — recognition", () => {
  it("finds a skill by its canonical name", () => {
    expect(detectSkills("Experienced with PostgreSQL")).toContain("postgresql");
  });

  it("finds a skill by alias", () => {
    expect(detectSkills("We run k8s in production")).toContain("kubernetes");
    expect(detectSkills("Strong TS and JS")).toEqual(expect.arrayContaining(["typescript", "javascript"]));
    expect(detectSkills("Postgres and Mongo")).toEqual(expect.arrayContaining(["postgresql", "mongodb"]));
  });

  it("finds multi-word skills", () => {
    expect(detectSkills("Deep Amazon Web Services background")).toContain("aws");
    expect(detectSkills("We practise continuous delivery")).toContain("ci_cd");
  });

  it("prefers the longest matching phrase", () => {
    // "google cloud platform" must win over "google cloud"; both map to gcp,
    // so the assertion is that exactly one skill is credited.
    expect(detectSkills("Google Cloud Platform")).toEqual(["gcp"]);
  });

  it("recognises technologies whose names contain punctuation", () => {
    expect(detectSkills("Built in C++")).toContain("cpp");
    expect(detectSkills("A C# service")).toContain("csharp");
    expect(detectSkills("Node.js backend")).toContain("nodejs");
  });

  it("is case-insensitive", () => {
    expect(detectSkills("KAFKA")).toEqual(detectSkills("kafka"));
  });

  it("returns a stable order regardless of how the text was written", () => {
    const a = detectSkills("Kafka, Go, React");
    const b = detectSkills("React, Kafka, Go");
    expect(a).toEqual(b);
  });
});

describe("detectSkills — false positives", () => {
  it("does not match a skill inside a longer word", () => {
    // The canonical failure: "go" inside "going", "java" inside "javascript".
    expect(detectSkills("We are going to the office")).not.toContain("go");
    expect(detectSkills("Ruby-adjacent rubygems tooling")).not.toContain("php");
  });

  it("does not credit Java when only JavaScript is present", () => {
    const found = detectSkills("Strong JavaScript developer");
    expect(found).toContain("javascript");
    expect(found).not.toContain("java");
  });

  it("does not credit React when only preact-like words appear", () => {
    expect(detectSkills("We had a reaction to the change")).not.toContain("react");
  });

  it("returns nothing for text naming no skills", () => {
    expect(detectSkills("A motivated professional seeking new challenges")).toEqual([]);
    expect(detectSkills("")).toEqual([]);
  });
});

describe("relate", () => {
  it("reports an exact match", () => {
    expect(relate("go", new Set(["go", "kafka"]))).toBe("exact");
  });

  it("reports a related match through the curated implication graph", () => {
    // Knowing Kubernetes is real evidence of Docker.
    expect(relate("docker", new Set(["kubernetes"]))).toBe("related");
    expect(relate("sql", new Set(["postgresql"]))).toBe("related");
    expect(relate("javascript", new Set(["typescript"]))).toBe("related");
  });

  it("does not invert the implication", () => {
    // SQL does not evidence PostgreSQL, and JavaScript does not evidence
    // TypeScript. Treating implication as symmetric would credit specifics the
    // resume never claimed.
    expect(relate("postgresql", new Set(["sql"]))).toBe("none");
    expect(relate("typescript", new Set(["javascript"]))).toBe("none");
    expect(relate("kubernetes", new Set(["docker"]))).toBe("none");
  });

  it("reports none when nothing relates", () => {
    expect(relate("rust", new Set(["go", "python"]))).toBe("none");
    expect(relate("rust", new Set())).toBe("none");
  });
});

describe("findEvidence", () => {
  it("returns the line the skill appears on", () => {
    const lines = ["ALICE MERCER", "TypeScript, Go, PostgreSQL", "Led a team"];
    expect(findEvidence("postgresql", lines)).toBe("TypeScript, Go, PostgreSQL");
  });

  it("returns null when no line names it", () => {
    expect(findEvidence("rust", ["TypeScript, Go"])).toBeNull();
  });
});

describe("skillLabel", () => {
  it("renders the display form", () => {
    expect(skillLabel("postgresql")).toBe("PostgreSQL");
    expect(skillLabel("ci_cd")).toBe("CI/CD");
  });

  it("falls back to the id for an unknown skill", () => {
    expect(skillLabel("cobol")).toBe("cobol");
  });
});
