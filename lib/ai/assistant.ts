import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiMessage } from "@/types/ai";
import { featureEnabled } from "@/lib/featureFlags";
import { AiDisabledError } from "@/lib/ai/errors";
import { AiGateway, type AiGatewayEvent } from "@/lib/ai/gateway";
import { getPromptTemplate } from "@/lib/ai/prompts/registry";
import { getAiProvider } from "@/lib/ai/providers";
import {
  appendTurn,
  createConversation,
  getConversation,
  listTurns,
} from "@/lib/ai/conversations";

/**
 * Copilot orchestration (Phase 3 · M8).
 *
 * Sits between the transport (`app/api/ai/chat`) and the gateway, owning the
 * three things a chat turn needs beyond one completion: which conversation this
 * belongs to, how much prior history to replay, and persisting both sides of the
 * exchange.
 *
 * It deliberately holds no HTTP concepts — no `Request`, no SSE, no
 * `ReadableStream` — so the loop is drivable from a test with a stub gateway,
 * and so a future non-HTTP caller (a job, a scheduled digest) reuses it as-is.
 */

/** Prior turns replayed into the model. Each one is billed on every message. */
const HISTORY_TURNS = 20;

/** Longest question accepted. Prompt context is finite and this is the cheap place to say so. */
export const MAX_QUESTION_CHARS = 4000;

/** Tool rounds the copilot may take per question — search, then drill down. */
const TOOL_ROUNDS = 4;

const TEMPLATE_ID = "assistant";

export interface AskInput {
  /** Existing conversation to continue; a new one is created when absent. */
  conversationId?: string | null;
  question: string;
  ownerId: string;
}

export interface AskContext {
  client: SupabaseClient;
}

/** What the transport re-emits. Adds the conversation id to the gateway's events. */
export type AssistantEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done" };

/** Persisted turns → the neutral message history the gateway replays. */
function toHistory(turns: { role: string; content: string }[]): AiMessage[] {
  return turns
    .filter((turn) => turn.role === "user" || turn.role === "assistant")
    .filter((turn) => turn.content.trim().length > 0)
    .map((turn) => ({
      role: turn.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: turn.content,
    }));
}

/**
 * Answer one question, streaming the reply.
 *
 * Ordering is deliberate. The user's turn is persisted *before* the provider is
 * called, so a failed or abandoned answer still leaves the question in the
 * history rather than losing what the operator typed. The assistant's turn is
 * persisted only on `done`, because a half-streamed answer that was cancelled or
 * errored is not something to replay as context on the next question.
 */
export async function* ask(
  ctx: AskContext,
  input: AskInput,
): AsyncGenerator<AssistantEvent, void> {
  if (!featureEnabled("FEATURE_ASSISTANT")) throw new AiDisabledError("Assistant is not enabled.");

  const question = input.question.trim();
  if (!question) throw new Error("Question must not be empty.");
  if (question.length > MAX_QUESTION_CHARS) {
    throw new Error(`Question must be ${MAX_QUESTION_CHARS} characters or fewer.`);
  }

  // A conversation id from the client is a claim, not a fact: it is resolved
  // owner-scoped, and an id belonging to anyone else starts a fresh conversation
  // rather than reading or appending to theirs.
  const existing = input.conversationId
    ? await getConversation(ctx.client, input.conversationId, input.ownerId)
    : null;

  const conversation =
    existing ??
    (await createConversation(ctx.client, {
      ownerId: input.ownerId,
      subject: question.slice(0, 120),
    }));

  yield { type: "conversation", conversationId: conversation.id };

  const history = existing
    ? toHistory(await listTurns(ctx.client, conversation.id, input.ownerId, HISTORY_TURNS))
    : [];

  await appendTurn(ctx.client, {
    conversationId: conversation.id,
    ownerId: input.ownerId,
    role: "user",
    content: question,
  });

  const gateway = new AiGateway({ provider: getAiProvider(), client: ctx.client });

  let answer = "";
  let done: Extract<AiGatewayEvent, { type: "done" }> | null = null;

  for await (const event of gateway.stream({
    templateId: TEMPLATE_ID,
    variables: { question, today: new Date().toISOString().slice(0, 10) },
    ownerId: input.ownerId,
    actor: "user",
    action: "assistant_chat",
    conversationId: conversation.id,
    history,
    enableTools: true,
    maxToolRounds: TOOL_ROUNDS,
  })) {
    if (event.type === "text") {
      answer += event.text;
      yield { type: "text", text: event.text };
    } else if (event.type === "tool") {
      yield { type: "tool", name: event.name };
    } else {
      done = event;
    }
  }

  if (done) {
    await appendTurn(ctx.client, {
      conversationId: conversation.id,
      ownerId: input.ownerId,
      role: "assistant",
      content: answer,
      inputTokens: done.completion.usage.inputTokens,
      outputTokens: done.completion.usage.outputTokens,
      aiProvider: done.completion.provider,
      aiModel: done.completion.model,
      // Read from the registry rather than restated, so a template bump stamps
      // history correctly without anyone remembering to edit this line.
      aiPromptVersion: getPromptTemplate(TEMPLATE_ID).version,
    });
  }

  yield { type: "done" };
}
