import { describe, expect, it } from "vitest";
import { isExpectedAiError, sharedSentryOptions } from "@/lib/observability/sentryOptions";
import {
  AiBudgetExceededError,
  AiDisabledError,
  AiInvalidOutputError,
  AiPermanentError,
  AiRateLimitedError,
  AiTransientError,
  AiUnconfiguredError,
} from "@/lib/ai/errors";

/**
 * Sentry noise filter (Phase 6 · Sprint 1).
 *
 * This predicate decides which errors never reach the dashboard. Both failure
 * directions are silent and expensive: filtering too much hides real defects,
 * filtering too little buries them under deliberate control flow. It matches on
 * string codes, so it can drift from the taxonomy without anything complaining.
 */

describe("isExpectedAiError", () => {
  it("drops the outcomes the operator already sees in the UI", () => {
    expect(isExpectedAiError(new AiBudgetExceededError())).toBe(true);
    expect(isExpectedAiError(new AiRateLimitedError(5))).toBe(true);
    expect(isExpectedAiError(new AiDisabledError())).toBe(true);
    expect(isExpectedAiError(new AiUnconfiguredError())).toBe(true);
  });

  it("REPORTS genuine failures — these are the reason Sentry is here at all", () => {
    expect(isExpectedAiError(new AiPermanentError("provider rejected the request"))).toBe(false);
    expect(isExpectedAiError(new AiTransientError("provider unavailable"))).toBe(false);
    expect(isExpectedAiError(new AiInvalidOutputError("schema validation failed"))).toBe(false);
    expect(isExpectedAiError(new Error("TypeError: cannot read property of undefined"))).toBe(false);
  });

  it("does not throw on the non-Error values a beforeSend hint can carry", () => {
    // `hint.originalException` is `unknown` — a throw here would break reporting
    // for every error, which is a worse outage than the one being reported.
    for (const value of [undefined, null, "a string", 42, {}, { code: 7 }]) {
      expect(isExpectedAiError(value)).toBe(false);
    }
  });
});

describe("sharedSentryOptions", () => {
  it("never sends PII — this product's request bodies are résumés", () => {
    expect(sharedSentryOptions.sendDefaultPii).toBe(false);
  });

  it("ships inert: no DSN configured means disabled, not half-on", () => {
    // The dark-launch shape the feature flags use. With no DSN set, `enabled`
    // must be false rather than the SDK attempting and failing to transmit.
    expect(sharedSentryOptions.enabled).toBe(sharedSentryOptions.dsn.length > 0);
  });
});
