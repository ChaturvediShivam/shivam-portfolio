import { describe, it, expect, vi } from "vitest";
import { createSupabaseStub } from "@/test/stubs/supabase";
import {
  fetchGumroadSale,
  gumroadDedupeKey,
  isAuthorizedGumroadRequest,
  parseGumroadPing,
  parseGumroadSale,
  readGumroadConfig,
  syncGumroadSale,
} from "@/lib/vbyb/gumroad";

/**
 * Gumroad does not sign pings. The guarantees tested here are the ones this
 * integration actually provides: a shared secret on the request, and the sale
 * re-fetched from Gumroad's API as the source of truth — so a forged or stale
 * webhook body cannot set an email, an amount or a refund state.
 */

const SECRET = "a-long-random-webhook-secret";
const CONFIG = { webhookSecret: SECRET, accessToken: "gumroad-token", productId: "prod-founding" };

function request(url: string, headers: Record<string, string> = {}) {
  return { url, headers: new Headers(headers) };
}
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

const API_SALE = {
  id: "sale-abc==",
  email: "buyer@example.com",
  full_name: "Buyer Person",
  price: 3900,
  currency: "usd",
  product_id: "prod-founding",
  product_name: "Validate Before You Build",
  refunded: false,
  partially_refunded: false,
  disputed: false,
  created_at: "2026-09-14T09:00:00Z",
  order_id: 123456,
  purchaser_id: "purchaser-1",
  card: { visual: "**** 4242" },
};

