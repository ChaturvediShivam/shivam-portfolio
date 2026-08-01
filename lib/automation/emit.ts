import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";
import { featureEnabled } from "@/lib/featureFlags";
import type { AutomationEvent, AutomationEventEnvelope } from "@/types/automation";

/**
 * Domain-event emission (Phase 3 · M10).
 *
 * The seam between "a mutation happened" and "the engine considers it". Data
 * layers call `emitAutomationEvent`; it enqueues an `automation_run` job and
 * returns. Nothing is evaluated inline.
 *
 * That indirection is deliberate. Evaluating rules inside the mutation would
 * put arbitrary rule work — including provider calls — on the latency path of
 * a user action, and would let a broken rule fail the mutation that triggered
 * it. Moving a stage must not fail because a rule about moving stages is
 * misconfigured.
 *
 * EMISSION NEVER THROWS. A queue that is unavailable, a migration not yet
 * applied, an owner-less row — none of these may propagate into the caller,
 * because the caller is a data-layer write that has already succeeded. The
 * automation is best-effort; the mutation is not.
 */

/** One event, one job, regardless of how many times the write is retried. */
function jobKey(envelope: AutomationEventEnvelope): string {
  return `automation:${envelope.type}:${envelope.idempotencyKey}`;
}

export interface EmitInput {
  type: AutomationEvent;
  ownerId: string | null | undefined;
  entityType: string;
  entityId: string;
  /** Root the condition paths resolve in, e.g. `{ opportunity: {...} }`. */
  entity: Record<string, unknown>;
  /** Distinguishes repeat events on one record (a second stage change). */
  discriminator?: string;
}

export async function emitAutomationEvent(
  client: SupabaseClient,
  input: EmitInput,
): Promise<void> {
  try {
    // Flag off means no jobs are ever queued, so a rollback leaves nothing
    // in flight to drain.
    if (!featureEnabled("FEATURE_AUTOMATION")) return;
    if (!input.ownerId) return;

    const envelope: AutomationEventEnvelope = {
      type: input.type,
      ownerId: input.ownerId,
      entityType: input.entityType,
      entityId: input.entityId,
      entity: input.entity,
      idempotencyKey: [input.type, input.entityId, input.discriminator ?? ""].join(":"),
      occurredAt: new Date().toISOString(),
    };

    await enqueueJob(client, {
      type: "automation_run",
      payload: { envelope } as unknown as Record<string, unknown>,
      idempotencyKey: jobKey(envelope),
      ownerId: input.ownerId,
    });
  } catch (error) {
    // See the header note: the mutation already happened and is correct.
    console.error("[automation/emit] failed to enqueue event:", error);
  }
}
