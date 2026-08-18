import { describe, it, expect } from "vitest";
import {
  CLOSED_STAGES,
  INTERVIEW_STAGES,
  OFFER_STAGES,
  OPPORTUNITY_STAGES,
  PRE_APPLICATION_STAGES,
  stageList,
} from "@/types/opportunity";

/**
 * Job-search metrics.
 *
 * Two properties are worth locking down, and they are different in kind.
 *
 * The first is arithmetic: the stage groups must not overlap, or an
 * opportunity is counted twice and "applications sent" exceeds the number of
 * applications. They must also only name stages that exist, because a typo in
 * a group is a filter that silently matches nothing — the counter reads zero
 * and looks like a quiet week rather than a bug.
 *
 * The second is a definition. "Applications sent" is derived from stage, not
 * from `applied_at`, because `changeStage` never stamps that column. A future
 * change to count by date would compile, pass every other test, and quietly
 * undercount every application moved along the board without a date being
 * typed in. The test below states the reason so the trade-off is re-argued
 * rather than re-discovered.
 */

const GROUPS = {
  PRE_APPLICATION_STAGES,
  INTERVIEW_STAGES,
  OFFER_STAGES,
  CLOSED_STAGES,
} as const;

describe("opportunity stage groupings", () => {
  it("only names stages that exist in the enum", () => {
    for (const [name, stages] of Object.entries(GROUPS)) {
      for (const stage of stages) {
        expect(OPPORTUNITY_STAGES, `${name} names a stage that is not in the enum`).toContain(stage);
      }
    }
  });

  it("never puts one stage in two groups", () => {
    const seen = new Map<string, string>();
    for (const [name, stages] of Object.entries(GROUPS)) {
      for (const stage of stages) {
        expect(seen.has(stage), `"${stage}" is in both ${seen.get(stage)} and ${name}`).toBe(false);
        seen.set(stage, name);
      }
    }
  });

  it("leaves only the deliberately ungrouped stages out", () => {
    const grouped = new Set(Object.values(GROUPS).flat() as string[]);
    const ungrouped = OPPORTUNITY_STAGES.filter((s) => !grouped.has(s));
    // `applied` — submitted, nothing has happened yet.
    // `on_hold`  — submitted, paused by either side.
    // Both count as applied and in play, and belong to no narrower bucket.
    expect([...ungrouped].sort()).toEqual(["applied", "on_hold"]);
  });

  it("counts every stage exactly once across groups plus the ungrouped pair", () => {
    const total = Object.values(GROUPS).reduce((n, g) => n + g.length, 0);
    expect(total + 2).toBe(OPPORTUNITY_STAGES.length);
  });

  it("treats ghosted as closed rather than as an open conversation", () => {
    // A ghosted application must not sit in "in play" forever, inflating the
    // live pipeline with roles that are over.
    expect(CLOSED_STAGES).toContain("ghosted");
    expect(INTERVIEW_STAGES).not.toContain("ghosted");
  });

  it("does not treat a saved role as an application", () => {
    for (const stage of PRE_APPLICATION_STAGES) {
      expect(INTERVIEW_STAGES).not.toContain(stage);
      expect(OFFER_STAGES).not.toContain(stage);
      expect(CLOSED_STAGES).not.toContain(stage);
    }
  });
});

describe("stageList", () => {
  it("renders a PostgREST list literal", () => {
    expect(stageList(["draft", "prepared", "lead"])).toBe("(draft,prepared,lead)");
  });

  it("emits no spaces, which PostgREST would read as part of a value", () => {
    expect(stageList(PRE_APPLICATION_STAGES)).not.toContain(" ");
  });

  it("wraps a single stage", () => {
    expect(stageList(["offer"])).toBe("(offer)");
  });
});

