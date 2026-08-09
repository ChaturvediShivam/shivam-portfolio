import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AiCapabilities, AiCompletion, AiRequest, AiTaskClass, AiUsage } from "@/types/ai";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { AiTransientError } from "@/lib/ai/errors";
import { isActionError } from "@/lib/action-result";
import { createSupabaseStub, type SupabaseStub } from "@/test/stubs/supabase";

/**
 * Server Action integration tests (Phase 3 · M7).
 *
 * The unit suites drive `lib/ai/summarize.ts` directly, which leaves the layer
 * an operator actually touches unproven: the flag gate, the session lookup, the
 * owner that reaches the domain layer, and the error mapping. Those four are the
 * rollback mechanism and the authorization boundary, so they are tested here
 * against the real action bodies.
 *
 * Only the two things an action cannot bring into a Node test are replaced: the
 * request-scoped Supabase client (`next/headers` cookies) and the concrete AI
 * provider. Everything between them is the shipped code path.
 */

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/ai/providers", () => ({
  getAiProvider: vi.fn(),
  isAiProviderConfigured: vi.fn(() => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAiProvider } from "@/lib/ai/providers";
import { summarizeMessageAction } from "@/app/admin/(dashboard)/messages/actions";
import { summarizeOpportunityAction } from "@/app/admin/(dashboard)/opportunities/actions";
import { backfillSummariesAction } from "@/app/admin/(dashboard)/settings/actions";

const resolveClient = vi.mocked(createServerSupabaseClient);
const resolveProvider = vi.mocked(getAiProvider);

const OWNER = "owner-1";
const OTHER_OWNER = "owner-2";

const CAPABILITIES: AiCapabilities = {
  structuredOutput: true,
  toolCalling: true,
  tokenCounting: true,
  prefixCaching: true,
  reasoningControl: true,
  streaming: false,
};

const USAGE: AiUsage = { inputTokens: 300, outputTokens: 40, cachedInputTokens: 0 };

class StubProvider implements AiProvider {
  readonly name = "stub";
  readonly capabilities = CAPABILITIES;
  requests: AiRequest[] = [];

  constructor(private readonly queue: (AiCompletion | Error)[]) {}

  resolveModel(taskClass: AiTaskClass): string {
    return `stub-${taskClass}`;
  }

  estimateCostMicros(): number {
    return 1;
  }

  async complete(request: AiRequest): Promise<AiCompletion> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error("StubProvider: no queued response");
    if (next instanceof Error) throw next;
    return next;
  }

  async countTokens(): Promise<number> {
    return 300;
  }
}

function completion(text: string): AiCompletion {
  return {
    stopReason: "completed",
    text,
    toolCalls: [],
    usage: USAGE,
    model: "stub-model",
    provider: "stub",
    latencyMs: 9,
  };
}

const MESSAGE_REPLY = completion('{"summary":"Recruiter proposes Thursday.","confidence":0.9}');
const ROLLUP_REPLY = completion('{"summary":"Interview stage. Next: send prep.","confidence":0.8}');

const LONG_BODY = "A recruiter wrote a genuinely long message. ".repeat(20);

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    owner_id: OWNER,
    direction: "inbound",
    archived_at: null,
    subject: "Interview availability",
    from_address: "recruiter@example.com",
    body_text: LONG_BODY,
    metadata: { labelIds: ["INBOX"] },
    ai_processed_at: null,
    ...overrides,
  };
}

function opportunityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "opp-1",
    owner_id: OWNER,
    title: "Senior Engineer",
    stage: "interview",
    archived_at: null,
    ai_processed_at: null,
    company: { name: "Example Ltd" },
    ...overrides,
  };
}

/** Wire a stub client + provider into the action under test. */
function arrange(
  config: Parameters<typeof createSupabaseStub>[0],
  provider = new StubProvider([MESSAGE_REPLY]),
): { stub: SupabaseStub; provider: StubProvider } {
  const stub = createSupabaseStub(config);
  resolveClient.mockResolvedValue(stub.client);
  resolveProvider.mockReturnValue(provider);
  return { stub, provider };
}

