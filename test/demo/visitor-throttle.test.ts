import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSupabaseStub } from "@/test/stubs/supabase";
import {
  hashVisitor,
  checkVisitorThrottle,
  recordVisitorUsage,
} from "@/lib/demo/visitorThrottle";
import { DEMO_VISITOR_LIMIT, DEMO_VISITOR_WINDOW_MINUTES } from "@/lib/demo/config";

/**
 * Guards the per-visitor throttle.
 *
 * Three properties carry real weight here. The hash must never be reversible to
 * an address, the limiter must deny rather than allow when it cannot see its own
 * meter, and expiry must release a visitor without anything having to run. The
 * rest is arithmetic.
 */

const IP = "203.0.113.7"; // TEST-NET-3, reserved for documentation
const SALT = "test-salt";

let savedSalt: string | undefined;

beforeEach(() => {
  savedSalt = process.env.DEMO_IP_SALT;
  process.env.DEMO_IP_SALT = SALT;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  if (savedSalt === undefined) delete process.env.DEMO_IP_SALT;
  else process.env.DEMO_IP_SALT = savedSalt;
  vi.restoreAllMocks();
});

describe("hashVisitor", () => {
  it("is deterministic: identical addresses hash identically", () => {
    expect(hashVisitor(IP, SALT)).toBe(hashVisitor(IP, SALT));
  });

  it("separates different addresses", () => {
    expect(hashVisitor(IP, SALT)).not.toBe(hashVisitor("203.0.113.8", SALT));
  });

  it("produces a different digest under a different salt", () => {
    // Rotating DEMO_IP_SALT must invalidate every stored hash, otherwise the
    // rotation is cosmetic.
    expect(hashVisitor(IP, SALT)).not.toBe(hashVisitor(IP, "another-salt"));
  });

  it("never contains the address it was derived from", () => {
    const digest = hashVisitor(IP, SALT);
    expect(digest).not.toContain(IP);
    expect(digest).not.toContain("203");
    expect(digest).toMatch(/^[a-f0-9]{64}$/); // sha-256 hex, fixed width
  });

  it("handles IPv6 and proxied forms without special-casing", () => {
    for (const address of ["2001:db8::1", "::1", "203.0.113.7, 198.51.100.2"]) {
      expect(hashVisitor(address, SALT)).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

describe("checkVisitorThrottle — allowance", () => {
  it("allows a visitor below the limit", async () => {
    const stub = createSupabaseStub({ count: { demo_usage: DEMO_VISITOR_LIMIT - 1 } });
    const state = await checkVisitorThrottle(stub.client, IP);

    expect(state.limited).toBe(false);
    expect(state.used).toBe(DEMO_VISITOR_LIMIT - 1);
    expect(state.limit).toBe(DEMO_VISITOR_LIMIT);
    expect(state.windowMinutes).toBe(DEMO_VISITOR_WINDOW_MINUTES);
    expect(state.reason).toBeNull();
  });

  it("allows the very first request", async () => {
    const stub = createSupabaseStub({ count: { demo_usage: 0 } });
    expect((await checkVisitorThrottle(stub.client, IP)).limited).toBe(false);
  });

  it("blocks once the limit is reached", async () => {
    const stub = createSupabaseStub({ count: { demo_usage: DEMO_VISITOR_LIMIT } });
    const state = await checkVisitorThrottle(stub.client, IP);

    expect(state.limited).toBe(true);
    expect(state.reason).toBe("count");
  });

  it("stays blocked beyond the limit", async () => {
    const stub = createSupabaseStub({ count: { demo_usage: DEMO_VISITOR_LIMIT + 50 } });
    expect((await checkVisitorThrottle(stub.client, IP)).limited).toBe(true);
  });
});

describe("checkVisitorThrottle — the query it issues", () => {
  it("counts only this visitor's rows, only inside the window", async () => {
    const stub = createSupabaseStub({ count: { demo_usage: 0 } });
    const before = Date.now();
    await checkVisitorThrottle(stub.client, IP);

    const [op] = stub.opsFor("demo_usage");
    expect(op.type).toBe("select");
    expect(op.countOnly, "must be a COUNT, never a row fetch").toBe(true);

    // Scoped to this visitor by hash — never by address.
    expect(stub.hasFilter(op, "eq", "visitor_hash", hashVisitor(IP, SALT))).toBe(true);
    expect(op.filters.some((f) => String(f.value).includes(IP))).toBe(false);

    // Bounded by the window: this is what makes expiry automatic.
    const gte = op.filters.find((f) => f.op === "gte" && f.column === "created_at");
    expect(gte, "an unbounded count would never release a visitor").toBeDefined();

    const cutoff = new Date(String(gte!.value)).getTime();
    const expected = before - DEMO_VISITOR_WINDOW_MINUTES * 60 * 1000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(5_000);
  });

  it("releases a visitor by expiry with no sweep required", async () => {
    // The same visitor whose rows have all aged out counts zero, because the
    // count is bounded by time rather than by what has been deleted.
    const stub = createSupabaseStub({ count: { demo_usage: 0 } });
    const state = await checkVisitorThrottle(stub.client, IP);

    expect(state.limited).toBe(false);
    expect(state.used).toBe(0);
    const [op] = stub.opsFor("demo_usage");
    expect(op.filters.some((f) => f.op === "gte" && f.column === "created_at")).toBe(true);
  });
});

describe("checkVisitorThrottle — fails closed", () => {
  it("denies when the count query fails", async () => {
    const stub = createSupabaseStub({
      error: { demo_usage: { message: "connection terminated", code: "57P01" } },
    });
    const state = await checkVisitorThrottle(stub.client, IP);

    // The opposite of lib/ai/rateLimit.ts, deliberately: nothing sits underneath
    // this tier to catch what it lets through.
    expect(state.limited).toBe(true);
    expect(state.reason).toBe("unavailable");
  });

  it("denies when the salt is unconfigured", async () => {
    delete process.env.DEMO_IP_SALT;
    const stub = createSupabaseStub({ count: { demo_usage: 0 } });
    const state = await checkVisitorThrottle(stub.client, IP);

    expect(state.limited).toBe(true);
    expect(state.reason).toBe("unconfigured");
    expect(stub.opsFor("demo_usage"), "must not query with no salt").toHaveLength(0);
  });

  it("denies when the visitor cannot be identified", async () => {
    const stub = createSupabaseStub({ count: { demo_usage: 0 } });
    for (const address of [null, undefined, ""]) {
      const state = await checkVisitorThrottle(stub.client, address);
      expect(state.limited).toBe(true);
      expect(state.reason).toBe("unidentified");
    }
    expect(stub.opsFor("demo_usage")).toHaveLength(0);
  });
});

describe("recordVisitorUsage", () => {
  it("writes the hash and nothing resembling an address", async () => {
    const stub = createSupabaseStub();
    await recordVisitorUsage(stub.client, IP);

    const insert = stub.opsFor("demo_usage").find((o) => o.type === "insert");
    expect(insert).toBeDefined();
    expect(insert!.values).toEqual({ visitor_hash: hashVisitor(IP, SALT) });
    expect(JSON.stringify(insert!.values)).not.toContain(IP);
  });

  it("sweeps rows older than the window", async () => {
    const stub = createSupabaseStub();
    await recordVisitorUsage(stub.client, IP);

    const del = stub.opsFor("demo_usage").find((o) => o.type === "delete");
    expect(del, "unswept rows would grow without bound").toBeDefined();
    expect(del!.filters.some((f) => f.op === "lt" && f.column === "created_at")).toBe(true);
  });

  it("never throws when the ledger write fails", async () => {
    const stub = createSupabaseStub({
      error: { demo_usage: { message: "disk full", code: "53100" } },
    });
    // An analysis the visitor already waited for must not fail because the
    // meter could not be updated.
    await expect(recordVisitorUsage(stub.client, IP)).resolves.toBeUndefined();
  });

  it("records nothing when unidentified or unconfigured", async () => {
    const noIp = createSupabaseStub();
    await recordVisitorUsage(noIp.client, null);
    expect(noIp.opsFor("demo_usage")).toHaveLength(0);

    delete process.env.DEMO_IP_SALT;
    const noSalt = createSupabaseStub();
    await recordVisitorUsage(noSalt.client, IP);
    expect(noSalt.opsFor("demo_usage")).toHaveLength(0);
  });
});

describe("check and record agree on identity", () => {
  it("meters the same visitor the check counted", async () => {
    const checkStub = createSupabaseStub({ count: { demo_usage: 0 } });
    await checkVisitorThrottle(checkStub.client, IP);
    const counted = checkStub
      .opsFor("demo_usage")[0]
      .filters.find((f) => f.column === "visitor_hash")!.value;

    const recordStub = createSupabaseStub();
    await recordVisitorUsage(recordStub.client, IP);
    const written = recordStub.opsFor("demo_usage").find((o) => o.type === "insert")!.values!
      .visitor_hash;

    // A mismatch here would meter a visitor the limiter never counts, so the
    // allowance would never be reached.
    expect(written).toBe(counted);
  });
});
