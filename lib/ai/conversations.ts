import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiConversationView, AiRole, AiToolCall, AiTurn } from "@/types/ai";
import { redact } from "@/lib/ai/redaction";

/**
 * Conversation store (Phase 3 · M6).
 *
 * Durable multi-turn history for AI runs. M6 ships the store; the copilot that
 * drives it is M8. Every read and write is owner-scoped in application code so
 * the layer is correct under both execution contexts — session client (RLS) and
 * service-role client (RLS bypassed), per H5.
 *
 * Content is redacted on the way in, so a secret that reached a prompt cannot be
 * persisted verbatim in conversation history.
 */

const CONVERSATION_SELECT = "id, subject, entity_type, entity_id, status, created_at, updated_at";
const TURN_SELECT =
  "id, conversation_id, role, content, tool_calls, input_tokens, output_tokens, ai_provider, ai_model, ai_prompt_version, created_at";

interface ConversationRow {
  id: string;
  subject: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TurnRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: unknown;
  input_tokens: number;
  output_tokens: number;
  ai_provider: string | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  created_at: string;
}

function toConversationView(row: ConversationRow): AiConversationView {
  return {
    id: row.id,
    subject: row.subject,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTurn(row: TurnRow): AiTurn {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as AiRole,
    content: row.content,
    toolCalls: Array.isArray(row.tool_calls) ? (row.tool_calls as AiToolCall[]) : [],
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    aiPromptVersion: row.ai_prompt_version,
    createdAt: row.created_at,
  };
}

export interface CreateConversationInput {
  ownerId: string;
  subject?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

export async function createConversation(
  client: SupabaseClient,
  input: CreateConversationInput,
): Promise<AiConversationView> {
  const { data, error } = await client
    .from("ai_conversations")
    .insert({
      subject: input.subject ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      owner_id: input.ownerId,
    })
    .select(CONVERSATION_SELECT)
    .single();

  if (error) throw error;
  return toConversationView(data as ConversationRow);
}

export async function getConversation(
  client: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<AiConversationView | null> {
  const { data, error } = await client
    .from("ai_conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toConversationView(data as ConversationRow) : null;
}

export interface AppendTurnInput {
  conversationId: string;
  ownerId: string;
  role: AiRole;
  content: string;
  toolCalls?: AiToolCall[];
  inputTokens?: number;
  outputTokens?: number;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiPromptVersion?: string | null;
}

export async function appendTurn(client: SupabaseClient, input: AppendTurnInput): Promise<AiTurn> {
  const { data, error } = await client
    .from("ai_messages")
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      content: redact(input.content),
      tool_calls: input.toolCalls ?? [],
      input_tokens: input.inputTokens ?? 0,
      output_tokens: input.outputTokens ?? 0,
      ai_provider: input.aiProvider ?? null,
      ai_model: input.aiModel ?? null,
      ai_prompt_version: input.aiPromptVersion ?? null,
      owner_id: input.ownerId,
    })
    .select(TURN_SELECT)
    .single();

  if (error) throw error;
  return toTurn(data as TurnRow);
}

/**
 * Oldest-first turns, bounded.
 *
 * The limit is required, not optional: an unbounded history would be sent
 * verbatim to a provider and billed per token.
 */
export async function listTurns(
  client: SupabaseClient,
  conversationId: string,
  ownerId: string,
  limit: number,
): Promise<AiTurn[]> {
  const { data, error } = await client
    .from("ai_messages")
    .select(TURN_SELECT)
    .eq("conversation_id", conversationId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(1, limit), 200));

  if (error) throw error;
  return ((data ?? []) as TurnRow[]).map(toTurn);
}
