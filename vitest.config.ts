import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Absolute repo root without a trailing slash, so `@/lib/x` -> `<root>/lib/x`.
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");

export default defineConfig({
  // tsconfig sets `jsx: "preserve"` because Next does its own transform. Vitest
  // has no such step, so it needs the automatic runtime named explicitly —
  // otherwise every component suite fails with "React is not defined".
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws when imported outside the Next.js server build;
      // stub it so server-only logic modules are unit-testable in Node.
      "server-only": `${root}/test/stubs/server-only.ts`,
    },
  },
  test: {
    // Node stays the default: every logic suite runs there, and a DOM would be
    // dead weight for 58 files that never touch one.
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // Only component suites pay for jsdom. Keyed on the extension rather than a
    // directory so a new .tsx suite gets the right environment without anyone
    // remembering to add it here.
    environmentMatchGlobs: [["test/**/*.test.tsx", "jsdom"]],
    setupFiles: ["test/setup/dom.ts"],
  },
});
