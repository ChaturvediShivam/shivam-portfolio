import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { triageInbox } from "@/lib/ai/inbox";
import type { AiGateway } from "@/lib/ai/gateway";

/**
 * Inbox triage (AI Inbox Assistant).
 *
 * The load-bearing assertions are about the mapping step. The model returns
 * integer refs, and a digest that cites a message the operator cannot open is
 * worse than no digest — so every ref is validated against the candidates that
 * were actually sent, and anything invented, duplicated or out of range is
 * dropped rather than rendered.
 */

const OWNER = "owner-1";

function message(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `msg-${index}`,
    subject: `Subject ${index}`,
    snippet: null,
    body_text: `Body of message ${index}`,
    ai_summary: null,
    from_name: `Sender ${index}`,
    from_address: `s${index}@example.com`,
    received_at: `2026-07-${String(10 + index).padStart(2, "0")}T00:00:00Z`,
    is_read: false,
    opportunity_id: null,
    owner_id: OWNER,
    ...overrides,
  };
}

/** Supabase double returning a scripted candidate list, recording filters. */
function fakeClient(rows: unknown[]) {
  const filters: Record<string, unknown> = {};
  const client = {
    from() {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      Object.assign(builder, {
        select: self,
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        is(column: string) {
          filters[`is:${column}`] = true;
          return builder;
        },
        gte(column: string, value: unknown) {
          filters[`gte:${column}`] = value;
          return builder;
        },
        order: self,
        limit(n: number) {
          filters.limit = n;
          return Promise.resolve({ data: rows, error: null });
        },
      });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, filters };
}

function gateway(parsed: unknown, stopReason = "completed") {
  const complete = vi.fn().mockResolvedValue({
    stopReason,
    text: "",
    parsed,
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 },
    model: "stub",
    provider: "stub",
    latencyMs: 1,
  });
  return { gateway: { complete } as unknown as AiGateway, complete };
}

