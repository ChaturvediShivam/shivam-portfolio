import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vendor-neutrality enforcement (Phase 3 · M6).
 *
 * The invariant: no vendor SDK type, enum, stop reason, or request/response
 * field may escape `lib/ai/providers/**`. An invariant maintained by good
 * intentions decays, so it is checked mechanically here and by the
 * `no-restricted-imports` ESLint rule.
 *
 * If this test fails, the fix is to move the vendor concept down into the
 * adapter and express it through an internal contract — not to widen the
 * allow-list.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCANNED_DIRS = ["lib", "app", "components", "types"];

/** The only place vendor vocabulary is permitted. */
const ADAPTER_PREFIX = join("lib", "ai", "providers");

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

/** Vendor identifiers and wire-format field names that must not leak upward. */
const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /@anthropic-ai\//, label: "Anthropic SDK import" },
  { pattern: /\banthropic\b/i, label: "vendor name (Anthropic)" },
  { pattern: /claude-[a-z0-9]/i, label: "vendor model id (claude-*)" },
  { pattern: /\bopenai\b/i, label: "vendor name (OpenAI)" },
  { pattern: /\bgpt-[0-9]/i, label: "vendor model id (gpt-*)" },
  { pattern: /\bgemini\b/i, label: "vendor name (Gemini)" },
  { pattern: /\bstop_reason\b/, label: "vendor response field (stop_reason)" },
  { pattern: /\bfinish_reason\b/, label: "vendor response field (finish_reason)" },
  { pattern: /\boutput_config\b/, label: "vendor request field (output_config)" },
  { pattern: /\bcache_control\b/, label: "vendor request field (cache_control)" },
  { pattern: /\btool_use\b/, label: "vendor block type (tool_use)" },
];

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, found);
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      found.push(full);
    }
  }
  return found;
}

function scannedFiles(): string[] {
  return SCANNED_DIRS.flatMap((dir) => collectSourceFiles(join(ROOT, dir)))
    .map((file) => relative(ROOT, file))
    .filter((file) => !file.startsWith(ADAPTER_PREFIX));
}

describe("vendor neutrality", () => {
  it("finds source files to scan", () => {
    expect(scannedFiles().length).toBeGreaterThan(50);
  });

  it("leaks no vendor identifier or wire-format field outside the adapter", () => {
    const violations: string[] = [];

    for (const file of scannedFiles()) {
      const contents = readFileSync(join(ROOT, file), "utf8");
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(contents)) violations.push(`${file}: ${label}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("confines the vendor SDK import to the adapter directory", () => {
    const importers = collectSourceFiles(join(ROOT, "lib"))
      .map((file) => relative(ROOT, file))
      .filter((file) => readFileSync(join(ROOT, file), "utf8").includes('from "@anthropic-ai/sdk"'));

    expect(importers.every((file) => file.startsWith(ADAPTER_PREFIX))).toBe(true);
  });
});
