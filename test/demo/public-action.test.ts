import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseStub } from "@/test/stubs/supabase";
import {
  withPublicDemoAction,
  demoSuccess,
  type DemoActionResult,
  type DemoContext,
} from "@/lib/demo/publicAction";
import { DEMO_VISITOR_LIMIT, DEMO_VISITOR_WINDOW_MINUTES } from "@/lib/demo/config";

/**
 * Guards the public demo's action wrapper.
 *
 * Two properties matter beyond "does each gate reject". First, ordering: a gate
 * that runs after an expensive one is not a gate, it is an audit. Each test
 * below asserts not only the rejection but that the work behind it never
 * happened — no request to Cloudflare, no query, no action body. Second,
 * scrubbing: an action that throws a Postgres error or a provider error must
 * produce one flat sentence, never the error itself.
 */

const OWNER = "00000000-0000-4000-8000-000000000000";
const IP = "203.0.113.7";
const TOKEN = "0.fake-token";

const ENV = ["FEATURE_PUBLIC_DEMO", "DEMO_OWNER_ID", "DEMO_IP_SALT", "AI_DEMO_DAILY_TOKEN_BUDGET"] as const;
let saved: Record<string, string | undefined>;

/** Turnstile passes unless a test says otherwise. */
function turnstilePasses() {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }) as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A stub whose ledger and throttle both allow the request through. */
function healthyStub(overrides: Parameters<typeof createSupabaseStub>[0] = {}) {
  return createSupabaseStub({
    count: { demo_usage: 0 },
    select: { ai_usage_counters: { usage_date: "2026-08-09", tokens_reserved: 0, tokens_used: 0, cost_micros: 0, request_count: 0 } },
    ...overrides,
  });
}

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  process.env.FEATURE_PUBLIC_DEMO = "true";
  process.env.DEMO_OWNER_ID = OWNER;
  process.env.DEMO_IP_SALT = "test-salt";
  process.env.AI_DEMO_DAILY_TOKEN_BUDGET = "50000";
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "test-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("gate 1 — feature flag and configuration", () => {
  it("rejects when the flag is off, touching nothing", async () => {
    process.env.FEATURE_PUBLIC_DEMO = "false";
    const fetchMock = turnstilePasses();
    const stub = healthyStub();
    const body = vi.fn();

    const result = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, body, () => stub.client);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("demo_disabled");
    expect(fetchMock, "the cheapest gate must not reach Cloudflare").not.toHaveBeenCalled();
    expect(stub.operations, "nor the database").toHaveLength(0);
    expect(body).not.toHaveBeenCalled();
  });

  it("rejects when the owner id is unset", async () => {
    delete process.env.DEMO_OWNER_ID;
    const fetchMock = turnstilePasses();
    const result = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => healthyStub().client);

    expect(!result.ok && result.code).toBe("demo_unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when the ip salt is unset", async () => {
    delete process.env.DEMO_IP_SALT;
    const result = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => healthyStub().client);
    expect(!result.ok && result.code).toBe("demo_unconfigured");
  });

  it("tells a visitor the same thing whether it is off or misconfigured", async () => {
    turnstilePasses();
    process.env.FEATURE_PUBLIC_DEMO = "false";
    const disabled = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => healthyStub().client);

    process.env.FEATURE_PUBLIC_DEMO = "true";
    delete process.env.DEMO_OWNER_ID;
    const unconfigured = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => healthyStub().client);

    // Distinct codes for the log; identical sentence for the visitor.
    expect(!disabled.ok && !unconfigured.ok && disabled.formError).toBe(
      !unconfigured.ok ? unconfigured.formError : "",
    );
  });
});

describe("gate 2 — turnstile, before any database work", () => {
  it("rejects an unverified request without querying", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: false }) }) as unknown as Response));
    const stub = healthyStub();
    const body = vi.fn();

    const result = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, body, () => stub.client);

    expect(!result.ok && result.code).toBe("verification_failed");
    // The point of verifying before the limiter: a script that never solves a
    // challenge must not be able to make us issue a single query.
    expect(stub.operations).toHaveLength(0);
    expect(body).not.toHaveBeenCalled();
  });

  it("rejects when Cloudflare is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const stub = healthyStub();

    const result = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => stub.client);

    expect(!result.ok && result.code).toBe("verification_failed");
    expect(stub.operations).toHaveLength(0);
  });
});

describe("gate 3 — per-visitor allowance", () => {
  it("rejects an exhausted visitor before the budget is read", async () => {
    turnstilePasses();
    const stub = healthyStub({ count: { demo_usage: DEMO_VISITOR_LIMIT } });
    const body = vi.fn();

    const result = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, body, () => stub.client);

    expect(!result.ok && result.code).toBe("rate_limited");
    expect(!result.ok && result.retryAfterMinutes).toBe(DEMO_VISITOR_WINDOW_MINUTES);
    expect(stub.opsFor("ai_usage_counters"), "budget must not be read once rejected").toHaveLength(0);
    expect(body).not.toHaveBeenCalled();
  });

  it("rejects when the limiter cannot see its meter", async () => {
    turnstilePasses();
    const stub = createSupabaseStub({ error: { demo_usage: { message: "connection terminated" } } });
    const result = await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => stub.client);
    expect(!result.ok && result.code).toBe("rate_limited");
  });
});

