import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regression suite for `MIDDLEWARE_INVOCATION_TIMEOUT` on `/admin/*`.
 *
 * The defect: `updateSupabaseSession` awaited `supabase.auth.getUser()` with
 * no timeout and no error handling. When the configured Supabase host stopped
 * resolving, that call never settled — `@supabase/auth-js` retries network
 * failures with backoff — so middleware consumed Vercel's entire 25-second
 * budget and every `/admin/*` request returned `504`. Including
 * `/admin/login`, because the session check runs before the path is
 * classified, which locked the admin out of the page they needed to recover.
 *
 * Reproduced against production: `/admin` and `/admin/login` both returned
 * HTTP 504 after 25.1s when a session cookie was present. Without a cookie
 * `getUser()` short-circuits locally and never reaches the network, which is
 * why anonymous traffic looked healthy and hid the outage.
 *
 * Only `@supabase/ssr` is replaced. `updateSupabaseSession` is the shipped
 * code.
 */

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

import { updateSupabaseSession } from "@/lib/supabase/middleware";

/** Vercel's Routing Middleware ceiling. The budget this must stay under. */
const VERCEL_MIDDLEWARE_LIMIT_MS = 25_000;

const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
let saved: Record<string, string | undefined>;

const request = (path = "/admin") => new NextRequest(`https://example.com${path}`);

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  getUser.mockReset();
});

describe("updateSupabaseSession — the healthy path is unchanged", () => {
  it("returns the user when the session check succeeds", async () => {
    const user = { id: "user-1", email: "admin@example.com" };
    getUser.mockResolvedValue({ data: { user }, error: null });

    const result = await updateSupabaseSession(request());

    expect(result.user).toEqual(user);
    expect(result.response).toBeDefined();
  });

  it("returns no user when Supabase reports no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect((await updateSupabaseSession(request())).user).toBeNull();
  });

  it("returns no user when Supabase is not configured, without calling it", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect((await updateSupabaseSession(request())).user).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("updateSupabaseSession — a hanging auth host cannot stall middleware", () => {
  it("gives up well inside Vercel's 25s limit instead of hanging", async () => {
    vi.useFakeTimers();
    // Never settles: the exact behaviour of a getUser() against a host that
    // no longer resolves.
    getUser.mockReturnValue(new Promise(() => {}));

    const pending = updateSupabaseSession(request());
    await vi.advanceTimersByTimeAsync(VERCEL_MIDDLEWARE_LIMIT_MS);
    const result = await pending;

    expect(result.user).toBeNull();
    expect(result.response).toBeDefined();
  });

  it("resolves in a few seconds, not tens of seconds", async () => {
    vi.useFakeTimers();
    getUser.mockReturnValue(new Promise(() => {}));

    const pending = updateSupabaseSession(request());
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    // Before the deadline it is still waiting...
    await vi.advanceTimersByTimeAsync(2_000);
    expect(settled).toBe(false);

    // ...and shortly after it, it has given up.
    await vi.advanceTimersByTimeAsync(2_000);
    await pending;
    expect(settled).toBe(true);
  });

  it("fails closed rather than throwing, so middleware keeps serving", async () => {
    // A throw here propagated out of middleware as a 500. The route still has
    // to be able to decide what to do, which means getting an answer back.
    getUser.mockRejectedValue(new TypeError("fetch failed"));

    const result = await updateSupabaseSession(request());

    expect(result.user).toBeNull();
    expect(result.response).toBeDefined();
  });

  it("never reports a user on failure, so a failed check cannot grant access", async () => {
    // The security property. If a timeout ever resolved to a truthy user,
    // every admin page would open during an auth outage.
    for (const outcome of [
      () => getUser.mockRejectedValue(new Error("network")),
      () => getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } }),
    ]) {
      getUser.mockReset();
      outcome();
      expect((await updateSupabaseSession(request())).user).toBeFalsy();
    }
  });

  it("logs the failure instead of silently reporting a logged-out visitor", async () => {
    getUser.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    await updateSupabaseSession(request());

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[middleware]"),
      expect.anything()
    );
  });

  it("bounds the login page too, which is the page needed to recover", async () => {
    vi.useFakeTimers();
    getUser.mockReturnValue(new Promise(() => {}));

    const pending = updateSupabaseSession(request("/admin/login"));
    await vi.advanceTimersByTimeAsync(5_000);

    expect((await pending).user).toBeNull();
  });
});
