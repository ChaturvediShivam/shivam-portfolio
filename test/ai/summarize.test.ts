import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AiCapabilities, AiCompletion, AiRequest, AiTaskClass, AiUsage } from "@/types/ai";
import { AiGateway } from "@/lib/ai/gateway";
import type { AiProvider } from "@/lib/ai/providers/provider";
import {
  AiBudgetExceededError,
  AiDisabledError,
  AiPermanentError,
  AiTransientError,
  AiUnconfiguredError,
} from "@/lib/ai/errors";
import { summarizeMessage } from "@/lib/ai/summarize";
import { requestMessageSummary } from "@/lib/sync/gmail-sync";
import { runJobs } from "@/lib/jobs/runner";
import { isAbsorbable } from "@/lib/jobs/handlers/ai-summarize";
import { createSupabaseStub, type StubOperation } from "@/test/stubs/supabase";

/**
 * Every case drives the real gateway against a provider that imports no SDK, so
 * these exercise the actual budget → provider → validation → audit path rather
 * than a mock of it.
 */

const CAPABILITIES: AiCapabilities = {
  structuredOutput: true,
  toolCalling: true,
  tokenCounting: true,
  prefixCaching: true,
  reasoningControl: true,
};

const USAGE: AiUsage = { inputTokens: 400, outputTokens: 60, cachedInputTokens: 0 };

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
    this.requests.push({ ...request, messages: [...request.messages] });
    const next = this.queue.shift();
    if (!next) throw new Error("StubProvider: no queued response");
    if (next instanceof Error) throw next;
    return next;
  }

  async countTokens(): Promise<number> {
    return 400;
  }
}

function completion(overrides: Partial<AiCompletion> = {}): AiCompletion {
  return {
    stopReason: "completed",
    text: '{"summary":"Recruiter proposes Thursday at 14:00.","confidence":0.9}',
    toolCalls: [],
    usage: USAGE,
    model: "stub-model",
    provider: "stub",
    latencyMs: 12,
    ...overrides,
  };
}

const OWNER = "owner-1";
const LONG_BODY = "A recruiter wrote a genuinely long message. ".repeat(20); // > 400 chars

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    owner_id: OWNER,
    direction: "inbound",
    archived_at: null,
    subject: "Interview availability",
    from_address: "recruiter@example.com",
    body_text: LONG_BODY,
    snippet: "Are you free Thursday?",
    metadata: { labelIds: ["INBOX"] },
    ai_processed_at: null,
    ...overrides,
  };
}

/** A stub wired for the happy path: row found, update claims one row. */
function setup(row: unknown, options: { claimed?: unknown[] } = {}) {
  return createSupabaseStub({
    select: { messages: row },
    update: { messages: options.claimed ?? [{ id: "msg-1" }] },
    rpc: { ai_reserve_budget: true },
  });
}

function gatewayFor(stub: ReturnType<typeof setup>, provider: StubProvider) {
  return new AiGateway({ provider, client: stub.client });
}

function updateOp(operations: StubOperation[]): StubOperation | undefined {
  return operations.find((operation) => operation.type === "update");
}

beforeEach(() => {
  process.env.FEATURE_AI = "true";
});

afterEach(() => {
  delete process.env.FEATURE_AI;
});

describe("eligibility", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["outbound mail", { direction: "outbound" }, "outbound"],
    ["archived mail", { archived_at: "2026-07-01T00:00:00Z" }, "archived"],
    ["a message shorter than the snippet is worth", { body_text: "Thanks!" }, "too_short"],
    ["promotional mail", { metadata: { labelIds: ["INBOX", "CATEGORY_PROMOTIONS"] } }, "bulk_mail"],
  ];

  for (const [label, overrides, reason] of cases) {
    it(`skips ${label} without calling the provider`, async () => {
      const stub = setup(messageRow(overrides));
      const provider = new StubProvider([completion()]);

      const result = await summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", {
        ownerId: OWNER,
      });

      expect(result).toEqual({ status: "skipped", reason });
      expect(provider.requests).toHaveLength(0);
      expect(updateOp(stub.operations)).toBeUndefined();
    });
  }

  it("reports another owner's message as absent rather than denied", async () => {
    const stub = setup(null);
    const provider = new StubProvider([completion()]);

    const result = await summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", {
      ownerId: OWNER,
    });

    expect(result).toEqual({ status: "skipped", reason: "not_found" });
    expect(provider.requests).toHaveLength(0);
  });

  it("scopes the read to the owner rather than trusting the client (H5)", async () => {
    const stub = setup(messageRow());
    await summarizeMessage(stub.client, gatewayFor(stub, new StubProvider([completion()])), "msg-1", {
      ownerId: OWNER,
    });

    const read = stub.opsFor("messages")[0];
    expect(stub.hasFilter(read, "eq", "id", "msg-1")).toBe(true);
    expect(stub.hasFilter(read, "eq", "owner_id", OWNER)).toBe(true);
  });
});

