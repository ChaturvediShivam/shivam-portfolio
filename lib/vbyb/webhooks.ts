import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { throwIfError } from "@/lib/vbyb/errors";
import type { DeliveryStatus } from "@/types/vbyb";

/** Shared plumbing for the Gumroad and Tally webhook routes. */

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/** Constant-time string comparison. Length is not secret, so a mismatch returns early. */
export function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export type BodyReadResult = { ok: true; text: string } | { ok: false };

/** Reads the raw body, refusing anything larger than the limit. */
export async function readBodyWithLimit(request: Request, limit: number = MAX_WEBHOOK_BODY_BYTES): Promise<BodyReadResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return { ok: false };
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > limit) return { ok: false };
  return { ok: true, text };
}

export interface RegisteredDelivery {
  id: string;
  status: DeliveryStatus;
  attempts: number;
}

export async function registerDelivery(
  db: SupabaseClient,
  delivery: {
    provider: "gumroad" | "tally";
    dedupeKey: string;
    eventType: string | null;
    externalId: string | null;
    payload: Record<string, unknown> | null;
  },
): Promise<RegisteredDelivery> {
  const { data, error } = await db.rpc("vbyb_register_delivery", {
    p_provider: delivery.provider,
    p_dedupe_key: delivery.dedupeKey,
    p_event_type: delivery.eventType,
    p_external_id: delivery.externalId,
    p_payload: delivery.payload,
  });
  throwIfError(error, "register webhook delivery");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { delivery_id: string; status: DeliveryStatus; attempts: number }
    | undefined;
  if (!row?.delivery_id) throw new Error("[vbyb] register webhook delivery returned no row");
  return { id: row.delivery_id, status: row.status, attempts: row.attempts };
}

/** True when a repeat delivery has nothing left to do. Failed deliveries are retried. */
export function isFinishedDelivery(delivery: RegisteredDelivery): boolean {
  return delivery.status === "processed" || delivery.status === "ignored";
}

export async function completeDelivery(
  db: SupabaseClient,
  deliveryId: string,
  status: Exclude<DeliveryStatus, "received">,
  errorMessage: string | null = null,
): Promise<void> {
  const { error } = await db
    .from("vbyb_webhook_deliveries")
    .update({ status, error: errorMessage, processed_at: new Date().toISOString() })
    .eq("id", deliveryId);
  throwIfError(error, "complete webhook delivery");
}

/** Log line for an unexpected webhook failure: context and error code, never payload or message text. */
export function logWebhookFailure(provider: string, stage: string, err: unknown): void {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : undefined;
  const name = err instanceof Error ? err.name : typeof err;
  const safeMessage = err instanceof Error && err.message.startsWith("[vbyb]") ? err.message : undefined;
  console.error(`[vbyb/${provider}] ${stage} failed`, { name, code, message: safeMessage });
}
