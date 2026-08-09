import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSupabaseStub } from "@/test/stubs/supabase";
import { logDemoEvent } from "@/lib/demo/telemetry";
import { withPublicDemoAction, demoSuccess } from "@/lib/demo/publicAction";

/**
 * What the demo is allowed to write to a log.
 *
 * The events exist so launch health is visible. The risk they introduce is that
 * a well-meaning addition later attaches "just the resume" or "just the address"
 * for debugging, and the server log becomes a file of strangers' CVs. These
 * tests make that a failing build rather than a discovery.
 */

const OWNER = "00000000-0000-4000-8000-000000000000";
const IP = "203.0.113.7";
const ENV = ["FEATURE_PUBLIC_DEMO", "DEMO_OWNER_ID", "DEMO_IP_SALT"] as const;
let saved: Record<string, string | undefined>;
let lines: string[];

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  process.env.FEATURE_PUBLIC_DEMO = "true";
  process.env.DEMO_OWNER_ID = OWNER;
  process.env.DEMO_IP_SALT = "test-salt";
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "super-secret-value";

  lines = [];
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("logDemoEvent", () => {
  it("emits one parseable line per event", () => {
    logDemoEvent("analysis_ok", { score: 76, sample: true, ms: 1200 });

    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith("[demo:event] ")).toBe(true);

    const payload = JSON.parse(lines[0].replace("[demo:event] ", ""));
    expect(payload).toEqual({ event: "analysis_ok", score: 76, sample: true, ms: 1200 });
  });

  it("carries only the fields it was given", () => {
    logDemoEvent("ai_unavailable", { reason: "budget" });
    const payload = JSON.parse(lines[0].replace("[demo:event] ", ""));

    expect(Object.keys(payload).sort()).toEqual(["event", "reason"]);
  });
});

describe("gate events never carry content or identifiers", () => {
  it("logs a refusal without the address, the salt or the turnstile secret", async () => {
    process.env.FEATURE_PUBLIC_DEMO = "false";
    const stub = createSupabaseStub();

    await withPublicDemoAction(
      { turnstileToken: "0.a-real-looking-token", visitorIp: IP },
      async () => demoSuccess(null),
      () => stub.client,
    );

    const all = lines.join("\n");
    expect(all).toContain("demo_disabled");
    for (const secret of [IP, "test-salt", "super-secret-value", "0.a-real-looking-token", OWNER]) {
      expect(all, `"${secret}" must never be logged`).not.toContain(secret);
    }
  });

  it("never logs resume or job description text", async () => {
    const RESUME = "JORDAN ELLIS confidential career history";
    const JD = "Meridian AI internal hiring notes";
    process.env.FEATURE_PUBLIC_DEMO = "false";
    const stub = createSupabaseStub();

    await withPublicDemoAction(
      { turnstileToken: "tok", visitorIp: IP },
      async () => demoSuccess({ resumeText: RESUME, jobDescription: JD }),
      () => stub.client,
    );

    const all = lines.join("\n");
    expect(all).not.toContain("JORDAN ELLIS");
    expect(all).not.toContain("confidential");
    expect(all).not.toContain("Meridian AI internal");
  });
});

describe("every documented launch event is expressible", () => {
  it("covers the outcomes an operator needs to tell apart", () => {
    // Named explicitly so removing one from the union is a failing test rather
    // than a silent loss of visibility at launch.
    for (const event of [
      "demo_disabled",
      "demo_unconfigured",
      "verification_failed",
      "rate_limited",
      "invalid_input",
      "analysis_ok",
      "ai_unavailable",
      "provider_failed",
      "internal_error",
    ] as const) {
      lines = [];
      logDemoEvent(event);
      expect(JSON.parse(lines[0].replace("[demo:event] ", "")).event).toBe(event);
    }
  });

  it("distinguishes the four reasons a review can be skipped", () => {
    for (const reason of ["budget", "flag_off", "provider_error", "ungradeable"] as const) {
      lines = [];
      logDemoEvent("ai_unavailable", { reason });
      expect(JSON.parse(lines[0].replace("[demo:event] ", "")).reason).toBe(reason);
    }
  });
});
