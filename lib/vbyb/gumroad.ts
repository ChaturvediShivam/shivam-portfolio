import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VBYB_LAUNCH_SLUG } from "@/lib/vbyb/config";
import { throwIfError } from "@/lib/vbyb/errors";
import { recordOrderEventOnce } from "@/lib/vbyb/events";
import { autoMatchForOrder } from "@/lib/vbyb/matching";
import { safeEqual } from "@/lib/vbyb/webhooks";
import type { ActorType, CapacityStatus } from "@/types/vbyb";

/**
 * Gumroad integration.
 *
 * Verified against Gumroad's open-source code (github.com/antiwork/gumroad):
 *   - Ping payload (app/modules/purchase/ping_notification.rb) carries `sale_id`,
 *     `product_id`, `resource_name`, `refunded`, `disputed` and `test` (only
 *     present when the purchaser is the seller).
 *   - Delivery (app/sidekiq/post_to_individual_ping_endpoint_worker.rb) posts
 *     form-encoded by default, sends URL userinfo as HTTP Basic auth, waits 5s,
 *     and retries only on 499/500/502/503/504 and network errors.
 *   - Gumroad does NOT sign pings. Authenticity here is: a shared secret in the
 *     ping URL, then re-fetching the sale from the API with our own token.
 *   - API: GET https://api.gumroad.com/v2/sales/:id with `Authorization: Bearer`
 *     (scope view_sales) returns `{ success, sale }`; `sale.price` is in minor
 *     units, `sale.currency` is an ISO code. The ping's `sale_id` and the API's
 *     `sale.id` are the same obfuscated external id.
 *
 * Only the sale id is taken from the webhook body. Email, amount, product and
 * refund state come from the API response.
 */

export const GUMROAD_API_BASE = "https://api.gumroad.com/v2";
export const GUMROAD_API_TIMEOUT_MS = 4000;

export interface GumroadConfig {
  webhookSecret: string;
  accessToken: string;
  productId: string;
}

export const GUMROAD_ENV_VARS = ["GUMROAD_WEBHOOK_SECRET", "GUMROAD_ACCESS_TOKEN", "GUMROAD_PRODUCT_ID"] as const;

export function readGumroadConfig(
  env: Record<string, string | undefined> = process.env,
): { config: GumroadConfig; missing: null } | { config: null; missing: string[] } {
  const missing = GUMROAD_ENV_VARS.filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { config: null, missing: [...missing] };
  return {
    config: {
      webhookSecret: env.GUMROAD_WEBHOOK_SECRET!.trim(),
      accessToken: env.GUMROAD_ACCESS_TOKEN!.trim(),
      productId: env.GUMROAD_PRODUCT_ID!.trim(),
    },
    missing: null,
  };
}

/**
 * Accepts the secret as the HTTP Basic password (Gumroad forwards
 * `https://user:secret@host/...` userinfo as Basic auth) or, as a fallback, a
 * `token` query parameter.
 */
export function isAuthorizedGumroadRequest(request: { headers: Headers; url: string }, secret: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      const password = separator >= 0 ? decoded.slice(separator + 1) : "";
      if (password && safeEqual(password, secret)) return true;
    } catch {
      // Malformed header: fall through to the query token.
    }
  }

  const token = new URL(request.url).searchParams.get("token");
  return Boolean(token) && safeEqual(token!, secret);
}

/** Ping fields we keep for the delivery log. Card, IP and custom-field data are not stored. */
const PING_KEPT_KEYS = [
  "sale_id",
  "order_number",
  "product_id",
  "product_permalink",
  "resource_name",
  "refunded",
  "disputed",
  "dispute_won",
  "test",
  "sale_timestamp",
] as const;

export interface GumroadPing {
  saleId: string;
  productId: string | null;
  resourceName: string | null;
  refunded: boolean | null;
  disputed: boolean | null;
  isTest: boolean;
  kept: Record<string, string>;
}

