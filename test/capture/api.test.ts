import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Capture API.
 *
 * These endpoints are the only way the extension writes to the CRM, and they
 * are reachable from a browser. Three properties matter more than the happy
 * path:
 *
 *   1. No session, no capture. The extension holds no key; a request without a
 *      valid admin session must be refused, not degraded.
 *   2. Only http(s) pages. A capture naming `file:` or `chrome:` is either a
 *      mistake or an attempt to have the server treat local content as a job.
 *   3. The save body is an ALLOWLIST. The extension assembles its payload on a
 *      page whose contents nobody controls; spreading that into a database
 *      write would let any extra key ride along into a column.
 */

const requireAdminSession = vi.fn();
const structureCapture = vi.fn();
const findOpportunityByJobUrl = vi.fn();
const createOpportunityChecked = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ requireAdminSession }));
vi.mock("@/lib/capture/structure", () => ({ structureCapture }));
vi.mock("@/lib/opportunities", () => ({
  findOpportunityByJobUrl,
  createOpportunityChecked,
  duplicateJobUrlMessage: (d: { title: string }) => `Already tracked as "${d.title}".`,
}));

const USER = { id: "owner-1", email: "admin@example.com" };

function signedIn() {
  requireAdminSession.mockResolvedValue({
    supabase: { auth: { getUser: async () => ({ data: { user: USER } }) } },
    error: null,
  });
}

function signedOut() {
  requireAdminSession.mockResolvedValue({
    supabase: null,
    error: Response.json({ error: "Not authenticated." }, { status: 401 }),
  });
}

const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const PAGE = { url: "https://boards.greenhouse.io/acme/jobs/1", title: "Engineer", text: "x".repeat(500) };

beforeEach(() => {
  vi.clearAllMocks();
  structureCapture.mockResolvedValue({ job: { job_url: "https://x/1" }, provenance: {}, deterministicOnly: false, notice: null });
  findOpportunityByJobUrl.mockResolvedValue(null);
});

describe("POST /api/capture", () => {
  it("refuses an unauthenticated capture", async () => {
    signedOut();
    const { POST } = await import("@/app/api/capture/route");
    const response = await POST(post("http://localhost/api/capture", PAGE) as never);

    expect(response.status).toBe(401);
    expect(structureCapture, "the provider must not be called for a stranger").not.toHaveBeenCalled();
  });

  it("structures a page for a signed-in admin without writing anything", async () => {
    signedIn();
    const { POST } = await import("@/app/api/capture/route");
    const response = await POST(post("http://localhost/api/capture", PAGE) as never);

    expect(response.status).toBe(200);
    expect(structureCapture).toHaveBeenCalledOnce();
    expect(createOpportunityChecked, "structuring is a read").not.toHaveBeenCalled();
  });

  it("reports an existing opportunity alongside the preview", async () => {
    signedIn();
    findOpportunityByJobUrl.mockResolvedValue({ id: "opp-9", title: "Engineer", stage: "applied", archived_at: null });
    const { POST } = await import("@/app/api/capture/route");
    const body = await (await POST(post("http://localhost/api/capture", PAGE) as never)).json();

    // Before re-typing anything about it, not after.
    expect(body.duplicate.id).toBe("opp-9");
  });

  it("rejects non-web URLs", async () => {
    signedIn();
    const { POST } = await import("@/app/api/capture/route");
    for (const url of ["file:///etc/passwd", "chrome://settings", "javascript:alert(1)", "data:text/html,x", ""]) {
      const response = await POST(post("http://localhost/api/capture", { ...PAGE, url }) as never);
      expect(response.status, url).toBe(400);
    }
    expect(structureCapture).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    signedIn();
    const { POST } = await import("@/app/api/capture/route");
    const bad = new Request("http://localhost/api/capture", { method: "POST", body: "not json" });
    expect((await POST(bad as never)).status).toBe(400);
  });
});

describe("POST /api/capture/save", () => {
  it("refuses an unauthenticated save", async () => {
    signedOut();
    const { POST } = await import("@/app/api/capture/save/route");
    const response = await POST(post("http://localhost/api/capture/save", { title: "Engineer" }) as never);

    expect(response.status).toBe(401);
    expect(createOpportunityChecked).not.toHaveBeenCalled();
  });

  it("creates through the shared write path, so form rules apply", async () => {
    signedIn();
    createOpportunityChecked.mockResolvedValue({ ok: true, id: "opp-1" });
    const { POST } = await import("@/app/api/capture/save/route");
    const response = await POST(post("http://localhost/api/capture/save", { title: "Engineer", job_url: "https://x/1" }) as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "opp-1", url: "/admin/opportunities/opp-1" });
  });

  it("drops keys outside the allowlist instead of writing them", async () => {
    signedIn();
    createOpportunityChecked.mockResolvedValue({ ok: true, id: "opp-1" });
    const { POST } = await import("@/app/api/capture/save/route");
    await POST(
      post("http://localhost/api/capture/save", {
        title: "Engineer",
        owner_id: "someone-else",
        id: "forced-id",
        ai_summary: "injected",
        archived_at: "2020-01-01",
      }) as never,
    );

    const [, , input] = createOpportunityChecked.mock.calls[0];
    expect(input).toEqual({ title: "Engineer" });
    for (const key of ["owner_id", "id", "ai_summary", "archived_at"]) {
      expect(input, key).not.toHaveProperty(key);
    }
  });

  it("answers 409 with the existing record so the user can open it", async () => {
    signedIn();
    createOpportunityChecked.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      duplicate: { id: "opp-7", title: "Engineer", stage: "applied", archived_at: null },
    });
    const { POST } = await import("@/app/api/capture/save/route");
    const response = await POST(post("http://localhost/api/capture/save", { title: "Engineer" }) as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ duplicate: { id: "opp-7" }, url: "/admin/opportunities/opp-7" });
  });

  it("returns field errors as 400 rather than swallowing them", async () => {
    signedIn();
    createOpportunityChecked.mockResolvedValue({ ok: false, reason: "invalid", fieldErrors: { job_url: "Enter a valid URL" } });
    const { POST } = await import("@/app/api/capture/save/route");
    const response = await POST(post("http://localhost/api/capture/save", { title: "Engineer" }) as never);

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors.job_url).toMatch(/valid URL/);
  });

  it("requires a title before reaching the database", async () => {
    signedIn();
    const { POST } = await import("@/app/api/capture/save/route");
    const response = await POST(post("http://localhost/api/capture/save", { job_url: "https://x/1" }) as never);

    expect(response.status).toBe(400);
    expect(createOpportunityChecked).not.toHaveBeenCalled();
  });
});
