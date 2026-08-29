import "server-only";
import { featureEnabled, type FeatureFlag } from "@/lib/featureFlags";
import { adzunaProvider } from "@/lib/research/providers/adzuna";
import { aiDevJobsProvider } from "@/lib/research/providers/ai-dev-jobs";
import { aiJobsCoProvider } from "@/lib/research/providers/ai-jobs-co";
import { fredProvider } from "@/lib/research/providers/fred";
import { gnewsProvider } from "@/lib/research/providers/gnews";
import { noozraProvider } from "@/lib/research/providers/noozra";
import { openAlexProvider } from "@/lib/research/providers/openalex";
import { secEdgarProvider } from "@/lib/research/providers/sec-edgar";
import { usaJobsProvider } from "@/lib/research/providers/usajobs";
import type {
  AnyResearchProvider,
  CompanyProvider,
  JobProvider,
  MacroProvider,
  NewsProvider,
  PeopleProvider,
  ProviderUnavailable,
  ScholarlyProvider,
  ResearchProviderId,
} from "@/lib/research/types";

/**
 * Research provider registry.
 *
 * The composition root, mirroring `lib/career-intelligence/providers/registry.ts`:
 * callers resolve providers by CAPABILITY, never by importing an adapter.
 *
 * A provider must pass two INDEPENDENT gates to be used:
 *
 *   1. Its feature flag        — the operator's switch. Defaults OFF.
 *   2. `provider.configured`   — does it have the credential it needs?
 *
 * They are kept separate, and both are reported, because "turned off",
 * "missing its key" and "ran and found nothing" are three different answers.
 * Collapsing them into an empty result set is what the standing instruction
 * forbids: the application must never silently convert "not configured" into
 * "zero results".
 */

/** Which credential each gated provider needs, for the operator-facing remedy. */
const REQUIRED_ENV: Partial<Record<ResearchProviderId, string>> = {
  sec_edgar: "SEC_EDGAR_USER_AGENT",
  adzuna: "ADZUNA_APP_ID + ADZUNA_APP_KEY",
  usajobs: "USAJOBS_API_KEY + USAJOBS_USER_AGENT",
  fred: "FRED_API_KEY",
  gnews: "GNEWS_API_KEY",
};

/** Each provider's flag. A provider with no entry is unreachable by design. */
const PROVIDER_FLAGS: Record<ResearchProviderId, FeatureFlag> = {
  aidevboard: "FEATURE_AIDEVBOARD",
  ai_jobs_co: "FEATURE_RESEARCH_JOBS",
  adzuna: "FEATURE_RESEARCH_JOBS",
  usajobs: "FEATURE_RESEARCH_JOBS",
  sec_edgar: "FEATURE_RESEARCH_COMPANY",
  fred: "FEATURE_RESEARCH_MACRO",
  noozra: "FEATURE_RESEARCH_NEWS",
  gnews: "FEATURE_RESEARCH_NEWS",
  openalex: "FEATURE_RESEARCH_SCHOLARLY",
};

const ALL: readonly AnyResearchProvider[] = [
  aiDevJobsProvider,
  aiJobsCoProvider,
  adzunaProvider,
  usaJobsProvider,
  secEdgarProvider,
  fredProvider,
  noozraProvider,
  gnewsProvider,
  openAlexProvider,
];

/**
 * Read `configured` without letting a getter throw.
 *
 * The getters read `process.env`; a status probe must never be able to fail the
 * page that is trying to explain why a provider is unavailable.
 */
function isConfigured(provider: AnyResearchProvider): boolean {
  try {
    return provider.configured;
  } catch {
    return false;
  }
}

export function isProviderAvailable(provider: AnyResearchProvider): boolean {
  const flag = PROVIDER_FLAGS[provider.id];
  if (!flag || !featureEnabled(flag)) return false;
  return isConfigured(provider);
}

/** Why this provider cannot be used, or null when it can. */
export function unavailabilityOf(provider: AnyResearchProvider): ProviderUnavailable | null {
  const flag = PROVIDER_FLAGS[provider.id];
  if (!featureEnabled(flag)) {
    return {
      provider: provider.id,
      displayName: provider.displayName,
      reason: "disabled",
      remedy: `Set ${flag}=true`,
    };
  }
  if (!isConfigured(provider)) {
    return {
      provider: provider.id,
      displayName: provider.displayName,
      reason: "unconfigured",
      remedy: `Set ${REQUIRED_ENV[provider.id] ?? "the provider credentials"}`,
    };
  }
  return null;
}

export interface ProviderStatus {
  id: ResearchProviderId;
  displayName: string;
  kind: AnyResearchProvider["kind"];
  flag: FeatureFlag;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  /** Null when no credential is needed. */
  requiredEnv: string | null;
}

/**
 * Every registered provider with its current availability.
 *
 * The diagnostic surface: it answers "why did this return nothing?" without
 * anyone reading env vars, which is the question an operator actually asks.
 */
export function listProviderStatus(): ProviderStatus[] {
  return ALL.map((provider) => {
    const flag = PROVIDER_FLAGS[provider.id];
    const enabled = featureEnabled(flag);
    const configured = isConfigured(provider);
    return {
      id: provider.id,
      displayName: provider.displayName,
      kind: provider.kind,
      flag,
      enabled,
      configured,
      available: enabled && configured,
      requiredEnv: REQUIRED_ENV[provider.id] ?? null,
    };
  });
}

function ofKind<T extends AnyResearchProvider>(kind: T["kind"]): T[] {
  return ALL.filter((provider) => provider.kind === kind) as T[];
}

function availableOfKind<T extends AnyResearchProvider>(kind: T["kind"]): T[] {
  return ofKind<T>(kind).filter(isProviderAvailable);
}

/** Providers of a kind that CANNOT run, and why. Rendered, never swallowed. */
export function listUnavailableOfKind(
  kind: AnyResearchProvider["kind"],
): ProviderUnavailable[] {
  return ofKind(kind)
    .map(unavailabilityOf)
    .filter((entry): entry is ProviderUnavailable => entry !== null);
}

export function listJobProviders(): JobProvider[] {
  return availableOfKind<JobProvider>("job");
}

export function listCompanyProviders(): CompanyProvider[] {
  return availableOfKind<CompanyProvider>("company");
}

export function listNewsProviders(): NewsProvider[] {
  return availableOfKind<NewsProvider>("news");
}

export function listMacroProviders(): MacroProvider[] {
  return availableOfKind<MacroProvider>("macro");
}

/** Scholarly-research providers. OpenAlex needs no credential, only its flag. */
export function listScholarlyProviders(): ScholarlyProvider[] {
  return availableOfKind<ScholarlyProvider>("scholarly");
}

/**
 * People providers. Always empty in this phase.
 *
 * The seam exists so the orchestrator can already ask the question. Every
 * candidate provider (HeroHunt, Village, Tomba) is paid with no free tier and
 * no published response contract we have been able to observe, and LinkedIn
 * scraping is out of scope — so no adapter is shipped rather than one written
 * against a guessed shape. A caller that handles an empty list today needs no
 * change when the first adapter lands.
 */
export function listPeopleProviders(): PeopleProvider[] {
  return availableOfKind<PeopleProvider>("people");
}

/** Resolve one provider by id, regardless of availability. For diagnostics. */
export function getProvider(id: ResearchProviderId): AnyResearchProvider | undefined {
  return ALL.find((provider) => provider.id === id);
}