// `withAdminAction` enforces the admin allowlist, not just the presence of a
// session, so the fixture user needs the address the allowlist below names.
// Authorization itself is covered in test/auth/admin-authorization.test.ts;
// here it only has to pass so the AI behaviour under test is actually reached.
const ADMIN_EMAIL = "admin@example.com";
const SIGNED_IN = { user: { id: OWNER, email: ADMIN_EMAIL } };

beforeEach(() => {
  process.env.ADMIN_SIGNUP_ALLOWLIST = ADMIN_EMAIL;
  process.env.FEATURE_AI = "true";
  process.env.FEATURE_AI_SUMMARIES = "true";
  process.env.AI_DAILY_TOKEN_BUDGET = "500000";
});

afterEach(() => {
  delete process.env.ADMIN_SIGNUP_ALLOWLIST;
  delete process.env.FEATURE_AI;
  delete process.env.FEATURE_AI_SUMMARIES;
  delete process.env.AI_DAILY_TOKEN_BUDGET;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// summarizeMessageAction
// ---------------------------------------------------------------------------

describe("summarizeMessageAction", () => {
  const ready = {
    ...SIGNED_IN,
    select: { messages: messageRow() },
    update: { messages: [{ id: "msg-1" }] },
    rpc: { ai_reserve_budget: true },
  };

  it("summarizes and returns the text when the flag is on", async () => {
    const { stub, provider } = arrange(ready);

    const result = await summarizeMessageAction("msg-1");

    expect(isActionError(result)).toBe(false);
    expect(result).toMatchObject({ ok: true, data: { summary: "Recruiter proposes Thursday." } });
    expect(provider.requests).toHaveLength(1);
    expect(stub.opsFor("messages").some((op) => op.type === "update")).toBe(true);
  });

  // Rollback safety: the flag is the kill switch, so an action reached from a
  // stale tab after the flip must do nothing at all — not merely fail late.
  it("is fully inert when the flag is off", async () => {
    delete process.env.FEATURE_AI_SUMMARIES;
    const { stub, provider } = arrange(ready);

    const result = await summarizeMessageAction("msg-1");

    expect(isActionError(result)).toBe(true);
    expect(result).toMatchObject({ formError: "AI summaries are not enabled." });
    expect(provider.requests).toHaveLength(0);
    expect(resolveProvider).not.toHaveBeenCalled();
    expect(stub.operations).toHaveLength(0);
  });

  it("refuses an unauthenticated caller before touching any data", async () => {
    const { stub, provider } = arrange({ ...ready, user: null });

    const result = await summarizeMessageAction("msg-1");

    expect(result).toMatchObject({ formError: "You must be signed in to do that." });
    expect(provider.requests).toHaveLength(0);
    expect(stub.operations).toHaveLength(0);
  });

  it("scopes the work to the session user, never to a caller-supplied owner", async () => {
    const { stub } = arrange(ready);

    await summarizeMessageAction("msg-1");

    const read = stub.opsFor("messages")[0];
    expect(stub.hasFilter(read, "eq", "owner_id", OWNER)).toBe(true);
    expect(stub.hasFilter(read, "eq", "owner_id", OTHER_OWNER)).toBe(false);

    const audit = stub.operations.find((op) => op.table === "ai_audit_log" && op.type === "insert");
    expect(audit?.values).toMatchObject({ owner_id: OWNER, actor: "user", entity_type: "message" });
  });

  it("reports another owner's message as not found", async () => {
    // The owner filter means the row never comes back for the wrong session.
    const { stub, provider } = arrange({ ...ready, select: { messages: null } });

    const result = await summarizeMessageAction("msg-1");

    expect(result).toMatchObject({ formError: "Message not found." });
    expect(provider.requests).toHaveLength(0);
    expect(stub.opsFor("messages").some((op) => op.type === "update")).toBe(false);
  });

  it("maps an ineligible message to an actionable refusal, without spending", async () => {
    const { provider } = arrange({ ...ready, select: { messages: messageRow({ body_text: "ok" }) } });

    const result = await summarizeMessageAction("msg-1");

    expect(result).toMatchObject({ formError: "This message is short enough to read in full." });
    expect(provider.requests).toHaveLength(0);
  });

  it("surfaces a provider failure through the error taxonomy, not raw", async () => {
    const { stub } = arrange(ready, new StubProvider([new AiTransientError("rate limited")]));

    const result = await summarizeMessageAction("msg-1");

    expect(isActionError(result)).toBe(true);
    expect(result).toMatchObject({ formError: "rate limited" });
    expect(stub.opsFor("messages").some((op) => op.type === "update")).toBe(false);
  });

  // The manual path is deliberately exempt from the daily budget: every run is
  // an explicit, admin-authenticated, flag-gated click. Asserted so the
  // exemption is a decision on record rather than an absence someone re-files.
  it("still runs when no daily budget is configured — manual paths are exempt by design", async () => {
    delete process.env.AI_DAILY_TOKEN_BUDGET;
    const { provider } = arrange(ready);

    const result = await summarizeMessageAction("msg-1");

    expect(isActionError(result)).toBe(false);
    expect(provider.requests).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// summarizeOpportunityAction
// ---------------------------------------------------------------------------

describe("summarizeOpportunityAction", () => {
  const ready = {
    ...SIGNED_IN,
    select: {
      opportunities: opportunityRow(),
      messages: [
        {
          subject: "Interview invite",
          from_address: "r@example.com",
          direction: "inbound",
          received_at: "2026-07-20T09:00:00Z",
          sent_at: null,
        },
      ],
      opportunity_notes: [{ body: "Prefers remote", created_at: "2026-07-21T09:00:00Z" }],
    },
    update: { opportunities: [{ id: "opp-1" }] },
    rpc: { ai_reserve_budget: true },
  };

  it("produces a rollup and returns it", async () => {
    const { stub, provider } = arrange(ready, new StubProvider([ROLLUP_REPLY]));

    const result = await summarizeOpportunityAction("opp-1");

    expect(result).toMatchObject({ ok: true, data: { summary: "Interview stage. Next: send prep." } });
    expect(provider.requests).toHaveLength(1);
    expect(stub.opsFor("opportunities").some((op) => op.type === "update")).toBe(true);
  });

  it("is fully inert when the flag is off", async () => {
    delete process.env.FEATURE_AI_SUMMARIES;
    const { stub, provider } = arrange(ready, new StubProvider([ROLLUP_REPLY]));

    const result = await summarizeOpportunityAction("opp-1");

    expect(result).toMatchObject({ formError: "AI summaries are not enabled." });
    expect(provider.requests).toHaveLength(0);
    expect(stub.operations).toHaveLength(0);
  });

  it("refuses an unauthenticated caller", async () => {
    const { stub } = arrange({ ...ready, user: null }, new StubProvider([ROLLUP_REPLY]));

    const result = await summarizeOpportunityAction("opp-1");

    expect(result).toMatchObject({ formError: "You must be signed in to do that." });
    expect(stub.operations).toHaveLength(0);
  });

  it("scopes the opportunity and every history read to the session user", async () => {
    const { stub } = arrange(ready, new StubProvider([ROLLUP_REPLY]));

    await summarizeOpportunityAction("opp-1");

    for (const table of ["opportunities", "messages", "opportunity_notes"]) {
      expect(stub.hasFilter(stub.opsFor(table)[0], "eq", "owner_id", OWNER)).toBe(true);
    }
    const audit = stub.operations.find((op) => op.table === "ai_audit_log" && op.type === "insert");
    expect(audit?.values).toMatchObject({ owner_id: OWNER, entity_type: "opportunity" });
  });

  it("refuses an opportunity with nothing to summarize, without spending", async () => {
    const { provider } = arrange(
      { ...ready, select: { ...ready.select, messages: [], opportunity_notes: [] } },
      new StubProvider([ROLLUP_REPLY]),
    );

    const result = await summarizeOpportunityAction("opp-1");

    expect(result).toMatchObject({
      formError: "There are no messages or notes to summarize yet.",
    });
    expect(provider.requests).toHaveLength(0);
  });

  it("surfaces a provider failure through the error taxonomy", async () => {
    const { stub } = arrange(ready, new StubProvider([new AiTransientError("provider unavailable")]));

    const result = await summarizeOpportunityAction("opp-1");

    expect(result).toMatchObject({ formError: "provider unavailable" });
    expect(stub.opsFor("opportunities").some((op) => op.type === "update")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// backfillSummariesAction
// ---------------------------------------------------------------------------

describe("backfillSummariesAction", () => {
  function backlog(rows: unknown[]) {
    return { ...SIGNED_IN, select: { messages: rows } };
  }

  it("requests summaries for the eligible backlog and reports the counts", async () => {
    const { stub } = arrange(
      backlog([messageRow({ id: "a" }), messageRow({ id: "b", body_text: "short" })]),
    );

    const result = await backfillSummariesAction();

    expect(result).toMatchObject({
      ok: true,
      data: { scanned: 2, eligible: 1, skipped: 1, enqueued: 1, failed: 0 },
    });
    const enqueued = stub.opsFor("jobs");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].values).toMatchObject({
      type: "ai_summarize",
      payload: { entityType: "message", entityId: "a", ownerId: OWNER },
      owner_id: OWNER,
    });
  });

  it("is fully inert when the flag is off", async () => {
    delete process.env.FEATURE_AI_SUMMARIES;
    const { stub } = arrange(backlog([messageRow()]));

    const result = await backfillSummariesAction();

    expect(result).toMatchObject({ formError: "AI summaries are not enabled." });
    expect(stub.operations).toHaveLength(0);
  });

  // Unattended spend requires a ceiling. Unlike the manual actions, the backfill
  // enqueues work that runs later without a human, so it refuses outright.
  it("refuses to run when no daily budget is configured", async () => {
    delete process.env.AI_DAILY_TOKEN_BUDGET;
    const { stub } = arrange(backlog([messageRow()]));

    const result = await backfillSummariesAction();

    expect(result).toMatchObject({
      formError: "Set AI_DAILY_TOKEN_BUDGET before running a backfill.",
    });
    expect(stub.operations).toHaveLength(0);
  });

  it("refuses an unauthenticated caller", async () => {
    const { stub } = arrange({ ...backlog([messageRow()]), user: null });

    const result = await backfillSummariesAction();

    expect(result).toMatchObject({ formError: "You must be signed in to do that." });
    expect(stub.operations).toHaveLength(0);
  });

  it("scopes the backlog scan to the session user and skips summarized rows", async () => {
    const { stub } = arrange(backlog([messageRow()]));

    await backfillSummariesAction();

    const scan = stub.opsFor("messages")[0];
    expect(stub.hasFilter(scan, "eq", "owner_id", OWNER)).toBe(true);
    // The filter that makes overwriting an existing summary impossible.
    expect(stub.hasFilter(scan, "is", "ai_processed_at", null)).toBe(true);
  });

  it("reports an empty backlog without enqueuing anything", async () => {
    const { stub } = arrange(backlog([]));

    const result = await backfillSummariesAction();

    expect(result).toMatchObject({
      ok: true,
      data: { scanned: 0, eligible: 0, skipped: 0, enqueued: 0, failed: 0 },
    });
    expect(stub.opsFor("jobs")).toHaveLength(0);
  });

  it("reports a failure instead of throwing when the backlog cannot be read", async () => {
    const exploding = createSupabaseStub(SIGNED_IN);
    resolveClient.mockResolvedValue(exploding.client);
    resolveProvider.mockReturnValue(new StubProvider([]));

    // No `select` configured for `messages`, so the stub throws — standing in
    // for a database error during the scan.
    const result = await backfillSummariesAction();

    expect(isActionError(result)).toBe(true);
    expect(result).toMatchObject({
      formError: "Could not run the backfill. Check the server logs.",
    });
  });
});
