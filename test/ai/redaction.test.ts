import { describe, it, expect, afterEach } from "vitest";
import { redact } from "@/lib/ai/redaction";

const ORIGINAL = process.env.AI_PROVIDER_API_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AI_PROVIDER_API_KEY;
  else process.env.AI_PROVIDER_API_KEY = ORIGINAL;
});

describe("redaction", () => {
  it("removes a known secret value from the environment", () => {
    process.env.AI_PROVIDER_API_KEY = "super-secret-value-1234";
    expect(redact("key is super-secret-value-1234 ok")).toBe("key is [redacted] ok");
  });

  it("redacts every secret env var under its real deployed name", () => {
    // Guards against a typo'd key silently never matching — the entry name must
    // be the variable that is actually set in the environment.
    const names = [
      "AI_PROVIDER_API_KEY",
      "CRON_SECRET",
      "TOKEN_ENCRYPTION_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "RESEND_API_KEY",
      "CLOUDFLARE_TURNSTILE_SECRET_KEY",
    ];

    for (const name of names) {
      const previous = process.env[name];
      process.env[name] = `value-for-${name}-0123456789`;
      expect(redact(`leak: value-for-${name}-0123456789`)).toBe("leak: [redacted]");
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  });

  it("ignores short env values, which would false-positive across ordinary text", () => {
    process.env.AI_PROVIDER_API_KEY = "abc";
    expect(redact("the abc company")).toBe("the abc company");
  });

  it("removes bearer tokens", () => {
    expect(redact("Authorization: Bearer abcdefghijklmnopqrstuvwxyz")).toContain("[redacted]");
  });

  it("removes vendor-style api keys", () => {
    expect(redact("use sk-abcdefghijklmnopqrstuvwxyz now")).toBe("use [redacted] now");
    expect(redact("ghp_abcdefghijklmnopqrstuvwxyz")).toBe("[redacted]");
  });

  it("removes JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redact(`token ${jwt}`)).toBe("token [redacted]");
  });

  it("leaves the CRM's actual subject matter alone", () => {
    const text = "Ada Lovelace <ada@example.com> asked about the Senior Engineer role.";
    expect(redact(text)).toBe(text);
  });

  it("is idempotent, so it is safe at both the prompt and persistence boundaries", () => {
    process.env.AI_PROVIDER_API_KEY = "super-secret-value-1234";
    const once = redact("k=super-secret-value-1234");
    expect(redact(once)).toBe(once);
  });

  it("handles empty input", () => {
    expect(redact("")).toBe("");
  });
});
