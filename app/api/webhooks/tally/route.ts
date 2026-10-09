import { NextResponse, type NextRequest } from "next/server";
import { featureEnabled } from "@/lib/featureFlags";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ingestTallySubmission,
  parseTallyEnvelope,
  parseTallySubmission,
  readTallyConfig,
  verifyTallySignature,
} from "@/lib/vbyb/tally";
import {
  completeDelivery,
  isFinishedDelivery,
  logWebhookFailure,
  readBodyWithLimit,
  registerDelivery,
} from "@/lib/vbyb/webhooks";

/**
 * Tally webhook endpoint for the Validate Before You Build idea submission form.
 *
 * Verifies `Tally-Signature` (HMAC-SHA256, base64) before anything is parsed or
 * stored, stores every submission verbatim even when it cannot be matched to an
 * order yet, and answers 2xx for anything Tally should not retry. Tally retries
 * non-2xx responses, so genuine processing failures return 500.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (!featureEnabled("FEATURE_VBYB_WEBHOOKS")) return json({ error: "Webhooks are disabled." }, 503);

  const { config, missing } = readTallyConfig();
  if (!config) {
    console.error("[vbyb/tally] refusing webhook: missing configuration", { missing });
    return json({ error: "Not configured." }, 500);
  }

  const body = await readBodyWithLimit(request);
  if (!body.ok) return json({ error: "Payload too large." }, 413);

  if (!verifyTallySignature(body.text, request.headers.get("tally-signature"), config.signingSecret)) {
    return json({ error: "Invalid signature." }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const envelope = parseTallyEnvelope(payload);
  if (!envelope) return json({ error: "Invalid payload." }, 400);

  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch (err) {
    logWebhookFailure("tally", "service client", err);
    return json({ error: "Not configured." }, 500);
  }

  let deliveryId: string | null = null;
  try {
    const delivery = await registerDelivery(db, {
      provider: "tally",
      dedupeKey: envelope.eventId,
      eventType: envelope.eventType,
      externalId: envelope.formId,
      payload: null, // The submission itself is stored verbatim in vbyb_submissions.
    });
    deliveryId = delivery.id;

    if (isFinishedDelivery(delivery)) return json({ ok: true, duplicate: true }, 200);

    if (envelope.eventType !== "FORM_RESPONSE") {
      await completeDelivery(db, delivery.id, "ignored", `Unhandled event type ${envelope.eventType.slice(0, 50)}`);
      return json({ ok: true, ignored: true }, 200);
    }

    if (envelope.formId !== config.formId) {
      await completeDelivery(db, delivery.id, "ignored", "Submission is for a different form");
      return json({ ok: true, ignored: true }, 200);
    }

    const submission = parseTallySubmission(payload);
    if (!submission) {
      await completeDelivery(db, delivery.id, "failed", "Payload is missing the submission id or fields");
      return json({ error: "Invalid submission payload." }, 400);
    }

    const outcome = await ingestTallySubmission(db, submission, payload);
    await completeDelivery(db, delivery.id, "processed");
    return json({ ok: true, result: outcome.kind }, 200);
  } catch (err) {
    logWebhookFailure("tally", "processing", err);
    if (deliveryId) {
      try {
        await completeDelivery(db, deliveryId, "failed", "Processing failed; see server logs");
      } catch (completeErr) {
        logWebhookFailure("tally", "mark delivery failed", completeErr);
      }
    }
    return json({ error: "Processing failed." }, 500);
  }
}