describe("getDashboardData job-search queries", () => {
  /**
   * Asserts on the predicates issued, not on the numbers returned. The stub
   * answers every count on a table identically, so a returned value proves
   * nothing — whereas a missing `archived_at is null`, or a count keyed on
   * `applied_at` instead of stage, is exactly the kind of defect that produces
   * a plausible-looking wrong number and is never noticed.
   */
  async function run() {
    const { createSupabaseStub } = await import("@/test/stubs/supabase");
    const { getDashboardData } = await import("@/lib/dashboard");
    const stub = createSupabaseStub({
      count: { opportunities: 7, companies: 1, contacts: 2, tasks: 3 },
      select: { opportunities: [], opportunity_events: [] },
    });
    const data = await getDashboardData(stub.client);
    return { data, ops: stub.opsFor("opportunities") };
  }

  const hasNotIn = (op: { filters: { op: string; column: string; value: unknown }[] }, column: string, list: string) =>
    op.filters.some(
      (f) =>
        f.op === "not" &&
        f.column === column &&
        (f.value as { operator: string; value: unknown }).operator === "in" &&
        (f.value as { operator: string; value: unknown }).value === list,
    );

  const hasIn = (op: { filters: { op: string; column: string; value: unknown }[] }, column: string, stages: readonly string[]) =>
    op.filters.some(
      (f) => f.op === "in" && f.column === column && JSON.stringify(f.value) === JSON.stringify([...stages]),
    );

  const isArchivedNull = (op: { filters: { op: string; column: string; value: unknown }[] }) =>
    op.filters.some((f) => f.op === "is" && f.column === "archived_at" && f.value === null);

  it("counts applications sent by stage, never by applied_at", async () => {
    const { ops } = await run();
    const applied = ops.find(
      (o) => hasNotIn(o, "stage", stageList(PRE_APPLICATION_STAGES)) && !hasNotIn(o, "stage", stageList(CLOSED_STAGES)),
    );
    expect(applied, "no query excluded only the pre-application stages").toBeDefined();
    expect(
      applied!.filters.some((f) => f.column === "applied_at"),
      "applications sent must not be keyed on applied_at — changeStage never sets it",
    ).toBe(false);
  });

  it("includes archived opportunities in applications sent", async () => {
    // A total that shrinks when you tidy up is a total nobody can trust.
    const { ops } = await run();
    const applied = ops.find(
      (o) => hasNotIn(o, "stage", stageList(PRE_APPLICATION_STAGES)) && !hasNotIn(o, "stage", stageList(CLOSED_STAGES)),
    )!;
    expect(isArchivedNull(applied)).toBe(false);
  });

  it("excludes archived and closed roles from the live pipeline", async () => {
    const { ops } = await run();
    const inPlay = ops.find(
      (o) => hasNotIn(o, "stage", stageList(PRE_APPLICATION_STAGES)) && hasNotIn(o, "stage", stageList(CLOSED_STAGES)),
    );
    expect(inPlay, "no in-play query excluded both pre-application and closed").toBeDefined();
    expect(isArchivedNull(inPlay!)).toBe(true);
  });

  it("scopes interviewing and offers to their stage groups and to unarchived rows", async () => {
    const { ops } = await run();
    for (const stages of [INTERVIEW_STAGES, OFFER_STAGES]) {
      const op = ops.find((o) => hasIn(o, "stage", stages));
      expect(op, `no query filtered on ${stages.join("/")}`).toBeDefined();
      expect(isArchivedNull(op!)).toBe(true);
    }
  });

  it("does not chase follow-ups on closed roles", async () => {
    const { ops } = await run();
    const followUps = ops.filter((o) => o.filters.some((f) => f.column === "next_action_at"));
    expect(followUps.length).toBeGreaterThan(0);
    for (const op of followUps) {
      expect(hasNotIn(op, "stage", stageList(CLOSED_STAGES)), "a rejected application does not need chasing").toBe(true);
      expect(isArchivedNull(op)).toBe(true);
    }
  });

  it("returns the metric block the dashboard renders", async () => {
    const { data } = await run();
    expect(Object.keys(data.jobSearch).sort()).toEqual(
      ["applied", "appliedLast7Days", "closed", "inPlay", "interviewing", "offers", "saved"].sort(),
    );
    expect(data.followUps).toMatchObject({ overdue: expect.any(Number), next7Days: expect.any(Number), items: [] });
  });
});
