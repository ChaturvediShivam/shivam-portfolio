"use client";

import * as React from "react";
import { ArrowUp, Loader2, Search, Sparkles, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, EmptyState } from "@/components/admin/ui";

/**
 * Copilot chat (Phase 3 · M8).
 *
 * Consumes the SSE stream from `POST /api/ai/chat` and renders the answer as it
 * arrives. Conversation state lives here rather than in the URL because a
 * half-streamed answer is not a navigable resource; the server owns the durable
 * history, and this component holds only what is on screen.
 */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Tool names used while producing this answer, in order. */
  tools: string[];
  /** True while this message is still streaming. */
  pending?: boolean;
  error?: string;
}

/** Server frames, mirroring `AssistantEvent` plus the transport's error frame. */
type StreamFrame =
  | { type: "conversation"; conversationId: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "What should I follow up on this week?",
  "Which applications have gone quiet?",
  "Summarise where my interviews stand.",
];

/** Human label for a tool name, so the status line reads like English. */
function toolLabel(name: string): string {
  if (name === "search_crm") return "Searching your CRM";
  return `Running ${name.replace(/_/g, " ")}`;
}

/**
 * Split an SSE buffer into complete frames.
 *
 * A chunk boundary can fall anywhere, including mid-JSON, so only whole
 * `\n\n`-terminated records are parsed and the remainder is carried forward.
 */
function drainFrames(buffer: string): { frames: StreamFrame[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: StreamFrame[] = [];

  for (const part of parts) {
    const line = part.split("\n").find((candidate) => candidate.startsWith("data: "));
    if (!line) continue;
    try {
      frames.push(JSON.parse(line.slice(6)) as StreamFrame);
    } catch {
      // A frame we cannot parse is dropped rather than killing the stream.
    }
  }

  return { frames, rest };
}

export function AssistantChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const conversationId = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  /**
   * Synchronous twin of `busy`.
   *
   * `busy` is state, so it is stale inside a handler until the next render —
   * two submits in the same tick (Enter twice, or Enter plus a Send click) would
   * both read `false` and both start a stream. Two concurrent streams would
   * interleave into the same bubble, strand the first one's spinner forever, and
   * orphan the first request beyond the reach of `abortRef`, which the second
   * would have overwritten. A ref flips immediately, so the second submit loses.
   */
  const inFlight = React.useRef(false);
  /** Monotonic id source: two sends in one millisecond must not collide as keys. */
  const seq = React.useRef(0);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // A navigation mid-answer must not leave the request running.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = React.useCallback((patch: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) =>
      current.map((message, index) => (index === current.length - 1 ? patch(message) : message)),
    );
  }, []);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || inFlight.current) return;
    inFlight.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setInput("");

    const turn = (seq.current += 1);
    setMessages((current) => [
      ...current,
      { id: `${turn}-q`, role: "user", content: trimmed, tools: [] },
      { id: `${turn}-a`, role: "assistant", content: "", tools: [], pending: true },
    ]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, conversationId: conversationId.current }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const message =
          response.status === 404
            ? "The assistant is not enabled."
            : "The assistant could not be reached.";
        patchLast((m) => ({ ...m, pending: false, error: message }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = drainFrames(buffer);
        buffer = rest;

        for (const frame of frames) {
          if (frame.type === "conversation") {
            conversationId.current = frame.conversationId;
          } else if (frame.type === "text") {
            patchLast((m) => ({ ...m, content: m.content + frame.text }));
          } else if (frame.type === "tool") {
            patchLast((m) => ({ ...m, tools: [...m.tools, frame.name] }));
          } else if (frame.type === "error") {
            patchLast((m) => ({ ...m, pending: false, error: frame.message }));
          } else {
            patchLast((m) => ({ ...m, pending: false }));
          }
        }
      }

      // A stream that ends without `done` still has to stop the spinner.
      patchLast((m) => ({ ...m, pending: false }));
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        patchLast((m) => ({ ...m, pending: false }));
      } else {
        patchLast((m) => ({ ...m, pending: false, error: "The connection was interrupted." }));
      }
    } finally {
      abortRef.current = null;
      inFlight.current = false;
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title="Ask about your job search"
            description="The assistant reads your opportunities, companies, contacts, messages, tasks, events and notes — and answers only from what it finds."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Button key={suggestion} size="sm" onClick={() => void send(suggestion)}>
                    {suggestion}
                  </Button>
                ))}
              </div>
            }
          />
        ) : (
          messages.map((message) => <Turn key={message.id} message={message} />)
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 border-t border-white/[0.06] bg-slate-950/80 pt-3 backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="assistant-input" className="sr-only">
            Ask the assistant
          </label>
          <textarea
            id="assistant-input"
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your applications, contacts, or what to do next…"
            className="max-h-40 min-h-[42px] flex-1 resize-y rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          />
          {busy ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop generating"
            >
              <Square className="size-4" aria-hidden />
              Stop
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!input.trim()} aria-label="Send">
              <ArrowUp className="size-4" aria-hidden />
              Send
            </Button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          Answers come from your CRM records and can be wrong — check anything important.
        </p>
      </form>
    </div>
  );
}

function Turn({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm",
          isUser
            ? "bg-white/[0.08] text-slate-100"
            : "border border-white/[0.06] bg-white/[0.02] text-slate-300",
        )}
      >
        {message.tools.length > 0 && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Search className="size-3" aria-hidden />
            {toolLabel(message.tools[message.tools.length - 1])}
          </p>
        )}

        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}

        {message.pending && !message.content && (
          <span className="flex items-center gap-2 text-slate-500">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Thinking…
          </span>
        )}

        {/*
          A finished turn with no text is possible: the model can exhaust its
          tool-round budget still wanting another search, which ends the turn on
          a tool call rather than an answer. Say so instead of leaving a blank
          bubble that reads as a broken page.
        */}
        {!message.pending && !message.content && !message.error && (
          <p className="text-xs text-slate-500">
            No answer was returned — try asking a narrower question.
          </p>
        )}

        {message.error && <p className="text-xs text-red-400">{message.error}</p>}
      </div>
    </div>
  );
}
