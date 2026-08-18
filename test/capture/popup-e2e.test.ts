import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import type { CapturedPage } from "@/types/capture";

/**
 * The whole capture flow, end to end, on one real page.
 *
 * Every other capture suite stops at the server: it asserts that
 * `structureCapture` returns a description and takes on faith that the field
 * arrives in the popup and leaves again in the save payload. Those two hops are
 * the ones a person actually experiences, and until this file nothing tested
 * them — a correct extractor with a popup that rendered an empty textarea would
 * have passed the entire suite.
 *
 * So this runs the SHIPPED artefacts, not stand-ins: the real `popup.html` and
 * `popup.js` in a DOM, fed the real `/api/capture` response, with the resulting
 * save body posted to the real save route. Only Chrome's extension APIs, the
 * network and the database are stubbed, because those are the things a test
 * cannot have.
 *
 * The fixture is the live jobs.surelyremote.com posting captured with
 * `extension/extractor.js`, verified byte-for-byte against the browser
 * (12,874 characters, matching checksums) rather than hand-written — a
 * hand-trimmed fixture is how a description defect hid here once already.
 */

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "test/capture/fixtures/surelyremote-live.json"), "utf8"),
) as CapturedPage;

/** What the employer wrote, and what the board wrote about it. */
const EMPLOYER = [
  "This role focuses on building practical AI agents",
  "Responsibilities",
  "• Build AI agents, workflows, tools",
  "Skills & Requirements",
  "Required Skills:",
  "• Python",
  "Nice-to-Have Skills:",
  "About the Company",
  "Bjak is a leading Southeast Asian insurance",
];
const BOARD = [
  "Editorial Analysis",
  "Growth Opportunities",
  "Application Guide",
  "Remote Readiness Overview",
  "Job Summary",
  "Our Commitment to Your Safety",
  "Written by Surely Remote",
];

vi.mock("@/lib/supabase/server", () => ({
  requireAdminSession: async () => ({
    supabase: { auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) } },
    error: null,
  }),
}));

const created: Record<string, unknown>[] = [];
vi.mock("@/lib/opportunities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/opportunities")>()),
  findOpportunityByJobUrl: async () => null,
  createOpportunityChecked: async (_client: unknown, _owner: string, input: Record<string, unknown>) => {
    created.push(input);
    return { ok: true, id: "op-1" };
  },
}));

async function post(url: string, body: unknown, handler: (request: never) => Promise<Response>) {
  const { NextRequest } = await import("next/server");
  const request = new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handler(request as never);
}

describe("browser → API → popup → save", () => {
  let captured: Record<string, unknown>;
  let saved: Record<string, string> | null = null;
  let window: JSDOM["window"];

  beforeAll(async () => {
    const { POST } = await import("@/app/api/capture/route");
    const response = await post("http://localhost/api/capture", FIXTURE, POST);
    expect(response.status).toBe(200);
    captured = await response.json();

    const dir = join(process.cwd(), "extension");
    window = new JSDOM(readFileSync(join(dir, "popup.html"), "utf8"), {
      url: "chrome-extension://test/popup.html",
      runScripts: "outside-only",
    }).window;

    // Chrome's extension APIs, reduced to what the popup calls.
    window.chrome = {
      storage: { sync: { get: async () => ({}), set: () => {} } },
      tabs: { query: async () => [{ id: 7, url: FIXTURE.url, title: FIXTURE.title }] },
      // The first call injects the extractor; the second runs it. Returning the
      // fixture from the second is the seam where the real browser would return
      // exactly this shape.
      scripting: {
        executeScript: async ({ func }: { func?: () => unknown }) => (func ? [{ result: FIXTURE }] : [{ result: null }]),
      },
    };

    window.fetch = async (url: string, init: { body: string }) => {
      if (String(url).endsWith("/api/capture")) {
        return { ok: true, status: 200, json: async () => captured };
      }
      saved = JSON.parse(init.body);
      return { ok: true, status: 201, json: async () => ({ id: "op-1", url: "/admin/opportunities/op-1" }) };
    };

    window.eval(readFileSync(join(dir, "popup.js"), "utf8"));
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    window.document.getElementById("capture").click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("the API returns the employer's posting and none of the board's writing", () => {
    const description = (captured.job as Record<string, string>).job_description;
    expect(description).toBeTruthy();
    for (const kept of EMPLOYER) expect(description).toContain(kept);
    for (const dropped of BOARD) expect(description).not.toContain(dropped);
    // Read from the page, not inferred and not generated.
    expect((captured.provenance as Record<string, string>).job_description).toBe("page");
    expect(captured.deterministicOnly).toBe(true);
  });

  it("the popup renders it into the review form", () => {
    const field = window.document.getElementById("f-description") as HTMLTextAreaElement;
    expect(field.value).toBe((captured.job as Record<string, string>).job_description);
    expect(window.document.getElementById("step-review").hidden).toBe(false);
    expect(window.document.getElementById("desc-count").textContent).toMatch(/^[\d,]+ chars$/);
  });

  it("the save payload carries it, unmodified", async () => {
    window.document.getElementById("save").click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(saved.job_description).toBe((captured.job as Record<string, string>).job_description);

    const { POST } = await import("@/app/api/capture/save/route");
    const response = await post("http://localhost/api/capture/save", saved, POST);
    expect(response.status).toBe(201);
    // The shared write path receives what the person confirmed on screen.
    expect(created[0].job_description).toBe(saved.job_description);
  });
});
