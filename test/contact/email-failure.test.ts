import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Failure-state regression suite for the contact form.
 *
 * The defect this guards: when RESEND_API_KEY or CONTACT_RECIPIENT_EMAIL was
 * absent, `sendNotificationEmail` logged a warning and returned ok, so the
 * route answered 200 and the visitor saw "Inquiry sent — I will respond within
 * 24 hours". Nobody had been notified. That is a silent lead leak: convenient
 * in local development, dishonest in production, and invisible in both because
 * the only signal was a server log nobody reads.
 *
 * The inquiry row is written before any email is attempted, so a delivery
 * failure never loses the lead — it is still in the admin dashboard. These
 * tests pin that ordering too, because it is what makes returning 500 safe.
 */

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const single = vi.fn(async () => ({ data: { id: "inq-1" }, error: null }));
const insert = vi.fn(() => ({ select: () => ({ single }) }));
const from = vi.fn(() => ({ insert }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from }) }));

const isRateLimited = vi.fn(async () => false);
vi.mock("@/lib/rateLimit", () => ({ isRateLimited }));

const logActivity = vi.fn(async () => {});
vi.mock("@/lib/inquiries", () => ({ logActivity }));

const VALID = {
  name: "Dana Whitfield",
  email: "dana@example.com",
  organization: "Meridian",
  message: "I would like to talk about a role.",
};

/** The route reads its config into module constants, so each case re-imports. */
async function post(body: Record<string, unknown> = VALID) {
  vi.resetModules();
  const { POST } = await import("@/app/api/contact/route");
  return POST({ json: async () => body } as never);
}

const ENV = [
  "RESEND_API_KEY",
  "CONTACT_RECIPIENT_EMAIL",
  "FROM_EMAIL",
  "CLOUDFLARE_TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV) saved[key] = process.env[key];
  // Turnstile stays unset so verification is skipped — this suite is about
  // email, and the human check has its own coverage.
  delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.CONTACT_RECIPIENT_EMAIL = "owner@example.com";

  send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("missing email configuration in production", () => {
  for (const missing of ["RESEND_API_KEY", "CONTACT_RECIPIENT_EMAIL"] as const) {
    it(`fails the request with 500 when ${missing} is absent`, async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env[missing];

      const response = await post();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("Failed to deliver"),
      });
    });

    it(`still stores the inquiry when ${missing} is absent`, async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env[missing];

      await post();

      // The lead survives the failure — this is what makes the 500 safe to
      // return rather than a reason to keep lying about success.
      expect(insert).toHaveBeenCalledOnce();
      expect(insert.mock.calls[0][0]).toMatchObject({
        name: VALID.name,
        email: VALID.email,
        status: "New",
        lead_source: "Website",
      });
    });
  }

  it("never reports success when both variables are absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_RECIPIENT_EMAIL;

    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.not.toHaveProperty("success");
  });

  it("names every missing variable in the server log, not just the first", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_RECIPIENT_EMAIL;
    const logged = vi.mocked(console.error);

    await post();

    const line = logged.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(line).toContain("RESEND_API_KEY");
    expect(line).toContain("CONTACT_RECIPIENT_EMAIL");
  });

  it("sends no email at all when unconfigured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.RESEND_API_KEY;

    await post();

    expect(send).not.toHaveBeenCalled();
  });
});

describe("missing email configuration in development", () => {
  it("still succeeds, so the form works without a Resend account", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.RESEND_API_KEY;

    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });
});

describe("provider failure in production", () => {
  it("returns 500 rather than falsely reporting success", async () => {
    vi.stubEnv("NODE_ENV", "production");
    send.mockResolvedValueOnce({ data: null, error: { message: "domain not verified" } });

    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Failed to deliver"),
    });
  });

  it("does not leak the provider's error text to the visitor", async () => {
    vi.stubEnv("NODE_ENV", "production");
    send.mockResolvedValueOnce({ data: null, error: { message: "domain not verified" } });

    const body = JSON.stringify(await (await post()).json());

    expect(body).not.toContain("domain not verified");
  });

  it("keeps the inquiry when the provider rejects the send", async () => {
    vi.stubEnv("NODE_ENV", "production");
    send.mockResolvedValueOnce({ data: null, error: { message: "rate limited" } });

    await post();

    expect(insert).toHaveBeenCalledOnce();
  });
});

describe("fully configured production", () => {
  it("returns success and notifies the configured recipient", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });

    const notification = send.mock.calls[0][0];
    expect(notification).toMatchObject({
      to: "owner@example.com",
      replyTo: VALID.email,
    });
    // Notification first, then the visitor's acknowledgement.
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({ to: VALID.email });
  });

  it("a failed acknowledgement never fails the submission", async () => {
    vi.stubEnv("NODE_ENV", "production");
    send
      .mockResolvedValueOnce({ data: { id: "email-1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "mailbox full" } });

    const response = await post();

    // The courtesy receipt is not a delivery guarantee: the owner was already
    // notified and the lead is stored, so the visitor still gets a success.
    expect(response.status).toBe(200);
  });
});

describe("validation still runs before any of this", () => {
  it("rejects an empty submission without touching the database or provider", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await post({});

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
