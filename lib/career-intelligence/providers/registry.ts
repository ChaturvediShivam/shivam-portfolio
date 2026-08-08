/**
 * Career Intelligence — provider registry.
 *
 * The composition root. Providers register themselves here at startup; the
 * ingestion pipeline resolves them by id or by capability and never imports a
 * provider module directly. That is the whole point: adding Naukri in Phase 3
 * touches this registry's inputs, not its consumers.
 *
 * Phase 1 registers nothing — there are no implementations yet, and the empty
 * registry is the correct, queryable answer to "what can we import from?".
 */

import {
  isPullProvider,
  isPushProvider,
  type AnyImportProvider,
  type ProviderId,
  type PullProvider,
  type PushProvider,
} from "./types";

const providers = new Map<ProviderId, AnyImportProvider>();

/**
 * Register a provider implementation.
 *
 * @throws if `id` is already registered — a duplicate registration is a wiring
 * bug (two modules claiming one provider), and silently keeping the last one
 * would make ingestion depend on import order.
 */
export function registerProvider(provider: AnyImportProvider): void {
  if (providers.has(provider.id)) {
    throw new Error(`Import provider "${provider.id}" is already registered`);
  }
  providers.set(provider.id, provider);
}

export function getProvider(id: ProviderId): AnyImportProvider | undefined {
  return providers.get(id);
}

export function listProviders(): readonly AnyImportProvider[] {
  return [...providers.values()];
}

/** Providers the scheduler can poll on a timer. */
export function listPullProviders(): readonly PullProvider[] {
  return listProviders().filter(isPullProvider);
}

/** Providers that deliver to an inbound endpoint (extension, webhooks). */
export function listPushProviders(): readonly PushProvider[] {
  return listProviders().filter(isPushProvider);
}

export function isProviderRegistered(id: ProviderId): boolean {
  return providers.has(id);
}

/** Test seam: drop all registrations. Not used by application code. */
export function resetProviderRegistry(): void {
  providers.clear();
}
