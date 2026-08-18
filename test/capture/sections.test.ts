import { describe, it, expect } from "vitest";
import { classifySection, assembleJobDescription } from "@/lib/capture/sections";
import type { CapturedSection } from "@/types/capture";

/**
 * Section classification.
 *
 * A job page is the employer's posting wrapped in whatever the board adds
 * around it. Concatenating all of it gives a `job_description` that is complete
 * and useless — half of it is somebody else's writing about the job rather than
 * the job. These tests pin the boundary.
 */

const section = (heading: string | null, text: string, level = 2): CapturedSection => ({ heading, level, text });

describe("classifySection", () => {
  it("recognises employer sections across the wordings boards actually use", () => {
    const employer = [
      "Overview", "About the role", "About this role", "The role", "Role",
      "Responsibilities", "What you'll do", "What you will do", "Duties",
      "Requirements", "Qualifications", "What we're looking for",
      "Required Skills", "Preferred qualifications", "Nice to have", "Nice-to-Have Skills",
      "Bonus points", "Experience", "Education", "About the company", "About us",
      "Benefits", "Compensation", "How to apply", "Skills & Requirements",
      "Your impact", "Who you are", "Tech stack", "Interview process",
    ];
    for (const heading of employer) {
      expect(classifySection(heading), heading).toBe("employer");
    }
  });

  it("recognises the board's own editorial", () => {
    const editorial = [
      "Editorial Analysis", "Growth Opportunities", "Application Guide",
      "Remote Readiness Overview", "Similar Jobs", "Related roles",
      "You might also like", "Written by Surely Remote", "Share this job",
      "Career advice", "Disclaimer", "How we score jobs",
    ];
    for (const heading of editorial) {
      expect(classifySection(heading), heading).toBe("editorial");
    }
  });

  it("puts the more specific pattern first, so editorial wins over a shared word", () => {
    // "Remote Readiness Overview" contains "overview"; "Application Guide"
    // contains "application". Both are employer words. If ordering flipped, the
    // board's own analysis would be filed as the employer's job description.
    expect(classifySection("Remote Readiness Overview")).toBe("editorial");
    expect(classifySection("Application Guide")).toBe("editorial");
    expect(classifySection("Overview")).toBe("employer");
    expect(classifySection("How to apply")).toBe("employer");
  });

  it("recognises a metadata card", () => {
    for (const heading of ["Job Summary", "Job Details", "At a glance", "Quick facts", "Key details"]) {
      expect(classifySection(heading), heading).toBe("metadata");
    }
  });

  it("treats the lead block as employer content", () => {
    // Text before the first heading is the role overview on almost every
    // posting; a board's commentary is never the first thing on the page.
    expect(classifySection(null)).toBe("employer");
  });

  it("does not guess at an unrecognised heading", () => {
    expect(classifySection("Frobnicator Ratings")).toBe("unknown");
  });
});

describe("assembleJobDescription", () => {
  it("keeps employer sections in document order and drops editorial", () => {
    const { description, includedHeadings } = assembleJobDescription([
      section(null, "We are hiring an engineer to build practical AI systems for our team."),
      section("Responsibilities", "• Build agents\n• Ship features"),
      section("Editorial Analysis", "Our take on why this role is interesting for candidates today."),
      section("Requirements", "• 5 years experience\n• TypeScript"),
      section("Growth Opportunities", "You could grow into a staff role over the next few years here."),
    ]);

    expect(includedHeadings).toEqual(["Responsibilities", "Requirements"]);
    expect(description).toContain("practical AI systems");
    expect(description).toContain("• Build agents");
    expect(description).toContain("• 5 years experience");
    expect(description).not.toContain("Our take on why");
    expect(description).not.toContain("grow into a staff role");
  });

  it("preserves the employer's own ordering rather than imposing one", () => {
    const { description } = assembleJobDescription([
      section("Requirements", "You will need five years of relevant professional experience."),
      section("Responsibilities", "You will build and operate production services for our customers."),
    ]);
    expect(description!.indexOf("Requirements")).toBeLessThan(description!.indexOf("Responsibilities"));
  });

  it("routes metadata to field extraction and never into the description", () => {
    const { description, metadataText } = assembleJobDescription([
      section(null, "A short but genuine overview of the role and what the team is working on."),
      section("Job Summary", "Company\nBjak\nEmployment\nFull-time"),
    ]);
    expect(description).not.toContain("Bjak");
    expect(metadataText).toContain("Employment");
    expect(metadataText).toContain("Full-time");
  });

  it("falls back to unknown sections only when nothing was recognised", () => {
    // Better a description with some extra content than an empty one: empty
    // means copying the posting by hand, which is the work this removes.
    const { description, usedFallback } = assembleJobDescription([
      section("Frobnicator Ratings", "This role involves considerable frobnication of the widgets daily."),
    ]);
    expect(usedFallback).toBe(true);
    expect(description).toContain("frobnication");
  });

  it("ignores unknown sections once employer sections exist", () => {
    const { description, usedFallback } = assembleJobDescription([
      section("Responsibilities", "Build and operate the services that power our customer platform."),
      section("Frobnicator Ratings", "Unrelated commentary that the board appended to this posting."),
    ]);
    expect(usedFallback).toBe(false);
    expect(description).not.toContain("Unrelated commentary");
  });

  it("returns null rather than a stub when the page has no real description", () => {
    // CASE E: structured metadata but no description. Manufacturing one would
    // be inventing content.
    const { description } = assembleJobDescription([section("Job Summary", "Company\nAcme")]);
    expect(description).toBeNull();
  });

  it("handles a page with no sections at all", () => {
    expect(assembleJobDescription([]).description).toBeNull();
  });
});