export function parseGumroadPing(body: string, contentType: string | null): GumroadPing | null {
  const entries: Record<string, string> = {};

  if (contentType && contentType.toLowerCase().includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value != null && typeof value !== "object") entries[key] = String(value);
    }
  } else {
    new URLSearchParams(body).forEach((value, key) => {
      if (!(key in entries)) entries[key] = value;
    });
  }

  const saleId = entries.sale_id?.trim();
  if (!saleId || saleId.length > 200) return null;

  const flag = (key: string): boolean | null => (entries[key] == null ? null : entries[key] === "true");
  const kept: Record<string, string> = {};
  for (const key of PING_KEPT_KEYS) if (entries[key] != null) kept[key] = entries[key];

  return {
    saleId,
    productId: entries.product_id?.trim() || null,
    resourceName: entries.resource_name?.trim() || null,
    refunded: flag("refunded"),
    disputed: flag("disputed"),
    isTest: entries.test === "true",
    kept,
  };
}

/** Identical re-deliveries share a key; a later refund or dispute ping for the same sale does not. */
export function gumroadDedupeKey(ping: GumroadPing): string {
  return [ping.resourceName ?? "ping", ping.saleId, String(ping.refunded), String(ping.disputed)].join(":");
}

export interface GumroadSale {
  id: string;
  email: string;
  fullName: string | null;
  priceCents: number;
  currency: string;
  productId: string;
  productName: string | null;
  refunded: boolean;
  partiallyRefunded: boolean;
  disputed: boolean;
  createdAt: string | null;
  orderId: string | null;
  purchaserId: string | null;
  raw: Record<string, unknown>;
}

const SALE_KEPT_KEYS = [
  "id",
  "email",
  "full_name",
  "price",
  "currency",
  "formatted_total_price",
  "product_id",
  "product_name",
  "refunded",
  "partially_refunded",
  "disputed",
  "dispute_won",
  "created_at",
  "order_id",
  "purchaser_id",
] as const;

