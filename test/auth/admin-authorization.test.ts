import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isActionError } from "@/lib/action-result";

/**
 * Regression suite for the admin authorization boundary.
 *
 * The defect this guards against: every RLS policy in this schema grants full
 * access to any authenticated role, and the `ADMIN_SIGNUP_ALLOWLIST` was
 * checked only inside `/api/auth/signup`. Supabase's own auth endpoint is
 * reachable directly with the public anon key, so an attacker could create and
 * confirm an account without that route ever running, then present a perfectly
 * valid session. Every admin chokepoint asked only "is there a user?", so that
 * session cleared the whole CRM: inquiries, contacts, messages, and the
 * encrypted OAuth tokens in integration_accounts.
 *
 * The fix is to make the allowlist an *access* check rather than a signup-time
 * one. These tests therefore assert the property that matters — authenticated
 * is not authorized — at each of the three places it is now enforced, and that
 * every one of them fails closed when the allowlist itself is missing.
 *
 * Only the transport is replaced (`next/headers` cookies and the `@supabase/ssr`
 * client factory). `createServerSupabaseClient`, `requireAdminSession`,
 * `getAdminActionContext` and `withAdminAction` are the shipped code.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/middleware", () => ({ updateSupabaseSession: vi.fn() }));

import { requireAdminSession } from "@/lib/supabase/server";
import { getAdminActionContext, withAdminAction } from "@/lib/actions";
import { actionSuccess } from "@/lib/action-result";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

const ADMIN = "admin@example.com";
const INTRUDER = "attacker@example.com";

/** The session Supabase reports. `null` means no session at all. */
function signedInAs(email: string | null | undefined | false) {
  const user = email === false ? null : { id: "user-1", email };
  getUser.mockResolvedValue({ data: { user }, error: null });
  vi.mocked(updateSupabaseSession).mockImplementation(async (request) => ({
    response: new Response(null) as never,
    user: user as never,
    ...(request ? {} : {}),
  }));
}

const ENV = ["ADMIN_SIGNUP_ALLOWLIST", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  process.env.ADMIN_SIGNUP_ALLOWLIST = ADMIN;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
  getUser.mockReset();
});

describe("requireAdminSession", () => {
  it("admits the allowlisted admin", async () => {
    signedInAs(ADMIN);
    const { supabase, error } = await requireAdminSession();

    expect(error).toBeNull();
    expect(supabase).not.toBeNull();
  });

  it("is case- and whitespace-insensitive, so the real admin is never locked out", async () => {
    process.env.ADMIN_SIGNUP_ALLOWLIST = ` ${ADMIN.toUpperCase()} `;
    signedInAs(ADMIN);

    expect((await requireAdminSession()).error).toBeNull();
  });

  it("rejects an authenticated user who is not on the allowlist with 403", async () => {
    signedInAs(INTRUDER);
    const { supabase, error } = await requireAdminSession();

    expect(supabase).toBeNull();
    expect(error?.status).toBe(403);
  });

  it("rejects an unauthenticated caller with 401, distinctly from 403", async () => {
    signedInAs(false);
    const { error } = await requireAdminSession();

    expect(error?.status).toBe(401);
  });

  it("is no longer a session-presence check", async () => {
    // The precise defect: a valid session that is not the admin's. If this ever
    // passes again, the whole database is open to any confirmed Supabase user.
    signedInAs(INTRUDER);
    expect((await requireAdminSession()).supabase).toBeNull();
  });
});

describe("withAdminAction / getAdminActionContext", () => {
  it("runs the action body for the allowlisted admin", async () => {
    signedInAs(ADMIN);
    const body = vi.fn(async () => actionSuccess("done"));

    const result = await withAdminAction(body);

    expect(body).toHaveBeenCalledOnce();
    expect(isActionError(result)).toBe(false);
  });

  it("never runs the action body for an authenticated non-admin", async () => {
    signedInAs(INTRUDER);
    const body = vi.fn(async () => actionSuccess("done"));

    const result = await withAdminAction(body);

    // Not merely an error result — the mutation must not execute at all.
    expect(body).not.toHaveBeenCalled();
    expect(isActionError(result)).toBe(true);
  });

  it("rejects an unauthenticated caller", async () => {
    signedInAs(false);
    const body = vi.fn(async () => actionSuccess("done"));

    expect(isActionError(await withAdminAction(body))).toBe(true);
    expect(body).not.toHaveBeenCalled();
  });

  it("distinguishes not-signed-in from not-authorized", async () => {
    signedInAs(false);
    const anon = await getAdminActionContext();
    signedInAs(INTRUDER);
    const intruder = await getAdminActionContext();

    expect(anon.context).toBeNull();
    expect(intruder.context).toBeNull();
    expect(anon.error).not.toEqual(intruder.error);
  });
});

describe("middleware", () => {
  const visit = (path: string) => middleware(new NextRequest(`https://example.com${path}`));

  it("lets the admin through to a dashboard page", async () => {
    signedInAs(ADMIN);
    expect((await visit("/admin/contacts")).status).not.toBe(403);
  });

  it("blocks an authenticated non-admin from admin pages", async () => {
    // Admin pages query the database in their own Server Components and pass
    // through neither chokepoint above, so this is their only guard.
    signedInAs(INTRUDER);
    expect((await visit("/admin/contacts")).status).toBe(403);
  });

  it("redirects an unauthenticated visitor to the login page", async () => {
    signedInAs(false);
    const response = await visit("/admin/contacts");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });

  it("does not bounce a non-admin session away from the login page", async () => {
    // Otherwise the two rules ping-pong: blocked from /admin for not being the
    // admin, redirected off /admin/login for having a session. Reaching login is
    // also how they sign in as someone who does have access.
    signedInAs(INTRUDER);
    const response = await visit("/admin/login");

    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(403);
  });

  it("still sends the signed-in admin from login to the dashboard", async () => {
    signedInAs(ADMIN);
    const response = await visit("/admin/login");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/admin");
  });

  it("leaves the reset-password page reachable without a session", async () => {
    signedInAs(false);
    expect((await visit("/admin/reset-password")).status).not.toBe(307);
  });
});

describe("fails closed on a missing or malformed allowlist", () => {
  // A misconfigured allowlist must deny everyone rather than admit everyone.
  // These are the values a deploy realistically produces: unset, blank, or a
  // list of separators that parses to nothing.
  const broken: Array<[string, string | undefined]> = [
    ["unset", undefined],
    ["empty", ""],
    ["whitespace only", "   "],
    ["separators only", ",,,"],
    ["separators and spaces", " , , "],
  ];

  for (const [label, value] of broken) {
    it(`denies the admin themselves when the allowlist is ${label}`, async () => {
      if (value === undefined) delete process.env.ADMIN_SIGNUP_ALLOWLIST;
      else process.env.ADMIN_SIGNUP_ALLOWLIST = value;
      signedInAs(ADMIN);

      expect((await requireAdminSession()).error?.status).toBe(403);
      expect(isActionError(await withAdminAction(async () => actionSuccess("x")))).toBe(true);
      expect(
        (await middleware(new NextRequest("https://example.com/admin/contacts"))).status,
      ).toBe(403);
    });
  }

  it("denies a session carrying no email address", async () => {
    signedInAs(undefined);
    expect((await requireAdminSession()).error?.status).toBe(403);
  });
});
