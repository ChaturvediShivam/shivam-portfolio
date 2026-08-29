import { describe, it, expect, vi } from "vitest";
import {
  getCandidateProfile,
  getFallbackCandidateProfile,
  MAX_RESUME_CHARS,
} from "@/lib/career-intelligence/candidate-profile";
import { KNOWS_ABOUT } from "@/constants";

/**
 * Candidate profile resolution.
 *
 * The branch that matters is "is there a real resume?", because the answer
 * changes how much the model should be trusted. Nothing here calls a provider.
 */

/** Supabase double for the single `resume_versions` lookup. */
function fakeClient(result: { data?: unknown; error?: unknown; throws?: boolean } = {}) {
  return {
    from(table: string) {
      if (table !== "resume_versions") throw new Error(`unexpected table ${table}`);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const method of ["select", "eq", "order", "limit"]) chain[method] = self;
      chain.maybeSingle = async () => {
        if (result.throws) throw new Error("connection lost");
        return { data: result.data ?? null, error: result.error ?? null };
      };
      return chain;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("getCandidateProfile", () => {
  it("uses the stored resume when one exists", async () => {
    const profile = await getCandidateProfile(
      fakeClient({ data: { content_text: "Shivam Chaturvedi — AI Application Engineer…", label: "AI Engineer CV" } }),
      "owner-1",
    );
    expect(profile.source).toBe("resume");
    expect(profile.resumeText).toContain("AI Application Engineer");
    expect(profile.headline).toBe("AI Engineer CV");
  });

  it("falls back when no resume row exists", async () => {
    // `resume_versions` is in the schema but nothing writes to it yet, so this
    // is the path that actually runs today.
    const profile = await getCandidateProfile(fakeClient({ data: null }), "owner-1");
    expect(profile.source).toBe("fallback");
    expect(profile.resumeText).toBeNull();
  });

  it("treats a blank resume row as no resume", async () => {
    const profile = await getCandidateProfile(
      fakeClient({ data: { content_text: "   \n  ", label: "Empty" } }),
      "owner-1",
    );
    expect(profile.source).toBe("fallback");
  });

  it("falls back rather than throwing when the query errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const errored = await getCandidateProfile(fakeClient({ error: { message: "rls" } }), "owner-1");
    const threw = await getCandidateProfile(fakeClient({ throws: true }), "owner-1");
    expect(errored.source).toBe("fallback");
    expect(threw.source).toBe("fallback");
    spy.mockRestore();
  });

  it("truncates an oversized resume", async () => {
    const profile = await getCandidateProfile(
      fakeClient({ data: { content_text: "x".repeat(50_000), label: null } }),
      "owner-1",
    );
    expect(profile.resumeText?.length).toBe(MAX_RESUME_CHARS);
  });

  it("keeps the default headline when the stored label is blank", async () => {
    const profile = await getCandidateProfile(
      fakeClient({ data: { content_text: "Real resume", label: "  " } }),
      "owner-1",
    );
    expect(profile.headline).toBe(getFallbackCandidateProfile().headline);
  });
});

describe("fallback profile", () => {
  const profile = getFallbackCandidateProfile();

  it("reuses the application's own skills list rather than restating one", () => {
    // Keeps what the model is told from drifting from what the site claims.
    expect(profile.skills).toEqual([...KNOWS_ABOUT]);
  });

  it("carries the CV's positioning and years of experience", () => {
    expect(profile.headline).toBe("AI Application Engineer | Strategic Research & AI");
    expect(profile.yearsExperience).toBe(4);
  });

  it("lists the roles actually being targeted", () => {
    expect(profile.targetRoles).toContain("AI Application Engineer");
    expect(profile.targetRoles).toContain("Founding Engineer (AI startup)");
  });

  it("declares itself a summary so the model lowers its confidence", () => {
    expect(profile.background).toMatch(/summary profile, not a full resume/i);
  });

  it("contains no email address or phone number", () => {
    // Phase 8: no unnecessary private information reaches the provider.
    const text = JSON.stringify(profile);
    expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/\+\d{2}[- ]?\d{6,}/);
  });
});
