import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSupabaseStub } from "@/test/stubs/supabase";
import { logDemoEvent } from "@/lib/demo/telemetry";
import { withPublicDemoAction, demoSuccess, demoFailure } from "@/lib/demo/publicAction";
import { DEMO_VISITOR_LIMIT } from "@/lib/demo/config";

/**
 * Every failure the demo can produce, and the event it leaves behind.
 *
 * Two properties, both operational rather than functional. A failure must be
 * distinguishable in the logs — otherwise a launch is a guess about which of
 * nine things is happening. And telemetry must never be able to fail the
 * request it is describing, which is not obvious: the gate events fire before
 * the wrapper's try block, so a throw there escapes the Server Action instead
 * of being scrubbed into a safe message.
 */

const OWNER = "00000000-0000-4000-8000-000000000000";
const IP = "203.0.113.7";
const ENV = ["FEATURE_PUBLIC_DEMO", "DEMO_OWNER_ID", "DEMO_IP_SALT"] as const;
let saved: Record<string, string | undefined>;
let events: string[];

function healthy(overrides: Parameters<typeof createSupabaseStub>[0] = {}) {
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
    ...overrides,
  });
}

function turnstile(success: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success }) }) as unknown as Response),
  );
}

/** Event names emitted during the block, in order. */
function emitted(): string[] {
  return events.map((line) => JSON.parse(line.replace("[demo:event] ", "")).event);
}

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  process.env.FEATURE_PUBLIC_DEMO = "true";
  process.env.DEMO_OWNER_ID = OWNER;
  process.env.DEMO_IP_SALT = "test-salt";
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "secret";
  turnstile(true);

  events = [];
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    events.push(args.map(String).join(" "));
  });
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

describe("each failure emits its own event", () => {
  it("demo_disabled", async () => {
    process.env.FEATURE_PUBLIC_DEMO = "false";
    const result = await withPublicDemoAction(
      { turnstileToken: "t", visitorIp: IP },
      async () => demoSuccess(null),
      () => healthy().client,
    );
    expect(result.ok).toBe(false);
    expect(emitted()).toContain("demo_disabled");
  });

  it("demo_unconfigured", async () => {
    delete process.env.DEMO_OWNER_ID;
    await withPublicDemoAction(
      { turnstileToken: "t", visitorIp: IP },
      async () => demoSuccess(null),
      () => healthy().client,
    );
    expect(emitted()).toContain("demo_unconfigured");
  });

  it("verification_failed", async () => {
    turnstile(false);
    await withPublicDemoAction(
      { turnstileToken: "t", visitorIp: IP },
      async () => demoSuccess(null),
      () => healthy().client,
    );
    expect(emitted()).toContain("verification_failed");
  });

  it("rate_limited", async () => {
    await withPublicDemoAction(
      { turnstileToken: "t", visitorIp: IP },
      async () => demoSuccess(null),
      () => healthy({ count: { demo_usage: DEMO_VISITOR_LIMIT } }).client,
    );
    expect(emitted()).toContain("rate_limited");
  });

  it("internal_error", async () => {
    const result = await withPublicDemoAction(
      { turnstileToken: "t", visitorIp: IP },
      async () => {
        throw new Error("relation \"opportunities\" does not exist");
      },
      () => healthy().client,
    );
    expect(emitted()).toContain("internal_error");
    // The event exists; the message the visitor sees does not carry the cause.
    expect(JSON.stringify(result)).not.toContain("opportunities");
  });

  it("distinguishes the gates from one another", async () => {
    // Nine events would be worthless if two paths emitted the same one.
    const seen = new Set<string>();
    for (const setup of [
      () => {
        process.env.FEATURE_PUBLIC_DEMO = "false";
      },
      () => {
        process.env.FEATURE_PUBLIC_DEMO = "true";
        delete process.env.DEMO_IP_SALT;
      },
      () => {
        process.env.DEMO_IP_SALT = "test-salt";
        turnstile(false);
      },
    ]) {
      events = [];
      setup();
      await withPublicDemoAction(
        { turnstileToken: "t", visitorIp: IP },
        async () => demoSuccess(null),
        () => healthy().client,
      );
      for (const event of emitted()) seen.add(event);
    }
    expect(seen.size).toBe(3);
  });
});

describe("telemetry cannot fail the request it describes", () => {
  it("survives a console that throws", () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("EPIPE: broken pipe");
    });
    // A closed stdout is a real production condition, not a hypothetical.
    expect(() => logDemoEvent("analysis_ok", { score: 76 })).not.toThrow();
  });

  it("survives metadata that cannot be serialised", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      logDemoEvent("analysis_ok", cyclic as unknown as { score?: number }),
    ).not.toThrow();
  });

  it("does not turn a working request into an internal_error", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("EPIPE: broken pipe");
    });

    const result = await withPublicDemoAction(
      { turnstileToken: "t", visitorIp: IP },
      async () => demoSuccess("analysis"),
      () => healthy().client,
    );

    // Before the fix this failed: the gate event threw, the wrapper caught it,
    // and a healthy analysis was reported to the visitor as a server error.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe("analysis");
  });

  it("does not escape the wrapper when a pre-try gate event throws", async () => {
    process.env.FEATURE_PUBLIC_DEMO = "false";
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("EPIPE: broken pipe");
    });

    // demo_disabled is logged before the try block, so an unguarded throw here
    // would leave the Server Action entirely rather than being scrubbed.
    const result = await withPublicDemoAction(
      { turnstileToken: "t", visitorIp: IP },
      async () => demoSuccess(null),
      () => healthy().client,
    );

    expect(result.ok === false && result.code).toBe("demo_disabled");
  });
});

describe("failure results never carry internals", () => {
  it("returns only safe copy for every gate", async () => {
    const results = [];

    process.env.FEATURE_PUBLIC_DEMO = "false";
    results.push(
      await withPublicDemoAction({ turnstileToken: "t", visitorIp: IP }, async () => demoSuccess(null), () => healthy().client),
    );

    process.env.FEATURE_PUBLIC_DEMO = "true";
    turnstile(false);
    results.push(
      await withPublicDemoAction({ turnstileToken: "t", visitorIp: IP }, async () => demoSuccess(null), () => healthy().client),
    );

    turnstile(true);
    results.push(
      await withPublicDemoAction({ turnstileToken: "t", visitorIp: IP }, async () => demoSuccess(null), () => healthy({ count: { demo_usage: DEMO_VISITOR_LIMIT } }).client),
    );

    results.push(demoFailure("invalid_input", { formError: "Add a job description first." }));

    for (const result of results) {
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(
        /supabase|postgres|anthropic|sk-ant|DEMO_OWNER_ID|DEMO_IP_SALT|test-salt|FEATURE_|203\.0\.113/i,
      );
    }
  });
});
