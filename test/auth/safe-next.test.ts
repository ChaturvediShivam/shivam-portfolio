import { describe, it, expect } from "vitest";
import { safeNext, DEFAULT_NEXT } from "@/lib/auth/safeNext";

/**
 * Regression suite for the post-auth redirect validator (CWE-601).
 *
 * The vulnerability this guards: `origin` carries no trailing slash, so a
 * `next` of "@evil.com" concatenates to "https://site.com@evil.com", where
 * site.com becomes userinfo and evil.com becomes the authority — a
 * cross-origin redirect issued from a trusted domain, reachable by an
 * unauthenticated GET.
 *
 * Every rejection must land on DEFAULT_NEXT: the validator is fail-safe, never
 * throwing, so a malformed link still delivers the visitor somewhere useful.
 */

const ORIGIN = "https://shivamchaturvedi.com";

/** Asserts rejection AND that the fallback is the documented destination. */
function expectRejected(input: string | null | undefined, origin = ORIGIN) {
  expect(safeNext(input, origin)).toBe(DEFAULT_NEXT);
}

function expectAccepted(input: string, origin = ORIGIN) {
  expect(safeNext(input, origin)).toBe(input);
}

describe("safeNext — acceptance paths", () => {
  it("accepts the two paths the application actually requests", () => {
    // app/admin/signup/page.tsx -> ?next=/auth/verified
    expectAccepted("/auth/verified");
    // app/admin/login/page.tsx sends no next; the default must survive.
    expect(safeNext(null, ORIGIN)).toBe("/admin/reset-password");
  });

  it("accepts ordinary same-origin relative paths", () => {
    expectAccepted("/admin/reset-password");
    expectAccepted("/admin/dashboard");
    expectAccepted("/");
    expectAccepted("/a");
    expectAccepted("/deeply/nested/path/segment");
  });

  it("accepts query strings", () => {
    expectAccepted("/admin/dashboard?tab=1");
    expectAccepted("/admin/opportunities?stage=offer&sort=desc");
    expectAccepted("/search?q=hello%20world");
    expectAccepted("/admin?empty=");
  });

  it("accepts hash fragments", () => {
    expectAccepted("/admin/settings#integrations");
    expectAccepted("/docs#section-2");
    expectAccepted("/admin/dashboard?tab=1#panel");
  });

  it("accepts non-ASCII paths that decode cleanly", () => {
    expectAccepted("/admin/ünïcode");
    expectAccepted("/admin/日本語");
    expectAccepted("/admin/emoji-🎯");
    expectAccepted("/admin/%C3%BCber"); // valid percent-encoded UTF-8
  });

  it("accepts double-encoded input, which stays a literal path segment", () => {
    // "/%252F%252Fevil.com" decodes ONCE to "/%2F%2Fevil.com" — still a path.
    // The browser likewise decodes once, so this never becomes an authority.
    // Documented as intentionally safe rather than an oversight.
    expectAccepted("/%252F%252Fevil.com");
    expectAccepted("/%255Cevil.com");
  });
});

describe("safeNext — empty, null and undefined", () => {
  it("falls back for every falsy input", () => {
    expectRejected(null);
    expectRejected(undefined);
    expectRejected("");
  });
});

describe("safeNext — the proven userinfo vector", () => {
  it("rejects @-prefixed values that would promote a foreign authority", () => {
    expectRejected("@evil.com");
    expectRejected("@evil.com/admin/reset-password");
    expectRejected("@evil.com:443");
    expectRejected("@127.0.0.1");
  });

  it("proves the vector is real: unguarded concatenation yields a foreign host", () => {
    // Documents WHY the guard exists — this is the pre-fix behaviour.
    expect(new URL(`${ORIGIN}@evil.com`).host).toBe("evil.com");
    // And that the guarded value never reaches that concatenation.
    expect(safeNext("@evil.com", ORIGIN)).toBe(DEFAULT_NEXT);
  });
});

describe("safeNext — protocol-relative URLs", () => {
  it("rejects scheme-inheriting authorities", () => {
    expectRejected("//evil.com");
    expectRejected("///evil.com");
    expectRejected("////evil.com");
    expectRejected("//evil.com/admin/reset-password");
    expectRejected("//user:pass@evil.com");
  });
});

describe("safeNext — absolute URLs and schemes", () => {
  it("rejects absolute http(s) URLs", () => {
    expectRejected("https://evil.com");
    expectRejected("http://evil.com");
    expectRejected("https://shivamchaturvedi.com/admin"); // even same-origin absolute
  });

  it("rejects non-http schemes", () => {
    expectRejected("javascript:alert(1)");
    expectRejected("data:text/html,<script>alert(1)</script>");
    expectRejected("file:///etc/passwd");
    expectRejected("vbscript:msgbox(1)");
  });

  it("rejects anything without a leading slash", () => {
    expectRejected("admin/dashboard");
    expectRejected("evil.com");
    expectRejected(" /admin/dashboard"); // leading space defeats startsWith
  });
});