function apiResponse(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("isAuthorizedGumroadRequest", () => {
  it("accepts the secret as the Basic-auth password Gumroad derives from URL userinfo", () => {
    expect(isAuthorizedGumroadRequest(request("https://x.test/api/webhooks/gumroad", { authorization: basic("gumroad", SECRET) }), SECRET)).toBe(true);
  });

  it("accepts the ?token= fallback", () => {
    expect(isAuthorizedGumroadRequest(request(`https://x.test/api/webhooks/gumroad?token=${SECRET}`), SECRET)).toBe(true);
  });

  it("rejects a wrong, truncated or missing secret", () => {
    const url = "https://x.test/api/webhooks/gumroad";
    expect(isAuthorizedGumroadRequest(request(url, { authorization: basic("gumroad", "wrong") }), SECRET)).toBe(false);
    expect(isAuthorizedGumroadRequest(request(`${url}?token=${SECRET.slice(0, -1)}`), SECRET)).toBe(false);
    expect(isAuthorizedGumroadRequest(request(url), SECRET)).toBe(false);
    expect(isAuthorizedGumroadRequest(request(url, { authorization: "Basic !!!not-base64" }), SECRET)).toBe(false);
  });
});

describe("readGumroadConfig", () => {
  it("fails closed and names every missing variable", () => {
    const { config, missing } = readGumroadConfig({ GUMROAD_WEBHOOK_SECRET: "x" });
    expect(config).toBeNull();
    expect(missing).toEqual(["GUMROAD_ACCESS_TOKEN", "GUMROAD_PRODUCT_ID"]);
  });
});

describe("parseGumroadPing", () => {
  it("reads Gumroad's default form-encoded ping and keeps only non-sensitive fields", () => {
    const body = new URLSearchParams({
      sale_id: "sale-abc==",
      product_id: "prod-founding",
      resource_name: "sale",
      refunded: "false",
      test: "true",
      email: "buyer@example.com",
      "card[visual]": "**** 4242",
    }).toString();

    const ping = parseGumroadPing(body, "application/x-www-form-urlencoded")!;
    expect(ping.saleId).toBe("sale-abc==");
    expect(ping.isTest).toBe(true);
    expect(ping.refunded).toBe(false);
    expect(ping.kept).not.toHaveProperty("email");
    expect(ping.kept).not.toHaveProperty("card[visual]");
  });

  it("reads a JSON ping", () => {
    expect(parseGumroadPing(JSON.stringify({ sale_id: "s1", refunded: true }), "application/json")?.refunded).toBe(true);
  });

  it("rejects a ping without a sale id", () => {
    expect(parseGumroadPing("product_id=x", null)).toBeNull();
    expect(parseGumroadPing("{not json", "application/json")).toBeNull();
  });

  it("gives an identical re-delivery the same dedupe key and a later refund ping a different one", () => {
    const sale = parseGumroadPing("sale_id=s1&resource_name=sale&refunded=false", null)!;
    const again = parseGumroadPing("sale_id=s1&resource_name=sale&refunded=false", null)!;
    const refund = parseGumroadPing("sale_id=s1&resource_name=refund&refunded=true", null)!;
    expect(gumroadDedupeKey(sale)).toBe(gumroadDedupeKey(again));
    expect(gumroadDedupeKey(refund)).not.toBe(gumroadDedupeKey(sale));
  });
});

describe("parseGumroadSale / fetchGumroadSale", () => {
  it("parses the API sale and drops fields it does not need", () => {
    const sale = parseGumroadSale({ success: true, sale: API_SALE })!;
    expect(sale).toMatchObject({ id: "sale-abc==", priceCents: 3900, currency: "USD", productId: "prod-founding" });
    expect(sale.raw).not.toHaveProperty("card");
  });

  it("rejects a sale missing required fields or with a non-integer price", () => {
    expect(parseGumroadSale({ sale: { ...API_SALE, email: undefined } })).toBeNull();
    expect(parseGumroadSale({ sale: { ...API_SALE, price: "39.00" } })).toBeNull();
    expect(parseGumroadSale({ sale: { ...API_SALE, price: 39.5 } })).toBeNull();
  });

  it("calls the v2 sales endpoint with a Bearer token", async () => {
    const fetchImpl = apiResponse({ success: true, sale: API_SALE });
    const result = await fetchGumroadSale("sale-abc==", "gumroad-token", fetchImpl as unknown as typeof fetch);
    expect(result.kind).toBe("found");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.gumroad.com/v2/sales/sale-abc%3D%3D");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gumroad-token");
  });

  it("distinguishes not-found from a failure worth retrying", async () => {
    expect((await fetchGumroadSale("s", "t", apiResponse({}, 404) as unknown as typeof fetch)).kind).toBe("not_found");
    expect((await fetchGumroadSale("s", "t", apiResponse({ success: false }) as unknown as typeof fetch)).kind).toBe("not_found");
    expect((await fetchGumroadSale("s", "t", apiResponse({}, 401) as unknown as typeof fetch)).kind).toBe("error");
    expect((await fetchGumroadSale("s", "t", apiResponse({}, 502) as unknown as typeof fetch)).kind).toBe("error");
    const throwing = vi.fn(async () => {
      throw new TypeError("network down");
    });
    expect((await fetchGumroadSale("s", "t", throwing as unknown as typeof fetch)).kind).toBe("error");
  });
});