describe("summarize-once", () => {
  it("does not call the provider for an already-summarized message", async () => {
    const stub = setup(messageRow({ ai_processed_at: "2026-07-31T10:00:00Z" }));
    const provider = new StubProvider([completion()]);

    const result = await summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", {
      ownerId: OWNER,
    });

    expect(result).toEqual({ status: "skipped", reason: "already_summarized" });
    expect(provider.requests).toHaveLength(0);
  });

  it("re-summarizes when the operator forces it", async () => {
    const stub = setup(messageRow({ ai_processed_at: "2026-07-31T10:00:00Z" }));
    const provider = new StubProvider([completion()]);

    const result = await summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", {
      ownerId: OWNER,
      force: true,
    });

    expect(result.status).toBe("written");
    expect(provider.requests).toHaveLength(1);
  });
});

describe("the conditional claim", () => {
  it("issues the ai_processed_at is null predicate on the write", async () => {
    const stub = setup(messageRow());
    await summarizeMessage(stub.client, gatewayFor(stub, new StubProvider([completion()])), "msg-1", {
      ownerId: OWNER,
    });

    const write = updateOp(stub.operations);
    expect(write).toBeDefined();
    // The predicate — not merely that update was called — is the guarantee.
    expect(stub.hasFilter(write!, "is", "ai_processed_at", null)).toBe(true);
    expect(stub.hasFilter(write!, "eq", "owner_id", OWNER)).toBe(true);
  });

  it("drops the predicate on a forced refresh, which is the only path that may overwrite", async () => {
    const stub = setup(messageRow({ ai_processed_at: "2026-07-31T10:00:00Z" }));
    await summarizeMessage(stub.client, gatewayFor(stub, new StubProvider([completion()])), "msg-1", {
      ownerId: OWNER,
      force: true,
    });

    const write = updateOp(stub.operations)!;
    expect(stub.hasFilter(write, "is", "ai_processed_at", null)).toBe(false);
  });

  it("stops without error when another caller won the claim", async () => {
    const stub = setup(messageRow(), { claimed: [] });

    const result = await summarizeMessage(
      stub.client,
      gatewayFor(stub, new StubProvider([completion()])),
      "msg-1",
      { ownerId: OWNER },
    );

    expect(result).toEqual({ status: "skipped", reason: "claim_lost" });
  });
});

describe("provenance and clamping", () => {
  it("stamps the resolved template version, not a duplicated constant", async () => {
    const stub = setup(messageRow());
    const result = await summarizeMessage(
      stub.client,
      gatewayFor(stub, new StubProvider([completion()])),
      "msg-1",
      { ownerId: OWNER },
    );

    expect(result).toMatchObject({ status: "written", promptVersion: "1.0.0" });
    expect(updateOp(stub.operations)!.values).toMatchObject({
      ai_prompt_version: "1.0.0",
      ai_model: "stub-model",
    });
  });

  const confidences: [string, string, number][] = [
    ["above the column's range", '{"summary":"s","confidence":1.5}', 1],
    ["below zero", '{"summary":"s","confidence":-0.2}', 0],
    ["inside the range", '{"summary":"s","confidence":0.42}', 0.42],
  ];

  for (const [label, text, expected] of confidences) {
    it(`clamps a confidence ${label} before the numeric(5,4) write`, async () => {
      const stub = setup(messageRow());
      await summarizeMessage(
        stub.client,
        gatewayFor(stub, new StubProvider([completion({ text })])),
        "msg-1",
        { ownerId: OWNER },
      );

      expect(updateOp(stub.operations)!.values!.ai_confidence).toBe(expected);
    });
  }

  it("writes every provenance column the schema provides", async () => {
    const stub = setup(messageRow());
    await summarizeMessage(stub.client, gatewayFor(stub, new StubProvider([completion()])), "msg-1", {
      ownerId: OWNER,
    });

    expect(Object.keys(updateOp(stub.operations)!.values!).sort()).toEqual([
      "ai_confidence",
      "ai_model",
      "ai_processed_at",
      "ai_prompt_version",
      "ai_summary",
    ]);
  });
});

