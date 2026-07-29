import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildAuthorizationUrl,
  codeChallengeFromVerifier,
  decodeIdToken,
  generateCodeVerifier,
  generateState,
  needsRefresh,
} from "@/lib/integrations/google/oauth";

const config = {
  clientId: "test-client-id",
  clientSecret: "test-secret",
  redirectUri: "https://www.example.com/api/integrations/google/callback",
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input as never)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("google/oauth PKCE", () => {
  it("generates url-safe state and verifier (no +, /, =)", () => {
    for (const v of [generateState(), generateCodeVerifier()]) {
      expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(v.length).toBeGreaterThanOrEqual(43);
    }
  });

  it("derives a deterministic S256 challenge from the verifier", () => {
    const verifier = generateCodeVerifier();
    const expected = base64url(createHash("sha256").update(verifier).digest());
    expect(codeChallengeFromVerifier(verifier)).toBe(expected);
    expect(codeChallengeFromVerifier(verifier)).toBe(codeChallengeFromVerifier(verifier));
  });
});

describe("google/oauth buildAuthorizationUrl", () => {
  it("includes all required OAuth + PKCE params", () => {
    const url = new URL(
      buildAuthorizationUrl({ config, state: "st-123", codeChallenge: "ch-456" }),
    );
    const p = url.searchParams;
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(p.get("client_id")).toBe(config.clientId);
    expect(p.get("redirect_uri")).toBe(config.redirectUri);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("state")).toBe("st-123");
    expect(p.get("code_challenge")).toBe("ch-456");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("scope")).toBe("openid email profile");
    // No client secret ever leaves in the front-channel URL.
    expect(url.toString()).not.toContain(config.clientSecret);
  });
});

describe("google/oauth decodeIdToken", () => {
  const tokenWith = (payload: Record<string, unknown>) =>
    `${base64url("hdr")}.${base64url(JSON.stringify(payload))}.${base64url("sig")}`;
  const valid = {
    sub: "123",
    email: "a@b.com",
    email_verified: true,
    name: "Ada",
    iss: "https://accounts.google.com",
    aud: config.clientId,
  };

  it("reads identity from a well-formed Google id_token", () => {
    expect(decodeIdToken(tokenWith(valid), { expectedAudience: config.clientId })).toEqual({
      sub: "123",
      email: "a@b.com",
      emailVerified: true,
      name: "Ada",
    });
  });

  it("returns null for malformed tokens or missing subject", () => {
    expect(decodeIdToken(undefined)).toBeNull();
    expect(decodeIdToken("not-a-jwt")).toBeNull();
    expect(decodeIdToken(tokenWith({ email: "x@y.com", iss: valid.iss }))).toBeNull();
  });

  it("rejects a non-Google issuer or a missing issuer", () => {
    expect(decodeIdToken(tokenWith({ ...valid, iss: "https://evil.example" }))).toBeNull();
    expect(decodeIdToken(tokenWith({ sub: "1", aud: config.clientId }))).toBeNull();
  });

  it("rejects an audience mismatch only when expectedAudience is set", () => {
    expect(
      decodeIdToken(tokenWith({ ...valid, aud: "someone-else" }), { expectedAudience: config.clientId }),
    ).toBeNull();
    // Without an expected audience, aud is not enforced (issuer + sub still are).
    expect(decodeIdToken(tokenWith({ ...valid, aud: "someone-else" }))).not.toBeNull();
  });
});

describe("google/oauth needsRefresh", () => {
  it("is true for null/unparseable/near-expiry, false for a far-future expiry", () => {
    expect(needsRefresh(null)).toBe(true);
    expect(needsRefresh("not-a-date")).toBe(true);
    expect(needsRefresh(new Date(Date.now() + 30_000).toISOString())).toBe(true); // within 60s skew
    expect(needsRefresh(new Date(Date.now() + 3_600_000).toISOString())).toBe(false);
  });
});
