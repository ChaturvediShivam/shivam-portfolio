import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { featureEnabled } from "@/lib/featureFlags";
import {
  DEMO_MAX_RESUME_CHARS,
  DEMO_MAX_JD_CHARS,
  DEMO_MAX_FILE_BYTES,
  DEMO_VISITOR_LIMIT,
  DEMO_VISITOR_WINDOW_MINUTES,
  demoOwnerId,
  demoDailyTokenBudget,
  demoIpSalt,
  demoConfigured,
} from "@/lib/demo/config";
import { MAX_FILE_BYTES } from "@/types/upload";

/**
 * Guards the demo's configuration contract.
 *
 * Two properties matter more than the individual numbers: the flag is off
 * unless explicitly enabled, and every demo ceiling is strictly below its
 * authenticated equivalent. The second is the one that rots — a later change
 * that raises a demo cap past the admin cap would silently make anonymous
 * traffic more privileged than the operator.
 */

/** The authenticated ceilings, mirrored from app/admin/(dashboard)/resume-ai/actions.ts. */
const ADMIN_MAX_RESUME_CHARS = 200_000;
const ADMIN_MAX_JD_CHARS = 100_000;

const ENV_KEYS = [
  "FEATURE_PUBLIC_DEMO",
  "DEMO_OWNER_ID",
  "AI_DEMO_DAILY_TOKEN_BUDGET",
  "DEMO_IP_SALT",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("FEATURE_PUBLIC_DEMO", () => {
  it("is off when unset", () => {
    expect(featureEnabled("FEATURE_PUBLIC_DEMO")).toBe(false);
  });

  it('is on only for exactly "true"', () => {
    for (const value of ["false", "TRUE", "1", "yes", "", " true"]) {
      process.env.FEATURE_PUBLIC_DEMO = value;
      expect(featureEnabled("FEATURE_PUBLIC_DEMO"), `"${value}" must not enable`).toBe(false);
    }
    process.env.FEATURE_PUBLIC_DEMO = "true";
    expect(featureEnabled("FEATURE_PUBLIC_DEMO")).toBe(true);
  });
});

describe("demo ceilings are stricter than authenticated ones", () => {
  it("bounds payloads below the admin action's limits", () => {
    expect(DEMO_MAX_RESUME_CHARS).toBeLessThan(ADMIN_MAX_RESUME_CHARS);
    expect(DEMO_MAX_JD_CHARS).toBeLessThan(ADMIN_MAX_JD_CHARS);
  });

  it("bounds uploads below the shared MAX_FILE_BYTES", () => {
    expect(DEMO_MAX_FILE_BYTES).toBeLessThan(MAX_FILE_BYTES);
  });

  it("keeps every ceiling positive and usable for a real resume", () => {
    // A real resume is a few thousand characters; a floor that low would make
    // the demo reject legitimate input.
    expect(DEMO_MAX_RESUME_CHARS).toBeGreaterThan(10_000);
    expect(DEMO_MAX_JD_CHARS).toBeGreaterThan(5_000);
    expect(DEMO_MAX_FILE_BYTES).toBeGreaterThan(1024 * 1024);
    expect(DEMO_VISITOR_LIMIT).toBeGreaterThan(0);
    expect(DEMO_VISITOR_WINDOW_MINUTES).toBeGreaterThan(0);
  });
});

describe("demoOwnerId", () => {
  it("returns null when unset, so the demo refuses rather than runs unbudgeted", () => {
    expect(demoOwnerId()).toBeNull();
  });

  it("treats blank and whitespace-only as unset", () => {
    for (const value of ["", "   ", "\t"]) {
      process.env.DEMO_OWNER_ID = value;
      expect(demoOwnerId()).toBeNull();
    }
  });

  it("returns the trimmed id when set", () => {
    process.env.DEMO_OWNER_ID = "  00000000-0000-4000-8000-000000000000  ";
    expect(demoOwnerId()).toBe("00000000-0000-4000-8000-000000000000");
  });
});

describe("demoDailyTokenBudget", () => {
  it("never returns unlimited, unlike the authenticated budget", () => {
    expect(demoDailyTokenBudget()).toBeGreaterThan(0);
  });

  it("falls back to the default for missing, malformed or non-positive values", () => {
    const fallback = demoDailyTokenBudget();
    for (const value of ["", "abc", "0", "-500", "NaN"]) {
      process.env.AI_DEMO_DAILY_TOKEN_BUDGET = value;
      expect(demoDailyTokenBudget(), `"${value}" must fall back`).toBe(fallback);
    }
  });

  it("honours a valid ceiling", () => {
    process.env.AI_DEMO_DAILY_TOKEN_BUDGET = "12345";
    expect(demoDailyTokenBudget()).toBe(12_345);
  });
});

describe("demoIpSalt", () => {
  it("returns null when unset, so no unsalted hash is ever produced", () => {
    expect(demoIpSalt()).toBeNull();
    process.env.DEMO_IP_SALT = "   ";
    expect(demoIpSalt()).toBeNull();
  });

  it("returns the salt when set", () => {
    process.env.DEMO_IP_SALT = "salty";
    expect(demoIpSalt()).toBe("salty");
  });
});

describe("demoConfigured", () => {
  it("is false unless BOTH owner and salt are present", () => {
    expect(demoConfigured()).toBe(false);

    process.env.DEMO_OWNER_ID = "owner";
    expect(demoConfigured()).toBe(false);

    delete process.env.DEMO_OWNER_ID;
    process.env.DEMO_IP_SALT = "salt";
    expect(demoConfigured()).toBe(false);

    process.env.DEMO_OWNER_ID = "owner";
    expect(demoConfigured()).toBe(true);
  });

  it("is independent of the feature flag", () => {
    process.env.DEMO_OWNER_ID = "owner";
    process.env.DEMO_IP_SALT = "salt";
    // Configured but flag off: a deliberate off is distinguishable from a
    // misconfiguration, which is why the caller checks them separately.
    expect(demoConfigured()).toBe(true);
    expect(featureEnabled("FEATURE_PUBLIC_DEMO")).toBe(false);
  });
});