describe("source bounding", () => {
  it("truncates an oversized body and says so outside the message fence", async () => {
    const stub = setup(messageRow({ body_text: "x".repeat(20_000) }));
    const provider = new StubProvider([completion()]);

    await summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", { ownerId: OWNER });

    const sent = provider.requests[0].messages.at(-1)!.content;
    expect(sent.length).toBeLessThan(20_000);
    expect(sent).toContain("shortened for length");
    // The note is ours, so it must sit outside the delimited data region.
    expect(sent.indexOf("shortened for length")).toBeGreaterThan(sent.indexOf("---END MESSAGE---"));
  });

  it("adds no truncation note when the body fits", async () => {
    const stub = setup(messageRow());
    const provider = new StubProvider([completion()]);

    await summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", { ownerId: OWNER });

    expect(provider.requests[0].messages.at(-1)!.content).not.toContain("shortened for length");
  });
});

describe("non-success outcomes", () => {
  it("treats a refusal as an outcome, leaving ai_processed_at unset so it is not retried", async () => {
    const stub = setup(messageRow());
    const provider = new StubProvider([completion({ stopReason: "refused", text: "" })]);

    const result = await summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", {
      ownerId: OWNER,
    });

    expect(result).toEqual({ status: "skipped", reason: "refused" });
    expect(updateOp(stub.operations)).toBeUndefined();
  });

  it("throws a non-retryable error on truncation, since retrying truncates again", async () => {
    const stub = setup(messageRow());
    const provider = new StubProvider([completion({ stopReason: "truncated", text: '{"summ' })]);

    await expect(
      summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", { ownerId: OWNER }),
    ).rejects.toThrow(AiPermanentError);
    expect(updateOp(stub.operations)).toBeUndefined();
  });
});

describe("provider capability degradation", () => {
  it("still produces a valid summary when the provider has no native structured output", async () => {
    const stub = setup(messageRow());
    const provider = new StubProvider([completion({ text: '```json\n{"summary":"s","confidence":0.5}\n```' })]);
    Object.assign(provider.capabilities, { structuredOutput: false });

    const result = await summarizeMessage(stub.client, gatewayFor(stub, provider), "msg-1", {
      ownerId: OWNER,
    });

    expect(result).toMatchObject({ status: "written", summary: "s" });
    expect(provider.requests[0].responseSchema).toBeUndefined();
  });
});

