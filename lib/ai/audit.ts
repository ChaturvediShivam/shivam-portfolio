import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiAuditEntry } from "@/types/ai";
import { redact } from "@/lib/ai/redaction";

/**
 * AI audit log (Phase 3 · M6).
 *
 * One row per provider call — the "who / what / which model / how many tokens /
 * what happened" trail. It records references and counts, never prompt or
 * completion bodies: those live in `ai_messages` when a conversation owns them,
 * and duplicating them here would widen the blast radius of a leak for no gain.
 *
 * Writing an audit row never fails the caller. The completion has already been
 * produced and billed; losing the bookkeeping is strictly better than throwing
 * away real work.
 */
export async function recordAiCall(client: SupabaseClient, entry: AiAuditEntry): Promise<void> {
  const { error } = await client.from("ai_audit_log").insert({
    actor: entry.actor,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    ai_provider: entry.aiProvider,
    ai_model: entry.aiModel,
    ai_prompt_version: entry.aiPromptVersion,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    cached_input_tokens: entry.cachedInputTokens,
    cost_micros: entry.costMicros,
    latency_ms: entry.latencyMs,
    outcome: entry.outcome,
    error_code: entry.errorCode ? redact(entry.errorCode) : null,
    job_id: entry.jobId ?? null,
    conversation_id: entry.conversationId ?? null,
    owner_id: entry.ownerId,
  });

  if (error) console.error("[ai audit] insert failed:", error.message);
}

/** Count of failed calls today, for the Settings panel. Null when unavailable. */
export async function countRecentAiFailures(
  client: SupabaseClient,
  ownerId: string,
): Promise<number | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await client
    .from("ai_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("outcome", "error")
    .gte("created_at", since);

  if (error) return null;
  return count ?? 0;
}