describe("safeNext — backslash normalisation", () => {
  it("rejects raw backslashes, which browsers read as forward slashes", () => {
    expectRejected("/\\evil.com");
    expectRejected("\\\\evil.com");
    expectRejected("\\/evil.com");
    expectRejected("/admin\\..\\evil");
    expectRejected("/path/with\\backslash");
  });
});

describe("safeNext — encoded separators and traversal", () => {
  it("rejects percent-encoded slashes that decode into an authority", () => {
    expectRejected("/%2F%2Fevil.com");
    expectRejected("/%2f%2fevil.com"); // lowercase hex
  });

  it("rejects percent-encoded backslashes", () => {
    expectRejected("/%5Cevil.com");
    expectRejected("/%5cevil.com");
  });

  it("rejects traversal, encoded or literal", () => {
    expectRejected("/../../etc/passwd");
    expectRejected("/..%2F..%2Fadmin");
    expectRejected("/%2E%2E/admin");
    expectRejected("/admin/../../../root");
  });
});

describe("safeNext — malformed URI decoding", () => {
  it("rejects malformed escapes instead of throwing", () => {
    // decodeURIComponent throws URIError on these; the validator must catch.
    expect(() => decodeURIComponent("/%")).toThrow();
    expectRejected("/%");
    expectRejected("/%E0%A4%A");
    expectRejected("/%ZZ");
    expectRejected("/valid/%");
  });

  it("rejects overlong / invalid UTF-8 sequences", () => {
    expectRejected("/%C0%AF"); // overlong encoding of "/"
    expectRejected("/%FF%FE");
  });

  it("never throws, for any input", () => {
    const hostile = [
      "/%", "%%%", "\\", "//", "@", "", "/ ", "/%C0%AF",
      "javascript:alert(1)", "/".repeat(5000), "\uD800", "/%F0%9F",
    ];
    for (const input of hostile) {
      expect(() => safeNext(input, ORIGIN)).not.toThrow();
    }
  });
});

describe("safeNext — unicode edge cases", () => {
  it("rejects lookalike separators that are not U+002F", () => {
    expectRejected("／evil.com"); // U+FF0F FULLWIDTH SOLIDUS
    expectRejected("∕evil.com"); // U+2215 DIVISION SLASH
    expectRejected("⁄evil.com"); // U+2044 FRACTION SLASH
  });

  it("rejects control and direction-manipulating characters at the boundary", () => {
    expectRejected(" /admin");
    expectRejected("‮/admin"); // RTL override
    expectRejected("﻿/admin"); // BOM
    expectRejected("\n/admin");
    expectRejected("\t/admin");
  });

  it("rejects an unpaired surrogate, which decodeURIComponent survives but URL may not", () => {
    expect(() => safeNext("/\uD800", ORIGIN)).not.toThrow();
  });
});

describe("safeNext — origin backstop branches", () => {
  it("falls back when the origin itself is unparseable", () => {
    // Reaches the `new URL(...)` catch: a relative path against a bad base throws.
    expect(safeNext("/admin/dashboard", "not-a-valid-origin")).toBe(DEFAULT_NEXT);
    expect(safeNext("/admin/dashboard", "")).toBe(DEFAULT_NEXT);
  });

  it("falls back when the resolved origin does not match the supplied origin", () => {
    // Reaches the `origin !== origin` branch: URL.origin normalises away the
    // trailing slash, so a caller passing one gets a mismatch and a safe fallback.
    expect(safeNext("/admin/dashboard", "https://shivamchaturvedi.com/")).toBe(DEFAULT_NEXT);
  });

  it("accepts against a non-standard but valid origin", () => {
    expect(safeNext("/admin/dashboard", "http://localhost:3000")).toBe("/admin/dashboard");
  });
});

describe("safeNext — invariants", () => {
  it("returns the input unchanged when accepted, never a rewritten value", () => {
    for (const ok of ["/a", "/admin/dashboard?tab=1", "/x#y", "/admin/ünïcode"]) {
      expect(safeNext(ok, ORIGIN)).toBe(ok);
    }
  });

  it("returns a relative path beginning with exactly one slash, always", () => {
    const inputs = [
      null, undefined, "", "@evil.com", "//evil.com", "https://evil.com",
      "/\\evil.com", "/%2F%2Fevil.com", "/%", "/admin/dashboard", "/auth/verified",
    ];
    for (const input of inputs) {
      const out = safeNext(input, ORIGIN);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      // The critical property: concatenation can never leave the origin.
      expect(new URL(`${ORIGIN}${out}`).host).toBe("shivamchaturvedi.com");
    }
  });
});
