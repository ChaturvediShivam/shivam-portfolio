import { NextResponse, type NextRequest } from "next/server";
import { featureEnabled } from "@/lib/featureFlags";
import { createServiceClient } from "@/lib/supabase/service";
import {
  gumroadDedupeKey,
  isAuthorizedGumroadRequest,
  parseGumroadPing,
  readGumroadConfig,
  syncGumroadSale,
} from "@/lib/vbyb/gumroad";
import {
  completeDelivery,
  isFinishedDelivery,
  logWebhookFailure,
  readBodyWithLimit,
  registerDelivery,
} from "@/lib/vbyb/webhooks";

/**
 * Gumroad Ping / resource-subscription endpoint for Validate Before You Build.
 *
 * Gumroad does not sign pings, so this route:
 *   1. requires the shared secret (Basic-auth password in the ping URL, or ?token=),
 *   2. takes only the sale id from the body,
 *   3. re-fetches the sale from the Gumroad API with our own token and records
 *      what the API says — email, amount, product and refund state.
 *
 * Status codes are chosen for Gumroad's retry rules (retries on 5xx): anything
 * worth retrying returns 5xx; anything that will never succeed returns 2xx/4xx.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (!featureEnabled("FEATURE_VBYB_WEBHOOKS")) return json({ error: "Webhooks are disabled." }, 503);

  const { config, missing } = readGumroadConfig();
  if (!config) {
    console.error("[vbyb/gumroad] refusing webhook: missing configuration", { missing });
    return json({ error: "Not configured." }, 500);
  }

  if (!isAuthorizedGumroadRequest(request, config.webhookSecret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const body = await readBodyWithLimit(request);
  if (!body.ok) return json({ error: "Payload too large." }, 413);

  const ping = parseGumroadPing(body.text, request.headers.get("content-type"));
  if (!ping) return json({ error: "Missing sale_id." }, 400);

  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch (err) {
    logWebhookFailure("gumroad", "service client", err);
    return json({ error: "Not configured." }, 500);
  }

  let deliveryId: string | null = null;
  try {
    const delivery = await registerDelivery(db, {
      provider: "gumroad",
      dedupeKey: gumroadDedupeKey(ping),
      eventType: ping.resourceName ?? "ping",
      externalId: ping.saleId,
      payload: ping.kept,
    });
    deliveryId = delivery.id;

    if (isFinishedDelivery(delivery)) return json({ ok: true, duplicate: true }, 200);

    // Cheap early exit for other products on the same Gumroad account.
    if (ping.productId && ping.productId !== config.productId) {
      await completeDelivery(db, delivery.id, "ignored", "Ping is for a different product");
      return json({ ok: true, ignored: true }, 200);
    }

    const outcome = await syncGumroadSale(db, ping.saleId, {
      config,
      isTest: ping.isTest,
      actorType: "webhook",
      actorId: null,
    });

    switch (outcome.kind) {
      case "synced":
        await completeDelivery(db, delivery.id, "processed");
        return json({ ok: true }, 200);
      case "ignored":
        await completeDelivery(db, delivery.id, "ignored", "Sale belongs to a different product");
        return json({ ok: true, ignored: true }, 200);
      case "not_found":
        await completeDelivery(db, delivery.id, "failed", "Sale not found through the Gumroad API");
        return json({ error: "Sale not found." }, 422);
      case "error":
        await completeDelivery(db, delivery.id, "failed", outcome.message);
        return json({ error: "Gumroad API unavailable." }, 503);
    }
  } catch (err) {
    logWebhookFailure("gumroad", "processing", err);
    if (deliveryId) {
      try {
        await completeDelivery(db, deliveryId, "failed", "Processing failed; see server logs");
      } catch (completeErr) {
        logWebhookFailure("gumroad", "mark delivery failed", completeErr);
      }
    }
    return json({ error: "Processing failed." }, 500);
  }
}
