import { describe, it, expect } from "vitest";
import { computeBackoffMs } from "@/lib/jobs/runner";

describe("jobs/runner computeBackoffMs", () => {
  const noJitter = { jitter: 0 } as const;

  it("grows exponentially from the base (jitter off)", () => {
    expect(computeBackoffMs(1, noJitter)).toBe(30_000);
    expect(computeBackoffMs(2, noJitter)).toBe(60_000);
    expect(computeBackoffMs(3, noJitter)).toBe(120_000);
    expect(computeBackoffMs(4, noJitter)).toBe(240_000);
  });

  it("caps at capMs for large attempt counts", () => {
    expect(computeBackoffMs(50, noJitter)).toBe(3_600_000);
  });

  it("keeps jittered values within the +/- jitter band", () => {
    for (let i = 0; i < 200; i += 1) {
      const v = computeBackoffMs(2, { jitter: 0.2 }); // base 60_000, ±20%
      expect(v).toBeGreaterThanOrEqual(48_000);
      expect(v).toBeLessThanOrEqual(72_000);
    }
  });

  it("never returns a negative delay", () => {
    expect(computeBackoffMs(0, noJitter)).toBeGreaterThanOrEqual(0);
  });
});
