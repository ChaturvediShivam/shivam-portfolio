import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseStub } from "@/test/stubs/supabase";
import { withPublicDemoAction, demoSuccess } from "@/lib/demo/publicAction";
import { demoConfigured, demoDailyTokenBudget } from "@/lib/demo/config";

/**
 * The configurations the demo will actually be deployed in.
 *
 * Each row below is a state a real deployment can be in — a flag off, a secret
 * missing, a fresh checkout with nothing set — and the property under test is
 * always the same: an incomplete configuration must refuse, never quietly run
 * something unsafe. A demo that works without a Turnstile secret is a demo that
 * bills the operator for every script that finds it.
 */

const OWNER = "00000000-0000-4000-8000-000000000000";
const ENV = [
  "FEATURE_PUBLIC_DEMO",
  "FEATURE_AI",
  "FEATURE_RESUME_AI",
  "DEMO_OWNER_ID",
  "DEMO_IP_SALT",
  "AI_DEMO_DAILY_TOKEN_BUDGET",
  "CLOUDFLARE_TURNSTILE_SECRET_KEY",
] as const;
let saved: Record<string, string | undefined>;

function healthy() {
  return createSupabaseStub({
    count: { demo_usage: 0 },
    select: {
      ai_usage_counters: {
        usage_date: "2026-08-09",
        tokens_reserved: 0,
        tokens_used: 0,
        cost_micros: 0,
        request_count: 0,
      },
    },
  });
}

function turnstilePasses() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => ({ success: true }) }) as unknown as Response,
    ),
  );
}

/** Runs the wrapper and reports whether the body executed. */
async function attempt() {
  const stub = healthy();
  let ran = false;
  const result = await withPublicDemoAction(
    { turnstileToken: "tok", visitorIp: "203.0.113.7" },
    async () => {
      ran = true;
      return demoSuccess("ok");
    },
    () => stub.client,
  );
  return { ran, result };
}

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  process.env.FEATURE_PUBLIC_DEMO = "true";
  process.env.FEATURE_AI = "true";
  process.env.FEATURE_RESUME_AI = "true";
  process.env.DEMO_OWNER_ID = OWNER;
  process.env.DEMO_IP_SALT = "test-salt";
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "secret";
  turnstilePasses();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the deployment matrix", () => {
  it("runs when everything is configured", async () => {
    const { ran, result } = await attempt();
    expect(ran).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("refuses with FEATURE_PUBLIC_DEMO off", async () => {
    process.env.FEATURE_PUBLIC_DEMO = "false";
    const { ran, result } = await attempt();
    expect(ran).toBe(false);
    expect(result.ok === false && result.code).toBe("demo_disabled");
  });

  it("refuses on a fresh checkout with nothing set", async () => {
    for (const key of ENV) delete process.env[key];
    const { ran, result } = await attempt();
    // The default is off, so a clone of this repository cannot spend anything.
    expect(ran).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("refuses when DEMO_OWNER_ID is missing, rather than billing nobody", async () => {
    delete process.env.DEMO_OWNER_ID;
    const { ran, result } = await attempt();
    expect(ran).toBe(false);
    expect(result.ok === false && result.code).toBe("demo_unconfigured");
  });

  it("refuses when DEMO_IP_SALT is missing, rather than hashing unsalted", async () => {
    delete process.env.DEMO_IP_SALT;
    const { ran, result } = await attempt();
    expect(ran).toBe(false);
    expect(result.ok === false && result.code).toBe("demo_unconfigured");
  });

  it("refuses when the Turnstile secret is missing", async () => {
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    const { ran, result } = await attempt();
    // The contact form deliberately fails open here. The demo must not: the
    // worst case there is a spam row, and here it is a provider bill.
    expect(ran).toBe(false);
    expect(result.ok === false && result.code).toBe("verification_failed");
  });

  it("still runs the deterministic half with FEATURE_AI off", async () => {
    process.env.FEATURE_AI = "false";
    const { ran, result } = await attempt();
    // The flag bounds the review, never the scoring.
    expect(ran).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("falls back to a bounded budget when AI_DEMO_DAILY_TOKEN_BUDGET is unset", () => {
    delete process.env.AI_DEMO_DAILY_TOKEN_BUDGET;
    // Never unlimited. An unset ceiling on a public endpoint would be the one
    // configuration mistake with an unbounded bill attached.
    expect(demoDailyTokenBudget()).toBeGreaterThan(0);
    expect(Number.isFinite(demoDailyTokenBudget())).toBe(true);
  });

  it("reports configuration completeness independently of the flag", () => {
    expect(demoConfigured()).toBe(true);
    process.env.FEATURE_PUBLIC_DEMO = "false";
    // Deliberately off and misconfigured are different operator problems.
    expect(demoConfigured()).toBe(true);
  });
});

describe(".env.example is a template, not a leak", () => {
  const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");

  it("documents every demo variable the code reads", () => {
    for (const key of [
      "FEATURE_PUBLIC_DEMO",
      "DEMO_OWNER_ID",
      "AI_DEMO_DAILY_TOKEN_BUDGET",
      "DEMO_IP_SALT",
    ]) {
      expect(example, `${key} must be documented`).toContain(key);
    }
  });

  it("carries no real secret", () => {
    // Shapes, not names: a placeholder may be called anything, but a live key
    // looks like a live key.
    expect(example).not.toMatch(/sk-ant-[A-Za-z0-9]{10,}/);
    expect(example).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./); // a JWT, e.g. a Supabase key
    expect(example).not.toMatch(/service_role.*eyJ/);
    // The demo owner is a real uuid in .env.local and must stay a placeholder here.
    expect(example).not.toMatch(
      /DEMO_OWNER_ID=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });

  it("keeps every feature flag off by default", () => {
    const flags = example.match(/^FEATURE_[A-Z_]+=(.*)$/gm) ?? [];
    expect(flags.length).toBeGreaterThan(5);
    for (const line of flags) {
      expect(line, `${line} must ship off`).toMatch(/=false$/);
    }
  });
});
