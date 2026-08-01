import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import { featureEnabled } from "@/lib/featureFlags";
import { AiError } from "@/lib/ai/errors";
import { ask, MAX_QUESTION_CHARS, type AssistantEvent } from "@/lib/ai/assistant";

/**
 * Copilot transport (Phase 3 · M8).
 *
 * `POST /api/ai/chat` — streams an answer as Server-Sent Events. Session-
 * authenticated like every other admin route; the reply is produced by
 * `lib/ai/assistant.ts`, and this file only moves bytes.
 *
 * Node runtime, never cached: the assistant reads Supabase with the caller's
 * session and streams a per-request answer, so a cached response would be both
 * wrong and a cross-user leak.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

/** One SSE frame. The blank line is the delimiter — without it nothing dispatches. */
function frame(event: AssistantEvent | { type: "error"; message: string }): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: NextRequest) {
  // Flag off -> the route does not exist, matching the hidden nav item.
  if (!featureEnabled("FEATURE_ASSISTANT")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const payload = (body ?? {}) as { question?: unknown; conversationId?: unknown };
  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  const conversationId =
    typeof payload.conversationId === "string" && payload.conversationId ? payload.conversationId : null;

  if (!question) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json(
      { error: `Question must be ${MAX_QUESTION_CHARS} characters or fewer.` },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of ask({ client: supabase }, { question, conversationId, ownerId: user.id })) {
          controller.enqueue(frame(event));
        }
      } catch (err) {
        // The status line is long gone by the time most failures happen, so an
        // error is delivered in-band as a final frame. Only our own taxonomy's
        // messages are forwarded — anything else could echo request content.
        console.error("[ai/chat] assistant failed:", err);
        controller.enqueue(
          frame({
            type: "error",
            message: err instanceof AiError ? err.message : "The assistant could not answer.",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Streaming is pointless if a proxy buffers the whole body first.
      "X-Accel-Buffering": "no",
    },
  });
}
