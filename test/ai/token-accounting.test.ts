import { describe, expect, it } from "vitest";
import { toUsage } from "@/lib/ai/providers/anthropic/mapper";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic/provider";
import type { AiUsage } from "@/types/ai";

/**
 * Token accounting (regression suite).
 *
 * Every request this gateway sends carries `cache_control` on the system block,
 * so the vendor reports the system prefix under `cache_creation_input_tokens`
 * and NOT under `input_tokens` whenever that prefix changes. Dropping that field
 * made the audit log, the cost estimate and the daily budget all under-count by
 * the size of the prefix — silently, because the numbers still looked plausible.
 *
 * The symptom that exposed it: four rewrite calls with demonstrably different
 * system prompts all reported exactly 1,658 input tokens.
 */

const provider = new AnthropicProvider("sk-test-not-a-real-key");

function usage(partial: Partial<AiUsage>): AiUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    ...partial,
  };
}

describe("toUsage — vendor usage mapping", () => {
  it("reads cache_creation_input_tokens", () => {
    expect(
      toUsage({
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 40,
      }).cacheCreationInputTokens,
    ).toBe(40);
  });

  it("keeps the three input figures disjoint", () => {
    // They are priced differently, so summing them at the source would make the
    // correct cost impossible to compute downstream.
    const mapped = toUsage({
      input_tokens: 10,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 40,
    });
    expect(mapped.inputTokens).toBe(10);
    expect(mapped.cachedInputTokens).toBe(3);
    expect(mapped.cacheCreationInputTokens).toBe(40);
  });

  it("defaults cache creation to zero when the provider omits it", () => {
    expect(toUsage({ input_tokens: 1 }).cacheCreationInputTokens).toBe(0);
    expect(toUsage(null).cacheCreationInputTokens).toBe(0);
  });
});

describe("estimateCostMicros — rate per input class", () => {
  // claude-sonnet-5 is $3/MTok input, $15/MTok output. USD-per-MTok equals
  // micro-USD-per-token, which is why these multiply directly.
  const model = "claude-sonnet-5";

  it("charges uncached input at the base rate", () => {
    expect(provider.estimateCostMicros(model, usage({ inputTokens: 1000 }))).toBe(3000);
  });

  it("charges cache reads at a tenth of base", () => {
    expect(provider.estimateCostMicros(model, usage({ cachedInputTokens: 1000 }))).toBe(300);
  });

  it("charges cache writes above base, not at it", () => {
    // 1000 * 3 * 1.25. Billing these at 1.0x — or at 0, as before the fix —
    // under-reports every call whose system prefix changed.
    expect(provider.estimateCostMicros(model, usage({ cacheCreationInputTokens: 1000 }))).toBe(3750);
  });

  it("cache writes are no longer free", () => {
    const before = provider.estimateCostMicros(model, usage({ inputTokens: 1000 }));
    const after = provider.estimateCostMicros(
      model,
      usage({ inputTokens: 1000, cacheCreationInputTokens: 1000 }),
    );
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBe(3750);
  });

  it("sums all four classes", () => {
    expect(
      provider.estimateCostMicros(
        model,
        usage({
          inputTokens: 1000,
          outputTokens: 1000,
          cachedInputTokens: 1000,
          cacheCreationInputTokens: 1000,
        }),
      ),
    ).toBe(3000 + 15000 + 300 + 3750);
  });

  it("an unknown model over-estimates rather than under-charging", () => {
    expect(
      provider.estimateCostMicros("not-a-model", usage({ cacheCreationInputTokens: 1000 })),
    ).toBeGreaterThan(provider.estimateCostMicros(model, usage({ cacheCreationInputTokens: 1000 })));
  });
});