describe("the ai_summarize job handler (M7.2)", () => {
  function jobRow(payload: Record<string, unknown>) {
    return { id: "job-1", type: "ai_summarize", payload, attempts: 1, max_attempts: 5 };
  }

  /** Drive the real runner so registration under the right type is proven too. */
  async function drain(payload: Record<string, unknown>) {
    const stub = createSupabaseStub({
      select: { messages: messageRow() },
      update: { messages: [{ id: "msg-1" }] },
      rpc: { claim_jobs: [jobRow(payload)] },
    });
    const result = await runJobs({ client: stub.client }, { limit: 1 });
    const write = stub.opsFor("jobs").find((operation) => operation.type === "update");
    return { stub, result, status: write?.values?.status, lastError: write?.values?.last_error };
  }

  const VALID = { entityType: "message", entityId: "msg-1", ownerId: OWNER };

  afterEach(() => {
    delete process.env.FEATURE_AI_SUMMARIES;
  });

  it("does no work and completes the job when the flag is off", async () => {
    const { stub, status } = await drain(VALID);

    expect(status).toBe("done");
    expect(stub.opsFor("messages")).toHaveLength(0);
  });

  it("dead-letters a malformed payload instead of completing it quietly", async () => {
    process.env.FEATURE_AI_SUMMARIES = "true";
    const { status, lastError } = await drain({ entityType: "message" });

    expect(status).toBe("pending"); // rescheduled, then dead-letters at max_attempts
    expect(String(lastError)).toContain("invalid payload");
  });

  it("rejects an entity type this milestone does not handle", async () => {
    process.env.FEATURE_AI_SUMMARIES = "true";
    const { status } = await drain({ ...VALID, entityType: "opportunity" });

    expect(status).toBe("pending");
  });

  it("absorbs a non-retryable AI failure rather than burning five retries", async () => {
    process.env.FEATURE_AI_SUMMARIES = "true";
    delete process.env.AI_PROVIDER_API_KEY; // -> AiUnconfiguredError, retryable: false

    const { status, lastError } = await drain(VALID);

    expect(status).toBe("done");
    expect(lastError).toBeNull();
  });
});

describe("the runner retry contract", () => {
  it("absorbs every non-retryable member of the taxonomy", () => {
    expect(isAbsorbable(new AiPermanentError("bad request"))).toBe(true);
    expect(isAbsorbable(new AiBudgetExceededError())).toBe(true);
    expect(isAbsorbable(new AiDisabledError())).toBe(true);
    expect(isAbsorbable(new AiUnconfiguredError())).toBe(true);
  });

  it("returns a transient failure to the runner so backoff still applies", () => {
    expect(isAbsorbable(new AiTransientError("rate limited"))).toBe(false);
  });

  it("never absorbs a failure from outside the taxonomy", () => {
    expect(isAbsorbable(new Error("database exploded"))).toBe(false);
    expect(isAbsorbable(undefined)).toBe(false);
  });
});

describe("enqueueing a summary from ingest (M7.2)", () => {
  afterEach(() => {
    delete process.env.FEATURE_AI_SUMMARIES;
  });

  it("enqueues nothing when the flag is off", async () => {
    const stub = createSupabaseStub({});
    await requestMessageSummary(stub.client, OWNER, "msg-1");
    expect(stub.operations).toHaveLength(0);
  });

  it("carries the owner in the payload, because the handler never sees the job row", async () => {
    process.env.FEATURE_AI_SUMMARIES = "true";
    const stub = createSupabaseStub({});

    await requestMessageSummary(stub.client, OWNER, "msg-1");

    const enqueued = stub.opsFor("jobs");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].values).toMatchObject({
      type: "ai_summarize",
      payload: { entityType: "message", entityId: "msg-1", ownerId: OWNER },
      owner_id: OWNER,
    });
  });

  it("swallows an enqueue failure so ingest can never be stalled by it", async () => {
    process.env.FEATURE_AI_SUMMARIES = "true";
    const exploding = {
      from() {
        throw new Error("queue unavailable");
      },
    } as unknown as Parameters<typeof requestMessageSummary>[0];

    await expect(requestMessageSummary(exploding, OWNER, "msg-1")).resolves.toBeUndefined();
  });
});

describe("accounting", () => {
  it("reserves budget, audits the call, and reconciles — all through the gateway", async () => {
    const stub = setup(messageRow());
    await summarizeMessage(stub.client, gatewayFor(stub, new StubProvider([completion()])), "msg-1", {
      ownerId: OWNER,
      actor: "user",
    });

    expect(stub.rpcCalls.map((call) => call.name)).toEqual(["ai_reserve_budget", "ai_commit_budget"]);

    const audit = stub.operations.find((operation) => operation.table === "ai_audit_log");
    expect(audit?.values).toMatchObject({
      action: "summarize",
      actor: "user",
      entity_type: "message",
      entity_id: "msg-1",
      ai_prompt_version: "1.0.0",
      outcome: "success",
      owner_id: OWNER,
    });
  });
});