describe("syncGumroadSale", () => {
  const existingOrder = [{ order_id: "order-1", created: false, capacity_status: "within_capacity", slot_number: 1 }];

  it("records the order from the API response, not the webhook body", async () => {
    const stub = createSupabaseStub({ rpc: { vbyb_record_order: existingOrder } });
    const outcome = await syncGumroadSale(stub.client, "sale-abc==", {
      config: CONFIG,
      isTest: false,
      actorType: "webhook",
      actorId: null,
      fetchImpl: apiResponse({ success: true, sale: API_SALE }) as unknown as typeof fetch,
    });

    expect(outcome).toMatchObject({ kind: "synced", orderId: "order-1", refundedNow: false });
    const call = stub.rpcCalls.find((c) => c.name === "vbyb_record_order")!;
    expect(call.args).toMatchObject({
      p_launch_slug: "founding-v1",
      p_provider: "gumroad",
      p_external_order_id: "sale-abc==",
      p_email: "buyer@example.com",
      p_amount_cents: 3900,
      p_currency: "USD",
      p_product_id: "prod-founding",
    });
    expect(stub.rpcCalls.some((c) => c.name === "vbyb_record_refund")).toBe(false);
  });

  it("applies a refund the API reports — including when the refund ping arrives first", async () => {
    const stub = createSupabaseStub({ rpc: { vbyb_record_order: existingOrder, vbyb_record_refund: true } });
    const outcome = await syncGumroadSale(stub.client, "sale-abc==", {
      config: CONFIG,
      isTest: false,
      actorType: "webhook",
      actorId: null,
      fetchImpl: apiResponse({ success: true, sale: { ...API_SALE, refunded: true } }) as unknown as typeof fetch,
    });

    expect(outcome).toMatchObject({ kind: "synced", refundedNow: true });
    const refund = stub.rpcCalls.find((c) => c.name === "vbyb_record_refund")!;
    expect(refund.args).toMatchObject({ p_order_id: "order-1", p_amount_cents: 3900 });
  });

  it("ignores a sale for another product without writing anything", async () => {
    const stub = createSupabaseStub();
    const outcome = await syncGumroadSale(stub.client, "sale-abc==", {
      config: CONFIG,
      isTest: false,
      actorType: "webhook",
      actorId: null,
      fetchImpl: apiResponse({ success: true, sale: { ...API_SALE, product_id: "another-product" } }) as unknown as typeof fetch,
    });
    expect(outcome).toEqual({ kind: "ignored", reason: "other_product" });
    expect(stub.rpcCalls).toEqual([]);
    expect(stub.operations).toEqual([]);
  });

  it("records a dispute once as an event without changing the order", async () => {
    const stub = createSupabaseStub({ rpc: { vbyb_record_order: existingOrder } });
    await syncGumroadSale(stub.client, "sale-abc==", {
      config: CONFIG,
      isTest: false,
      actorType: "webhook",
      actorId: null,
      fetchImpl: apiResponse({ success: true, sale: { ...API_SALE, disputed: true } }) as unknown as typeof fetch,
    });
    const inserts = stub.opsFor("vbyb_events").filter((op) => op.type === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({ event_type: "ORDER_DISPUTED", order_id: "order-1" });
  });

  it("links an earlier submission by email when a new order arrives", async () => {
    const stub = createSupabaseStub({
      rpc: {
        vbyb_record_order: [{ order_id: "order-1", created: true, capacity_status: "within_capacity", slot_number: 1 }],
        vbyb_link_submission: "linked",
      },
      select: {
        vbyb_orders: { id: "order-1", customer: { email: "buyer@example.com" } },
        vbyb_customers: { id: "customer-1" },
        vbyb_validations: [{ order_id: "order-1" }],
        vbyb_submissions: [{ id: "submission-1" }],
      },
    });
    await syncGumroadSale(stub.client, "sale-abc==", {
      config: CONFIG,
      isTest: false,
      actorType: "webhook",
      actorId: null,
      fetchImpl: apiResponse({ success: true, sale: API_SALE }) as unknown as typeof fetch,
    });
    const link = stub.rpcCalls.find((c) => c.name === "vbyb_link_submission")!;
    expect(link.args).toMatchObject({ p_submission_id: "submission-1", p_order_id: "order-1", p_matched_by: "email" });
  });

  it("surfaces API failures without touching the database", async () => {
    const stub = createSupabaseStub();
    const outcome = await syncGumroadSale(stub.client, "sale-abc==", {
      config: CONFIG,
      isTest: false,
      actorType: "webhook",
      actorId: null,
      fetchImpl: apiResponse({}, 503) as unknown as typeof fetch,
    });
    expect(outcome.kind).toBe("error");
    expect(stub.rpcCalls).toEqual([]);
  });
});