describe("budget — reported to the action, never a rejection", () => {
  it("still runs the action when the ceiling is spent, flagging the AI as unavailable", async () => {
    turnstilePasses();
    const stub = healthyStub({
      select: { ai_usage_counters: { usage_date: "2026-08-09", tokens_reserved: 50_000, tokens_used: 50_000, cost_micros: 0, request_count: 9 } },
    });
    let seen: DemoContext | null = null;

    const result = await withPublicDemoAction(
      { turnstileToken: TOKEN, visitorIp: IP },
      async (context) => { seen = context; return demoSuccess("deterministic"); },
      () => stub.client,
    );

    // A spent budget bounds the provider call, not the analysis. The visitor
    // must never be left with a blank page because the AI half is unaffordable.
    expect(result.ok && result.data).toBe("deterministic");
    expect(seen!.aiBudgetAvailable).toBe(false);
  });

  it("reports room when the ceiling has some", async () => {
    turnstilePasses();
    const stub = healthyStub({
      select: { ai_usage_counters: { usage_date: "2026-08-09", tokens_reserved: 100, tokens_used: 100, cost_micros: 0, request_count: 1 } },
    });
    let seen: DemoContext | null = null;

    await withPublicDemoAction(
      { turnstileToken: TOKEN, visitorIp: IP },
      async (context) => { seen = context; return demoSuccess(null); },
      () => stub.client,
    );

    expect(seen!.aiBudgetAvailable).toBe(true);
  });

  it("treats an unreadable ledger as no budget, without blocking the analysis", async () => {
    turnstilePasses();
    // demo_usage answers (throttle passes); ai_usage_counters errors.
    const stub = createSupabaseStub({
      count: { demo_usage: 0 },
      error: { ai_usage_counters: { message: "permission denied for relation" } },
    });
    let seen: DemoContext | null = null;

    const result = await withPublicDemoAction(
      { turnstileToken: TOKEN, visitorIp: IP },
      async (context) => { seen = context; return demoSuccess("deterministic"); },
      () => stub.client,
    );

    // An unenforceable ceiling is not an open one — but it is also not a reason
    // to withhold work that costs nothing at a provider.
    expect(seen!.aiBudgetAvailable).toBe(false);
    expect(result.ok && result.data).toBe("deterministic");
  });
});

describe("gate 5 — the action body", () => {
  it("receives a service client, the demo owner and the visitor address", async () => {
    turnstilePasses();
    const stub = healthyStub();
    let seen: DemoContext | null = null;

    await withPublicDemoAction(
      { turnstileToken: TOKEN, visitorIp: IP },
      async (context) => { seen = context; return demoSuccess(null); },
      () => stub.client,
    );

    expect(seen!.ownerId).toBe(OWNER);
    expect(seen!.visitorIp).toBe(IP);
    expect(seen!.supabase).toBe(stub.client as SupabaseClient);
  });

  it("meters a successful run against the visitor's allowance", async () => {
    turnstilePasses();
    const stub = healthyStub();

    await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, async () => demoSuccess("ok"), () => stub.client);

    expect(stub.opsFor("demo_usage").some((o) => o.type === "insert")).toBe(true);
  });

  it("does not meter a run the action itself rejected", async () => {
    turnstilePasses();
    const stub = healthyStub();

    const result = await withPublicDemoAction(
      { turnstileToken: TOKEN, visitorIp: IP },
      async () => ({ ok: false as const, code: "internal_error" as const, formError: "bad input" }),
      () => stub.client,
    );

    expect(result.ok).toBe(false);
    // A request that failed validation consumed nothing worth charging for.
    expect(stub.opsFor("demo_usage").some((o) => o.type === "insert")).toBe(false);
  });
});

describe("gate 6 — error scrubbing", () => {
  const leaks = [
    new Error('duplicate key value violates unique constraint "demo_usage_pkey"'),
    new Error("AI provider returned 401: invalid x-api-key sk-ant-abc123"),
    new Error("connect ECONNREFUSED 10.0.0.5:5432"),
    Object.assign(new Error("boom"), { stack: "at /Users/secret/path/lib/demo/x.ts:12:9" }),
    "a thrown string",
  ];

  for (const thrown of leaks) {
    const label = thrown instanceof Error ? thrown.message.slice(0, 40) : String(thrown);
    it(`turns "${label}" into one flat sentence`, async () => {
      turnstilePasses();
      const stub = healthyStub();

      const result = await withPublicDemoAction(
        { turnstileToken: TOKEN, visitorIp: IP },
        async () => { throw thrown; },
        () => stub.client,
      );

      expect(!result.ok && result.code).toBe("internal_error");

      const serialized = JSON.stringify(result);
      for (const secret of ["demo_usage_pkey", "sk-ant-abc123", "ECONNREFUSED", "10.0.0.5", "/Users/", "constraint", "x-api-key"]) {
        expect(serialized, `"${secret}" must not reach the client`).not.toContain(secret);
      }
    });
  }

  it("does not meter a run that threw", async () => {
    turnstilePasses();
    const stub = healthyStub();

    await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, async () => { throw new Error("x"); }, () => stub.client);

    expect(stub.opsFor("demo_usage").some((o) => o.type === "insert")).toBe(false);
  });
});

describe("every public message is safe to render", () => {
  it("carries no internals in any failure path", async () => {
    const results: DemoActionResult<unknown>[] = [];

    process.env.FEATURE_PUBLIC_DEMO = "false";
    results.push(await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => healthyStub().client));

    process.env.FEATURE_PUBLIC_DEMO = "true";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: false }) }) as unknown as Response));
    results.push(await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => healthyStub().client));

    turnstilePasses();
    results.push(await withPublicDemoAction({ turnstileToken: TOKEN, visitorIp: IP }, vi.fn(), () => healthyStub({ count: { demo_usage: DEMO_VISITOR_LIMIT } }).client));

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.formError.length).toBeGreaterThan(10);
      expect(result.formError).not.toMatch(/supabase|postgres|anthropic|claude|sk-|select |insert |token=|DEMO_|FEATURE_/i);
    }
  });
});
