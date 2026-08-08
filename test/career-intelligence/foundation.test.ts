import { describe, it, expect, beforeEach } from "vitest";
import {
  registerProvider,
  getProvider,
  listPullProviders,
  listPushProviders,
  resetProviderRegistry,
} from "@/lib/career-intelligence/providers/registry";
import type { PullProvider, PushProvider } from "@/lib/career-intelligence/providers/types";
import { nextVersionNumber } from "@/lib/career-intelligence/versions";
import { tagSlug, TAGGABLE_ENTITY_TYPES } from "@/types/career-intelligence";
import { OPPORTUNITY_STAGES, stageLabel, stageBadgeVariant } from "@/types/opportunity";

const caps = { pull: false, push: false, incremental: false, documents: false, contacts: false };

function fakePull(id: "gmail" | "indeed"): PullProvider {
  return {
    id,
    displayName: id,
    capabilities: { ...caps, pull: true },
    normalize: (raw) => ({ externalId: raw.externalId, providerId: id, title: "role", raw }),
    fetch: async () => ({ records: [], hasMore: false }),
  };
}

function fakePush(): PushProvider {
  return {
    id: "extension",
    displayName: "extension",
    capabilities: { ...caps, push: true },
    normalize: (raw) => ({ externalId: raw.externalId, providerId: "extension", title: "role", raw }),
    verify: async () => true,
    accept: async () => [],
  };
}

describe("provider registry", () => {
  beforeEach(() => resetProviderRegistry());

  it("starts empty so Phase 1 reports no import sources", () => {
    expect(listPullProviders()).toHaveLength(0);
    expect(listPushProviders()).toHaveLength(0);
  });

  it("resolves a registered provider by id", () => {
    const p = fakePull("gmail");
    registerProvider(p);
    expect(getProvider("gmail")).toBe(p);
  });

  it("separates providers by capability, not by identity", () => {
    registerProvider(fakePull("gmail"));
    registerProvider(fakePush());
    expect(listPullProviders().map((p) => p.id)).toEqual(["gmail"]);
    expect(listPushProviders().map((p) => p.id)).toEqual(["extension"]);
  });

  it("rejects a duplicate registration rather than letting import order decide", () => {
    registerProvider(fakePull("gmail"));
    expect(() => registerProvider(fakePull("gmail"))).toThrow(/already registered/);
  });
});

describe("version lineage numbering", () => {
  it("starts a new lineage at 1", () => {
    expect(nextVersionNumber([])).toBe(1);
  });

  it("continues from the highest version, not the row count", () => {
    // v2 deleted: counting rows would reissue 3 and collide with the existing v3.
    expect(nextVersionNumber([1, 3])).toBe(4);
  });
});

describe("tag slugs", () => {
  it("normalizes to the form the owner-unique index expects", () => {
    expect(tagSlug("  Dream Company!  ")).toBe("dream-company");
    expect(tagSlug("C++ / Rust")).toBe("c-rust");
  });

  it("covers every entity type allowed by the CHECK constraint", () => {
    expect(TAGGABLE_ENTITY_TYPES).toContain("opportunity");
    expect(TAGGABLE_ENTITY_TYPES).toContain("resume_version");
  });
});

describe("opportunity stages", () => {
  it("keeps every pre-existing stage (no rename or removal)", () => {
    for (const stage of ["lead", "applied", "screening", "interview", "offer", "hired", "rejected", "withdrawn", "on_hold"]) {
      expect(OPPORTUNITY_STAGES).toContain(stage);
    }
  });

  it("adds the Career Intelligence stages", () => {
    for (const stage of ["draft", "prepared", "assessment", "interview_round_1", "interview_round_2", "interview_round_3", "final_interview", "negotiation", "accepted", "ghosted"]) {
      expect(OPPORTUNITY_STAGES).toContain(stage);
    }
  });

  it("orders stages lead -> outcome, matching the Postgres enum", () => {
    const i = (s: string) => OPPORTUNITY_STAGES.indexOf(s as never);
    expect(i("draft")).toBeLessThan(i("applied"));
    expect(i("applied")).toBeLessThan(i("interview"));
    expect(i("interview_round_1")).toBeLessThan(i("final_interview"));
    expect(i("final_interview")).toBeLessThan(i("offer"));
    expect(i("offer")).toBeLessThan(i("accepted"));
  });

  it("labels interview rounds without mangling them", () => {
    expect(stageLabel("interview_round_2")).toBe("Interview Round 2");
    expect(stageLabel("assessment")).toBe("Assessment");
  });

  it("gives every stage a badge variant", () => {
    for (const stage of OPPORTUNITY_STAGES) {
      expect(stageBadgeVariant(stage)).toBeTruthy();
    }
  });
});
