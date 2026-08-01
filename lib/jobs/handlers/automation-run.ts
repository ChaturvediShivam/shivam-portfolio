import "server-only";
import { registerJobHandler } from "@/lib/jobs/runner";
import { featureEnabled } from "@/lib/featureFlags";
import { dispatchEvent } from "@/lib/automation/engine";
import type { AutomationEventEnvelope } from "@/types/automation";
import { AUTOMATION_EVENTS } from "@/types/automation";

/**
 * `automation_run` job handler (Phase 3 · M10).
 *
 * Thin by design: every decision about whether a rule fires lives in
 * `lib/automation/engine.ts`. This handler gates, validates the envelope, and
 * dispatches.
 *
 * Runs under the service-role client with no session, so `ownerId` travels in
 * the payload and the engine scopes every read and write to it (H5).
 *
 * The flag gate is checked here as well as at emission: jobs queued before a
 * rollback are already in the table, and consuming them without acting is what
 * makes "flip the flag" a complete kill switch rather than one that leaves a
 * backlog to drain.
 */

/** A payload that is not a well-formed envelope is discarded, not retried. */
function parseEnvelope(payload: Record<string, unknown>): AutomationEventEnvelope | null {
  const raw = payload.envelope;
  if (!raw || typeof raw !== "object") return null;

  const envelope = raw as Partial<AutomationEventEnvelope>;
  if (typeof envelope.type !== "string" || !AUTOMATION_EVENTS.includes(envelope.type as never)) {
    return null;
  }
  if (typeof envelope.ownerId !== "string" || !envelope.ownerId) return null;
  if (typeof envelope.entityId !== "string" || !envelope.entityId) return null;
  if (typeof envelope.idempotencyKey !== "string" || !envelope.idempotencyKey) return null;
  if (!envelope.entity || typeof envelope.entity !== "object") return null;

  return {
    type: envelope.type as AutomationEventEnvelope["type"],
    ownerId: envelope.ownerId,
    entityType: typeof envelope.entityType === "string" ? envelope.entityType : "unknown",
    entityId: envelope.entityId,
    entity: envelope.entity as Record<string, unknown>,
    idempotencyKey: envelope.idempotencyKey,
    occurredAt: typeof envelope.occurredAt === "string" ? envelope.occurredAt : new Date().toISOString(),
  };
}

registerJobHandler("automation_run", async (payload, ctx) => {
  if (!featureEnabled("FEATURE_AUTOMATION")) return;

  const envelope = parseEnvelope(payload);
  if (!envelope) {
    // Retrying a malformed payload fails identically every time and would burn
    // the attempt budget on its way to the dead-letter queue.
    console.error("[automation-run] discarding malformed envelope:", payload);
    return;
  }

  await dispatchEvent(ctx.client, envelope);
});
