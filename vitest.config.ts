import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Absolute repo root without a trailing slash, so `@/lib/x` -> `<root>/lib/x`.
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws when imported outside the Next.js server build;
      // stub it so server-only logic modules are unit-testable in Node.
      "server-only": `${root}/test/stubs/server-only.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
