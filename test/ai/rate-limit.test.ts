import { describe, expect, it, vi } from "vitest";
import { checkAiRateLimit } from "@/lib/ai/rateLimit";
import { AiRateLimitedError, aiErrorCode } from "@/lib/ai/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI rate limiting (Phase 6 · Sprint 1).
 *
 * The daily token budget bounds spend but not rate — a held Enter key can
 * exhaust a day's ceiling in under a minute, and every one of those calls is
 * billed before the ceiling notices. This bounds the burst.
 */

/** A Supabase stand-in whose count query resolves to whatever the test wants. */
function clientReturning(result: { count: number | null; error: { message: string } | null }) {
  const gte = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ gte }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq, gte };
}

describe("checkAiRateLimit", () => {
  it("allows an owner well under the ceiling", async () => {
    const { client } = clientReturning({ count: 4, error: null });
    const state = await checkAiRateLimit(client, "owner-1");
    expect(state.limited).toBe(false);
    expect(state.used).toBe(4);
  });

  it("allows an owner exactly one call below the ceiling", async () => {
    const { client } = clientReturning({ count: 19, error: null });
    expect((await checkAiRateLimit(client, "owner-1")).limited).toBe(false);
  });

  it("refuses at the ceiling", async () => {
    const { client } = clientReturning({ count: 20, error: null });
    expect((await checkAiRateLimit(client, "owner-1")).limited).toBe(true);
  });

  it("refuses above the ceiling", async () => {
    const { client } = clientReturning({ count: 500, error: null });
    expect((await checkAiRateLimit(client, "owner-1")).limited).toBe(true);
  });

  it("leaves room for a full analysis plus follow-up generators", async () => {
    // One analysis is four calls. The ceiling must not refuse an operator who
    // then asks for a rewrite, a cover letter and interview questions.
    const { client } = clientReturning({ count: 0, error: null });
    const state = await checkAiRateLimit(client, "owner-1");
    expect(state.limit).toBeGreaterThanOrEqual(4 + 3);
  });

  it("counts only this owner, inside the window, against the audit log", async () => {
    const { client, from, eq, gte } = clientReturning({ count: 1, error: null });
    await checkAiRateLimit(client, "owner-42");
    expect(from).toHaveBeenCalledWith("ai_audit_log");
    expect(eq).toHaveBeenCalledWith("owner_id", "owner-42");
    // A timestamp in the recent past, not an absolute-day boundary.
    const since = Date.parse(gte.mock.calls[0][1] as string);
    expect(Date.now() - since).toBeGreaterThan(0);
    expect(Date.now() - since).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it("fails OPEN when the count query errors", async () => {
    // Opposite of the budget, which fails closed. Refusing every AI call
    // because a count failed would turn a degraded database into a total
    // outage for a feature that still has a spend ceiling underneath it.
    const { client } = clientReturning({ count: null, error: { message: "db down" } });
    expect((await checkAiRateLimit(client, "owner-1")).limited).toBe(false);
  });

  it("treats a null count as zero rather than throwing", async () => {
    const { client } = clientReturning({ count: null, error: null });
    const state = await checkAiRateLimit(client, "owner-1");
    expect(state.limited).toBe(false);
    expect(state.used).toBe(0);
  });
});

describe("AiRateLimitedError", () => {
  it("is non-retryable — an immediate retry is the behaviour being refused", () => {
    expect(new AiRateLimitedError(5).retryable).toBe(false);
  });

  it("carries its own audit code, distinct from a budget stop", () => {
    expect(aiErrorCode(new AiRateLimitedError(5))).toBe("rate_limited");
  });

  it("tells the operator it clears on its own, with a unit", () => {
    expect(new AiRateLimitedError(5).message).toContain("5 minutes");
  });
});
