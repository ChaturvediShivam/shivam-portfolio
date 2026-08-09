import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSupabaseStub } from "@/test/stubs/supabase";
import { reserveBudget } from "@/lib/ai/budget";
import { demoDailyTokenBudget } from "@/lib/demo/config";

/**
 * The ceiling the demo actually spends against.
 *
 * The demo has two numbers: AI_DEMO_DAILY_TOKEN_BUDGET, checked by the public
 * wrapper's preflight, and AI_DAILY_TOKEN_BUDGET, which is what the shared
 * budget layer enforces. Only the second is atomic — `ai_reserve_budget`
 * applies it inside a single conditional statement, so concurrent callers
 * cannot both pass it.
 *
 * The preflight is a read followed by a decision, which two requests can
 * interleave. That is acceptable for a hint and not acceptable as the only
 * thing standing between a public endpoint and a bill, so the limit the
 * reservation carries has to be the demo's own.
 */

const OWNER = "00000000-0000-4000-8000-000000000000";
const ENV = ["AI_DAILY_TOKEN_BUDGET", "AI_DEMO_DAILY_TOKEN_BUDGET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  // The operator's ceiling, ten times the demo's.
  process.env.AI_DAILY_TOKEN_BUDGET = "500000";
  process.env.AI_DEMO_DAILY_TOKEN_BUDGET = "50000";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("reserveBudget — the limit sent to the atomic reservation", () => {
  it("defaults to the operator's daily budget, unchanged for every existing caller", async () => {
    const stub = createSupabaseStub({ rpc: { ai_reserve_budget: true } });

    await reserveBudget(stub.client, OWNER, 1_000);

    const call = stub.rpcCalls.find((c) => c.name === "ai_reserve_budget");
    expect(call?.args.p_limit).toBe(500_000);
  });

  it("carries an explicit ceiling when one is supplied", async () => {
    const stub = createSupabaseStub({ rpc: { ai_reserve_budget: true } });

    await reserveBudget(stub.client, OWNER, 1_000, demoDailyTokenBudget());

    // The demo's own number reaches Postgres, so the ceiling it advertises is
    // the ceiling actually enforced — not one ten times larger.
    const call = stub.rpcCalls.find((c) => c.name === "ai_reserve_budget");
    expect(call?.args.p_limit).toBe(50_000);
  });

  it("treats an explicit zero or negative ceiling as refuse-everything, not unlimited", async () => {
    // `p_limit: null` means unlimited in the RPC, so a misconfigured zero must
    // never be allowed to become one.
    const stub = createSupabaseStub({ rpc: { ai_reserve_budget: true } });

    await reserveBudget(stub.client, OWNER, 1_000, 0);

    const call = stub.rpcCalls.find((c) => c.name === "ai_reserve_budget");
    expect(call?.args.p_limit).toBe(0);
    expect(call?.args.p_limit).not.toBeNull();
  });

  it("still allows unlimited when the operator has configured no ceiling", async () => {
    delete process.env.AI_DAILY_TOKEN_BUDGET;
    const stub = createSupabaseStub({ rpc: { ai_reserve_budget: true } });

    await reserveBudget(stub.client, OWNER, 1_000);

    const call = stub.rpcCalls.find((c) => c.name === "ai_reserve_budget");
    expect(call?.args.p_limit).toBeNull();
  });

  it("refuses when the ledger says the ceiling is reached", async () => {
    // The RPC returns NULL rather than true when the conditional update does
    // not fire. That is the atomic refusal the preflight cannot provide.
    const stub = createSupabaseStub({ rpc: { ai_reserve_budget: null } });

    await expect(reserveBudget(stub.client, OWNER, 1_000, 50_000)).rejects.toThrow();
  });

  it("fails closed when the ledger is unreachable", async () => {
    const stub = createSupabaseStub({
      error: { ai_usage_counters: { message: "connection terminated" } },
      rpc: {},
    });
    // rpc errors are surfaced by the stub's rpc path returning no data; the
    // reserve treats anything other than `true` as a refusal.
    await expect(reserveBudget(stub.client, OWNER, 1_000, 50_000)).rejects.toThrow();
  });
});

describe("the demo's advertised ceiling matches the enforced one", () => {
  it("demoDailyTokenBudget is what a demo reservation is measured against", () => {
    // If these two ever diverge again, the demo can spend up to the operator's
    // budget under concurrency while reporting a much smaller number.
    expect(demoDailyTokenBudget()).toBe(50_000);
    expect(demoDailyTokenBudget()).toBeLessThan(Number(process.env.AI_DAILY_TOKEN_BUDGET));
  });
});
