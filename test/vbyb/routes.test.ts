import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { createSupabaseStub } from "@/test/stubs/supabase";

/**
 * Webhook route behaviour: fail closed, reject unauthenticated requests before
 * touching the database, and do no work for a delivery already processed.
 */

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { createServiceClient } from "@/lib/supabase/service";
import { POST as gumroadPost } from "@/app/api/webhooks/gumroad/route";
import { POST as tallyPost } from "@/app/api/webhooks/tally/route";

const GUMROAD_SECRET = "gumroad-webhook-secret";
const TALLY_SECRET = "tally-signing-secret";

const ENV: Record<string, string> = {
  FEATURE_VBYB_WEBHOOKS: "true",
  GUMROAD_WEBHOOK_SECRET: GUMROAD_SECRET,
  GUMROAD_ACCESS_TOKEN: "gumroad-token",
  GUMROAD_PRODUCT_ID: "prod-founding",
  TALLY_SIGNING_SECRET: TALLY_SECRET,
  TALLY_FORM_ID: "lbxOAv",
};

let saved: Record<string, string | undefined>;
const fetchMock = vi.fn();

beforeEach(() => {
  saved = {};
  for (const [key, value] of Object.entries(ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(createServiceClient).mockReset();
  fetchMock.mockReset();
});

function gumroadRequest(body: string, { token = GUMROAD_SECRET }: { token?: string | null } = {}) {
  const url = token ? `https://www.example.com/api/webhooks/gumroad?token=${token}` : "https://www.example.com/api/webhooks/gumroad";
  return new NextRequest(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

function tallyRequest(payload: unknown, signature?: string | null) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sig = signature === undefined ? createHmac("sha256", TALLY_SECRET).update(body).digest("base64") : signature;
  if (sig) headers["tally-signature"] = sig;
  return new NextRequest("https://www.example.com/api/webhooks/tally", { method: "POST", body, headers });
}

const TALLY_PAYLOAD = {
  eventId: "evt-1",
  eventType: "FORM_RESPONSE",
  createdAt: "2026-09-14T10:00:00.000Z",
  data: { submissionId: "sub-1", responseId: "resp-1", formId: "lbxOAv", createdAt: "2026-09-14T10:00:00.000Z", fields: [] },
};

describe("POST /api/webhooks/gumroad", () => {
  it("is inert when the webhook flag is off", async () => {
    process.env.FEATURE_VBYB_WEBHOOKS = "false";
    const res = await gumroadPost(gumroadRequest("sale_id=s1"));
    expect(res.status).toBe(503);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("fails closed when a required secret is missing", async () => {
    delete process.env.GUMROAD_ACCESS_TOKEN;
    const res = await gumroadPost(gumroadRequest("sale_id=s1"));
    expect(res.status).toBe(500);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects a wrong or missing secret before touching the database", async () => {
    expect((await gumroadPost(gumroadRequest("sale_id=s1", { token: "wrong" }))).status).toBe(401);
    expect((await gumroadPost(gumroadRequest("sale_id=s1", { token: null }))).status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a ping without a sale id", async () => {
    expect((await gumroadPost(gumroadRequest("product_id=prod-founding"))).status).toBe(400);
  });

  it("does no work for a delivery that was already processed", async () => {
    const stub = createSupabaseStub({
      rpc: { vbyb_register_delivery: [{ delivery_id: "d-1", status: "processed", attempts: 2 }] },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const res = await gumroadPost(gumroadRequest("sale_id=s1&resource_name=sale&refunded=false"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stub.rpcCalls.map((c) => c.name)).toEqual(["vbyb_register_delivery"]);
  });

  it("ignores pings for other products without calling the Gumroad API", async () => {
    const stub = createSupabaseStub({
      rpc: { vbyb_register_delivery: [{ delivery_id: "d-2", status: "received", attempts: 1 }] },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const res = await gumroadPost(gumroadRequest("sale_id=s1&product_id=another-product"));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const update = stub.opsFor("vbyb_webhook_deliveries").find((op) => op.type === "update")!;
    expect(update.values).toMatchObject({ status: "ignored" });
  });

  it("returns 503 so Gumroad retries when its API is unavailable", async () => {
    const stub = createSupabaseStub({
      rpc: { vbyb_register_delivery: [{ delivery_id: "d-3", status: "received", attempts: 1 }] },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);
    fetchMock.mockResolvedValue(new Response("{}", { status: 502 }));

    const res = await gumroadPost(gumroadRequest("sale_id=s1&product_id=prod-founding"));
    expect(res.status).toBe(503);
    expect(stub.rpcCalls.some((c) => c.name === "vbyb_record_order")).toBe(false);
    const update = stub.opsFor("vbyb_webhook_deliveries").find((op) => op.type === "update")!;
    expect(update.values).toMatchObject({ status: "failed" });
  });
});

describe("POST /api/webhooks/tally", () => {
  it("is inert when the webhook flag is off", async () => {
    process.env.FEATURE_VBYB_WEBHOOKS = "false";
    expect((await tallyPost(tallyRequest(TALLY_PAYLOAD))).status).toBe(503);
  });

  it("rejects an invalid or missing signature before touching the database", async () => {
    expect((await tallyPost(tallyRequest(TALLY_PAYLOAD, "bm90LXRoZS1zaWduYXR1cmU="))).status).toBe(401);
    expect((await tallyPost(tallyRequest(TALLY_PAYLOAD, null))).status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("acknowledges but ignores other event types and other forms", async () => {
    const stub = createSupabaseStub({
      rpc: { vbyb_register_delivery: [{ delivery_id: "d-1", status: "received", attempts: 1 }] },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    expect((await tallyPost(tallyRequest({ ...TALLY_PAYLOAD, eventType: "FORM_DELETED" }))).status).toBe(200);
    expect(
      (await tallyPost(tallyRequest({ ...TALLY_PAYLOAD, data: { ...TALLY_PAYLOAD.data, formId: "otherForm" } }))).status,
    ).toBe(200);
    expect(stub.rpcCalls.some((c) => c.name === "vbyb_store_submission")).toBe(false);
  });

  it("does not store a repeat of a processed delivery", async () => {
    const stub = createSupabaseStub({
      rpc: { vbyb_register_delivery: [{ delivery_id: "d-1", status: "processed", attempts: 3 }] },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const res = await tallyPost(tallyRequest(TALLY_PAYLOAD));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(stub.rpcCalls.map((c) => c.name)).toEqual(["vbyb_register_delivery"]);
  });

  it("stores a new submission even when nothing matches it yet", async () => {
    const stub = createSupabaseStub({
      rpc: {
        vbyb_register_delivery: [{ delivery_id: "d-9", status: "received", attempts: 1 }],
        vbyb_store_submission: [{ submission_id: "s-9", created: true }],
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(stub.client as never);

    const res = await tallyPost(tallyRequest(TALLY_PAYLOAD));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: "unmatched" });
    const update = stub.opsFor("vbyb_webhook_deliveries").find((op) => op.type === "update")!;
    expect(update.values).toMatchObject({ status: "processed" });
  });
});