export function parseGumroadSale(json: unknown): GumroadSale | null {
  if (!json || typeof json !== "object") return null;
  const sale = (json as { sale?: unknown }).sale;
  if (!sale || typeof sale !== "object" || Array.isArray(sale)) return null;
  const s = sale as Record<string, unknown>;

  const str = (key: string): string | null => {
    const value = s[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const id = str("id");
  const email = str("email");
  const productId = str("product_id");
  const currency = str("currency");
  const price = s.price;
  if (!id || !email || !productId || !currency) return null;
  if (typeof price !== "number" || !Number.isInteger(price) || price < 0) return null;
  if (!/^[a-z]{3}$/i.test(currency)) return null;

  const raw: Record<string, unknown> = {};
  for (const key of SALE_KEPT_KEYS) if (key in s) raw[key] = s[key];

  return {
    id,
    email,
    fullName: str("full_name"),
    priceCents: price,
    currency: currency.toUpperCase(),
    productId,
    productName: str("product_name"),
    refunded: s.refunded === true,
    partiallyRefunded: s.partially_refunded === true,
    disputed: s.disputed === true,
    createdAt: str("created_at"),
    orderId: s.order_id == null ? null : String(s.order_id),
    purchaserId: str("purchaser_id"),
    raw,
  };
}

export type FetchSaleResult =
  | { kind: "found"; sale: GumroadSale }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export async function fetchGumroadSale(
  saleId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchSaleResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${GUMROAD_API_BASE}/sales/${encodeURIComponent(saleId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(GUMROAD_API_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { kind: "error", message: timedOut ? "Gumroad API timed out" : "Gumroad API request failed" };
  }

  if (response.status === 404) return { kind: "not_found" };
  if (response.status === 401 || response.status === 403) {
    return { kind: "error", message: `Gumroad API rejected the access token (HTTP ${response.status})` };
  }
  if (!response.ok) return { kind: "error", message: `Gumroad API returned HTTP ${response.status}` };

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { kind: "error", message: "Gumroad API returned invalid JSON" };
  }
  if (json && typeof json === "object" && (json as { success?: unknown }).success === false) {
    return { kind: "not_found" };
  }

  const sale = parseGumroadSale(json);
  if (!sale) return { kind: "error", message: "Gumroad API sale was missing required fields" };
  return { kind: "found", sale };
}

export type SyncOutcome =
  | { kind: "synced"; orderId: string; created: boolean; refundedNow: boolean; capacityStatus: CapacityStatus }
  | { kind: "ignored"; reason: "other_product" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

interface RecordOrderRow {
  order_id: string;
  created: boolean;
  capacity_status: CapacityStatus;
  slot_number: number | null;
}

/**
 * Brings one sale in line with Gumroad. Used by the webhook and by the admin
 * "Re-sync from Gumroad" button, so a sale ping, a refund ping, a repeat of
 * either, or the two arriving out of order all converge on the API's answer.
 */
export async function syncGumroadSale(
  db: SupabaseClient,
  saleId: string,
  options: {
    config: GumroadConfig;
    isTest: boolean;
    actorType: ActorType;
    actorId: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<SyncOutcome> {
  const fetched = await fetchGumroadSale(saleId, options.config.accessToken, options.fetchImpl);
  if (fetched.kind === "not_found") return { kind: "not_found" };
  if (fetched.kind === "error") return { kind: "error", message: fetched.message };

  const sale = fetched.sale;
  if (sale.productId !== options.config.productId) return { kind: "ignored", reason: "other_product" };

  const { data, error } = await db.rpc("vbyb_record_order", {
    p_launch_slug: VBYB_LAUNCH_SLUG,
    p_provider: "gumroad",
    p_external_order_id: sale.id,
    p_email: sale.email,
    p_name: sale.fullName,
    p_purchaser_id: sale.purchaserId,
    p_product_id: sale.productId,
    p_product_name: sale.productName,
    p_amount_cents: sale.priceCents,
    p_currency: sale.currency,
    p_purchased_at: sale.createdAt,
    p_is_test: options.isTest,
    p_raw_payload: sale.raw,
    p_notes: null,
    p_actor_type: options.actorType,
    p_actor_id: options.actorId,
  });
  throwIfError(error, "record gumroad order");
  const row = (Array.isArray(data) ? data[0] : data) as RecordOrderRow | undefined;
  if (!row?.order_id) throw new Error("[vbyb] record gumroad order returned no row");

  let refundedNow = false;
  if (sale.refunded) {
    // Gumroad's sale JSON has no refund timestamp, so the refund is dated when we learn of it.
    const { data: changed, error: refundError } = await db.rpc("vbyb_record_refund", {
      p_order_id: row.order_id,
      p_refunded_at: null,
      p_amount_cents: sale.priceCents,
      p_reason: "Refunded in Gumroad",
      p_actor_type: options.actorType,
      p_actor_id: options.actorId,
    });
    throwIfError(refundError, "record gumroad refund");
    refundedNow = changed === true;
  } else if (sale.partiallyRefunded) {
    await recordOrderEventOnce(db, {
      eventType: "ORDER_PARTIALLY_REFUNDED",
      orderId: row.order_id,
      actorType: options.actorType,
      actorId: options.actorId,
      metadata: { note: "Gumroad reports a partial refund. Record it on the order if it should free the slot." },
    });
  }

  if (sale.disputed) {
    await recordOrderEventOnce(db, {
      eventType: "ORDER_DISPUTED",
      orderId: row.order_id,
      actorType: options.actorType,
      actorId: options.actorId,
    });
  }

  if (row.created) await autoMatchForOrder(db, row.order_id);

  return {
    kind: "synced",
    orderId: row.order_id,
    created: row.created,
    refundedNow,
    capacityStatus: row.capacity_status,
  };
}
