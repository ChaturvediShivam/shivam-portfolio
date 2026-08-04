import { describe, expect, it } from "vitest";
import { sectionRewriteTemplate, INTENSITY_RULES, TARGET_RULES } from "@/lib/ai-analysis/prompts/section-rewrite";

const base = {
  sectionLabel: "Experience", sectionText: "• Did a thing.", resume: "R",
  jobTitle: "T", jobKeywords: "k", detectedSkills: "s", missingSkills: "m",
};

describe("intensity/target reach the rendered prompt", () => {
  it("each intensity injects its own distinct rule text", () => {
    const rendered = (["conservative","balanced","aggressive"] as const).map((i) =>
      sectionRewriteTemplate.render({ ...base, intensity: i, intensityRule: INTENSITY_RULES[i], target: "ats", targetRule: TARGET_RULES.ats }).system);
    expect(rendered[0]).toContain("Stay close to the original");
    expect(rendered[1]).toContain("Rephrase freely for impact");
    expect(rendered[2]).toContain("Restructure boldly");
    expect(new Set(rendered).size).toBe(3);
    console.log("intensity system prompt lengths:", rendered.map(r => r.length));
  });

  it("each target injects its own distinct rule text", () => {
    const targets = ["ats","recruiter","executive","technical","remote_us"] as const;
    const rendered = targets.map((t) =>
      sectionRewriteTemplate.render({ ...base, intensity: "balanced", intensityRule: INTENSITY_RULES.balanced, target: t, targetRule: TARGET_RULES[t] }).system);
    expect(rendered[0]).toContain("automated screening");
    expect(rendered[1]).toContain("six-second human scan");
    expect(rendered[2]).toContain("senior audience");
    expect(rendered[3]).toContain("engineering reader");
    expect(rendered[4]).toContain("distributed US roles");
    expect(new Set(rendered).size).toBe(5);
    console.log("target system prompt lengths:", rendered.map(r => r.length));
  });
});
