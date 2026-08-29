import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { __setBackoffBaseMs, __setRateLimitDisabled, resetRateLimiter } from "@/lib/research/http";
import { adzunaProvider } from "@/lib/research/providers/adzuna";
import { gnewsProvider } from "@/lib/research/providers/gnews";
import { fredProvider } from "@/lib/research/providers/fred";
import { usaJobsProvider } from "@/lib/research/providers/usajobs";

/**
 * Research-layer security invariants.
 *
 * Two classes of leak are checked mechanically here, because both are easy to
 * reintroduce in a one-line change and neither is visible in review:
 *
 *   1. A credential reaching an error message or a log. Adzuna, FRED and GNews
 *      all take their key as a QUERY PARAMETER, so any error that echoes the
 *      request URL would put the key in a server log.
 *   2. A provider module becoming importable from the browser. Every adapter
 *      must carry `import "server-only"`, which turns a client import into a
 *      build error rather than a runtime leak.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RESEARCH_DIR = join(ROOT, "lib", "research");

const SECRET = "SUPER_SECRET_KEY_VALUE_12345";

const ENV = [
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "FRED_API_KEY",
  "GNEWS_API_KEY",
  "USAJOBS_API_KEY",
  "USAJOBS_USER_AGENT",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  resetRateLimiter();
  __setBackoffBaseMs(1);
  __setRateLimitDisabled(true);
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) process.env[k] = SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function collect(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, found);
    else if (entry.endsWith(".ts")) found.push(full);
  }
  return found;
}

describe("credentials never reach an error or a log", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["adzuna", () => adzunaProvider.searchJobs({ query: "engineer" })],
    ["gnews", () => gnewsProvider.searchNews("ai")],
    ["fred", () => fredProvider.getSeries("GDP")],
    ["usajobs", () => usaJobsProvider.searchJobs({ query: "analyst" })],
  ];

  for (const [name, call] of cases) {
    it(`${name}: a failed request reveals no key in the error`, async () => {
      // These providers put the key in the query string, so an error that
      // echoed the URL would write the credential to a server log.
      vi.stubGlobal("fetch", () =>
        Promise.resolve({ ok: false, status: 500, json: () => ({}) } as Response),
      );

      let message = "";
      let serialised = "";
      try {
        await call();
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
        serialised = `${message} ${error instanceof Error ? (error.stack ?? "") : ""}`;
      }

      expect(message).not.toBe("");
      expect(serialised).not.toContain(SECRET);
      expect(serialised).not.toMatch(/app_key|apikey=|api_key=|Authorization-Key/i);
    });

    it(`${name}: a network failure reveals no key`, async () => {
      vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
      let serialised = "";
      try {
        await call();
      } catch (error) {
        serialised = error instanceof Error ? `${error.message} ${error.stack ?? ""}` : String(error);
      }
      expect(serialised).not.toContain(SECRET);
    });
  }

  it("an unconfigured error names the VARIABLE, never a value", async () => {
    for (const k of ENV) delete process.env[k];
    try {
      await adzunaProvider.searchJobs({ query: "x" });
      throw new Error("should have refused");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("ADZUNA_APP_ID");
      expect(message).not.toContain(SECRET);
    }
  });
});

describe("server-only boundary", () => {
  it("every research module is server-only", () => {
    // A missing directive turns a client import from a build error into a
    // runtime credential leak.
    const offenders = collect(RESEARCH_DIR)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        // types.ts is pure interfaces with no runtime and no env access.
        if (relative(ROOT, file).endsWith("types.ts")) return false;
        if (relative(ROOT, file).endsWith("bridge.ts")) return false;
        return !source.includes('import "server-only"');
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("no research module reads a NEXT_PUBLIC_ variable", () => {
    // NEXT_PUBLIC_ is inlined into the browser bundle by definition.
    const offenders = collect(RESEARCH_DIR)
      .filter((file) => readFileSync(file, "utf8").includes("NEXT_PUBLIC_"))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("no research module hardcodes a credential-shaped literal", () => {
    const pattern = /(api[_-]?key|app[_-]?key|token|secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i;
    const offenders = collect(RESEARCH_DIR)
      .filter((file) => pattern.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
