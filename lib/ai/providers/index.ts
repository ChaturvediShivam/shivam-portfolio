import "server-only";
import { AiUnconfiguredError } from "@/lib/ai/errors";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { AnthropicProvider } from "./anthropic/provider";

/**
 * Provider factory (Phase 3 · M6).
 *
 * The single place that maps configuration to a concrete adapter, and the last
 * file in the dependency chain that is allowed to name a vendor. Adding a
 * provider is one new directory plus one case here — the gateway, tools,
 * prompts, data layers and consumers are untouched.
 *
 * The instance is memoised per process: adapters hold an HTTP client, and
 * rebuilding one per call would discard connection reuse. Tests never touch
 * this module — the gateway takes an injected provider (see lib/ai/gateway.ts).
 */

let cached: AiProvider | null = null;

/** Resolve the configured provider, or throw if unconfigured (fail-closed). */
export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const name = (process.env.AI_PROVIDER ?? "anthropic").trim().toLowerCase();
  const apiKey = process.env.AI_PROVIDER_API_KEY ?? "";

  if (!apiKey) throw new AiUnconfiguredError();

  switch (name) {
    case "anthropic":
      cached = new AnthropicProvider(apiKey);
      return cached;
    default:
      throw new AiUnconfiguredError(`Unknown AI provider "${name}".`);
  }
}

/** True when a provider could be constructed. Used by the Settings panel. */
export function isAiProviderConfigured(): boolean {
  return Boolean(process.env.AI_PROVIDER_API_KEY);
}
