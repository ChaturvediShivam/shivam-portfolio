import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyDemoTurnstile } from "@/lib/demo/turnstile";

/**
 * Guards the demo's Turnstile verifier.
 *
 * The property under test is not "does it call Cloudflare" — it is that every
 * uncertain outcome resolves to false. This verifier is what stands between an
 * anonymous request and a billed provider call, so an accidental `return true`
 * on any error path is a spending bug, not a validation bug.
 *
 * No shared fetch stub exists in this repo — the other HTTP-adjacent tests only
 * exercise pure parsing — so this uses vitest's stubGlobal rather than adding a
 * fetch-mocking module nobody else needs yet.
 */

const TOKEN = "0.fake-turnstile-token";
const SECRET = "test-secret";
const IP = "203.0.113.7";

let savedSecret: string | undefined;

/** A siteverify response with the given JSON body. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  savedSecret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = SECRET;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  else process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = savedSecret;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyDemoTurnstile — the four required outcomes", () => {
  it("valid token -> true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ success: true })));
    await expect(verifyDemoTurnstile(TOKEN)).resolves.toBe(true);
  });

  it("invalid token -> false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ success: false, "error-codes": ["invalid-input-response"] })),
    );
    await expect(verifyDemoTurnstile(TOKEN)).resolves.toBe(false);
  });

  it("missing secret -> false, without contacting Cloudflare", async () => {
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyDemoTurnstile(TOKEN)).resolves.toBe(false);
    // The contact form returns TRUE in this situation, on purpose. This one must
    // not, and must not waste a request discovering that.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("network error -> false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(verifyDemoTurnstile(TOKEN)).resolves.toBe(false);
  });
});

describe("verifyDemoTurnstile — every other uncertain outcome is also false", () => {
  it("refuses an absent token without contacting Cloudflare", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const token of [null, undefined, ""]) {
      await expect(verifyDemoTurnstile(token)).resolves.toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ success: true }, false, 503)));
    // Body says success; status says the service is broken. Refuse.
    await expect(verifyDemoTurnstile(TOKEN)).resolves.toBe(false);
  });

  it("refuses a response that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      }) as unknown as Response),
    );
    await expect(verifyDemoTurnstile(TOKEN)).resolves.toBe(false);
  });

  it("refuses a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("The operation was aborted due to timeout");
        error.name = "TimeoutError";
        throw error;
      }),
    );
    await expect(verifyDemoTurnstile(TOKEN)).resolves.toBe(false);
  });

  it("requires success === true, not merely truthy", async () => {
    for (const body of [
      { success: "true" },
      { success: 1 },
      { success: null },
      {},
      null,
      "ok",
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(body)));
      await expect(verifyDemoTurnstile(TOKEN), `body ${JSON.stringify(body)}`).resolves.toBe(false);
    }
  });
});

describe("verifyDemoTurnstile — the request it issues", () => {
  it("posts the token to Cloudflare's siteverify endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await verifyDemoTurnstile(TOKEN);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");

    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe(TOKEN);
    expect(init.signal, "an unbounded verify would hang the analysis").toBeDefined();
  });

  it("forwards the visitor address only when one is given", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await verifyDemoTurnstile(TOKEN, IP);
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams).get("remoteip")).toBe(IP);

    fetchMock.mockClear();
    await verifyDemoTurnstile(TOKEN);
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams).get("remoteip")).toBeNull();
  });

  it("never writes the secret into a log line", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(`request failed: secret=${SECRET}`);
      }),
    );

    await verifyDemoTurnstile(TOKEN);

    // Errors from fetch can carry the request body, so only the error NAME is
    // logged, never its message.
    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SECRET);
    }
  });
});

describe("the contact form's fail-open verifier is left alone", () => {
  it("still returns true when the secret is unset", () => {
    // A divergence guard, not a test of that route. These two verifiers differ
    // on purpose: a spam row is cheap, a billed provider call is not. If you
    // deliberately change app/api/contact/route.ts, update this test with it.
    const source = readFileSync(
      join(process.cwd(), "app", "api", "contact", "route.ts"),
      "utf8",
    );
    expect(source).toContain("skipping Turnstile verification");
    expect(source).toMatch(/if \(!TURNSTILE_SECRET\) \{[\s\S]*?return true;/);
  });
});
