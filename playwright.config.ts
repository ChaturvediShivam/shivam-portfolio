import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration for the public demo.
 *
 * WHY A PRODUCTION BUILD AND NOT `next dev`
 *
 * Four servers are needed, one per flag combination, and running four dev
 * servers against one .next directory is what produced the stale-serving
 * problem seen earlier in this project — watchers fight over the same build
 * output and one instance serves another's code. `next start` only reads .next,
 * so four instances share it safely. It is also the artefact that actually
 * ships, which is the thing worth testing.
 *
 * The build happens in the `test:e2e` script rather than here: NEXT_PUBLIC_
 * values are inlined at build time, so the Turnstile site key has to be set
 * before the compiler runs, not before the server does.
 *
 * WHY FOUR SERVERS
 *
 * Feature flags are read from the server's environment per request. Toggling
 * one mid-suite is not possible, so each combination gets its own port. This is
 * cheap: `next start` boots in about two seconds against a warm build.
 */

/** Cloudflare's documented always-passes test keys. Public by design. */
export const TURNSTILE_PASS_SECRET = "1x0000000000000000000000000000000AA";

const SHARED = {
  FEATURE_PUBLIC_DEMO: "true",
  FEATURE_AI: "true",
  FEATURE_RESUME_AI: "true",
  CLOUDFLARE_TURNSTILE_SECRET_KEY: TURNSTILE_PASS_SECRET,
};

/** Ports, named so a failing test says which configuration it was against. */
export const PORTS = {
  /** Everything on. The happy path, including a real provider call. */
  full: 3210,
  /** FEATURE_PUBLIC_DEMO off. */
  demoOff: 3211,
  /** Demo on, daily token ceiling set to 1 so the budget preflight always fails. */
  budgetSpent: 3212,
  /** Demo on, FEATURE_AI off. */
  aiOff: 3213,
} as const;

function server(port: number, env: Record<string, string>) {
  return {
    command: `npx next start -p ${port}`,
    port,
    env: { ...SHARED, ...env },
    // Never adopt a server this config did not start: a leftover instance from
    // an earlier run would be serving an earlier build.
    reuseExistingServer: false,
    timeout: 60_000,
  };
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts/results",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Serial. The demo's per-visitor limiter is real and shared state; parallel
  // workers would race each other's allowance even with distinct addresses.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  // A real provider call can take tens of seconds, and the challenge adds a
  // couple more before the button is even usable. Measured, not guessed.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: `http://localhost:${PORTS.full}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Firefox and WebKit are not included: each needs its own ~90 MB browser
    // download, which is not the "zero effort" the brief allowed for. Nothing
    // in this suite is Chromium-specific except the PDF fixture generation,
    // which is a test detail rather than a product one.
  ],

  webServer: [
    server(PORTS.full, {}),
    server(PORTS.demoOff, { FEATURE_PUBLIC_DEMO: "false" }),
    server(PORTS.budgetSpent, { AI_DEMO_DAILY_TOKEN_BUDGET: "1" }),
    server(PORTS.aiOff, { FEATURE_AI: "false" }),
  ],
});