const ONE_ITEM = {
  items: [{ ref: 1, priority: "high", headline: "Interview times", why: "They asked.", nextStep: "Reply today" }],
  noActionCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("candidate selection", () => {
  it("scopes to the owner's unarchived inbound mail within the window", async () => {
    const { client, filters } = fakeClient([message(1)]);
    const { gateway: gw } = gateway(ONE_ITEM);

    await triageInbox(client, gw, { ownerId: OWNER });

    expect(filters.owner_id).toBe(OWNER);
    expect(filters.direction).toBe("inbound");
    expect(filters["is:archived_at"]).toBe(true);
    expect(filters["gte:received_at"]).toBeTruthy();
    expect(filters.limit).toBe(25);
  });

  it("skips without calling the provider when there is nothing to review", async () => {
    const { client } = fakeClient([]);
    const { gateway: gw, complete } = gateway(ONE_ITEM);

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    expect(result).toEqual({ status: "skipped", reason: "empty_inbox" });
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("prompt construction", () => {
  it("numbers each message and carries read state and linkage", async () => {
    const { client } = fakeClient([message(1, { is_read: true, opportunity_id: "opp-1" }), message(2)]);
    const { gateway: gw, complete } = gateway(ONE_ITEM);

    await triageInbox(client, gw, { ownerId: OWNER });

    const vars = complete.mock.calls[0][0].variables as Record<string, string>;
    expect(vars.messages).toContain("[ref 1]");
    expect(vars.messages).toContain("[ref 2]");
    expect(vars.messages).toContain("read, linked to an opportunity");
    expect(vars.messages).toContain("unread");
  });

  it("prefers the M7 summary over the raw body", async () => {
    const { client } = fakeClient([message(1, { ai_summary: "Short redacted summary." })]);
    const { gateway: gw, complete } = gateway(ONE_ITEM);

    await triageInbox(client, gw, { ownerId: OWNER });

    const vars = complete.mock.calls[0][0].variables as Record<string, string>;
    expect(vars.messages).toContain("Short redacted summary.");
    expect(vars.messages).not.toContain("Body of message 1");
  });

  it("bounds each excerpt and flags the truncation to the model", async () => {
    const { client } = fakeClient([message(1, { body_text: "x".repeat(2000) })]);
    const { gateway: gw, complete } = gateway(ONE_ITEM);

    await triageInbox(client, gw, { ownerId: OWNER });

    const vars = complete.mock.calls[0][0].variables as Record<string, string>;
    expect(vars.messages.length).toBeLessThan(1000);
    expect(vars.truncationNote).toContain("shortened");
  });
});

describe("ref mapping", () => {
  it("resolves a ref back to the real message", async () => {
    const { client } = fakeClient([message(1), message(2)]);
    const { gateway: gw } = gateway({
      items: [{ ref: 2, priority: "normal", headline: "h", why: "w", nextStep: "n" }],
      noActionCount: 1,
    });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.digest.items).toHaveLength(1);
    expect(result.digest.items[0].messageId).toBe("msg-2");
    expect(result.digest.items[0].from).toBe("Sender 2 <s2@example.com>");
  });

  it("drops a ref the model invented", async () => {
    // The whole reason refs are validated: a cited message that does not exist
    // would render as an unopenable link.
    const { client } = fakeClient([message(1)]);
    const { gateway: gw } = gateway({
      items: [
        { ref: 1, priority: "high", headline: "real", why: "w", nextStep: "n" },
        { ref: 99, priority: "high", headline: "invented", why: "w", nextStep: "n" },
      ],
      noActionCount: 0,
    });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.digest.items).toHaveLength(1);
    expect(result.digest.items[0].headline).toBe("real");
  });

  it("drops out-of-range, non-integer and duplicate refs", async () => {
    const { client } = fakeClient([message(1), message(2)]);
    const { gateway: gw } = gateway({
      items: [
        { ref: 1, priority: "normal", headline: "first", why: "w", nextStep: "n" },
        { ref: 1, priority: "normal", headline: "duplicate", why: "w", nextStep: "n" },
        { ref: 0, priority: "normal", headline: "zero", why: "w", nextStep: "n" },
        { ref: -3, priority: "normal", headline: "negative", why: "w", nextStep: "n" },
        { ref: "2" as unknown as number, priority: "normal", headline: "string", why: "w", nextStep: "n" },
      ],
      noActionCount: 0,
    });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.digest.items).toHaveLength(1);
    expect(result.digest.items[0].headline).toBe("first");
  });
});

describe("digest shaping", () => {
  it("orders high priority first, then most recent", async () => {
    const { client } = fakeClient([message(1), message(2), message(3)]);
    const { gateway: gw } = gateway({
      items: [
        { ref: 1, priority: "normal", headline: "oldest normal", why: "w", nextStep: "n" },
        { ref: 3, priority: "normal", headline: "newest normal", why: "w", nextStep: "n" },
        { ref: 2, priority: "high", headline: "urgent", why: "w", nextStep: "n" },
      ],
      noActionCount: 0,
    });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.digest.items.map((i) => i.headline)).toEqual([
      "urgent",
      "newest normal",
      "oldest normal",
    ]);
  });

  it("derives noActionCount rather than trusting the model's arithmetic", async () => {
    const { client } = fakeClient([message(1), message(2), message(3)]);
    const { gateway: gw } = gateway({
      items: [{ ref: 1, priority: "high", headline: "h", why: "w", nextStep: "n" }],
      noActionCount: 99, // wrong on purpose
    });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.digest.noActionCount).toBe(2);
    expect(result.digest.consideredCount).toBe(3);
  });

  it("treats an unknown priority as normal", async () => {
    const { client } = fakeClient([message(1)]);
    const { gateway: gw } = gateway({
      items: [{ ref: 1, priority: "CRITICAL", headline: "h", why: "w", nextStep: "n" }],
      noActionCount: 0,
    });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.digest.items[0].priority).toBe("normal");
  });

  it("falls back rather than rendering blank text", async () => {
    const { client } = fakeClient([message(1)]);
    const { gateway: gw } = gateway({
      items: [{ ref: 1, priority: "high", headline: "  ", why: "", nextStep: null as never }],
      noActionCount: 0,
    });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.digest.items[0].headline).toBe("Subject 1");
    expect(result.digest.items[0].why).toBeTruthy();
    expect(result.digest.items[0].nextStep).toBeTruthy();
  });

  it("bounds model-supplied text before it reaches the UI", async () => {
    const { client } = fakeClient([message(1)]);
    const { gateway: gw } = gateway({
      items: [{ ref: 1, priority: "high", headline: "h".repeat(5000), why: "w", nextStep: "n" }],
      noActionCount: 0,
    });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.digest.items[0].headline.length).toBe(300);
  });
});

describe("degraded outcomes", () => {
  it("reports a refusal rather than an empty digest", async () => {
    const { client } = fakeClient([message(1)]);
    const { gateway: gw } = gateway(undefined, "refused");

    expect(await triageInbox(client, gw, { ownerId: OWNER })).toEqual({
      status: "skipped",
      reason: "refused",
    });
  });

  it("reports unusable output rather than crashing", async () => {
    const { client } = fakeClient([message(1)]);
    const { gateway: gw } = gateway({ noActionCount: 0 });

    expect(await triageInbox(client, gw, { ownerId: OWNER })).toEqual({
      status: "skipped",
      reason: "empty_output",
    });
  });

  it("returns an empty digest, not an error, when nothing needs action", async () => {
    const { client } = fakeClient([message(1), message(2)]);
    const { gateway: gw } = gateway({ items: [], noActionCount: 2 });

    const result = await triageInbox(client, gw, { ownerId: OWNER });

    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.digest.items).toHaveLength(0);
    expect(result.digest.noActionCount).toBe(2);
  });
});
