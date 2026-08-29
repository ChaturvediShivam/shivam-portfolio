import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isProviderAvailable,
  listJobProviders,
  listNewsProviders,
  listMacroProviders,
  listCompanyProviders,
  listPeopleProviders,
  listProviderStatus,
  listUnavailableOfKind,
  getProvider,
  unavailabilityOf,
} from "@/lib/research/registry";

/**
 * Provider registry.
 *
 * The invariant under test is the one the standing instruction names directly:
 * "disabled", "unconfigured" and "found nothing" must stay three distinguishable
 * answers. Everything here manipulates the environment rather than mocking, so
 * it exercises the real two-gate logic.
 */

const ENV = [
  "FEATURE_AIDEVBOARD",
  "FEATURE_RESEARCH_JOBS",
  "FEATURE_RESEARCH_COMPANY",
  "FEATURE_RESEARCH_NEWS",
  "FEATURE_RESEARCH_MACRO",
  "SEC_EDGAR_USER_AGENT",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "USAJOBS_API_KEY",
  "USAJOBS_USER_AGENT",
  "FRED_API_KEY",
  "GNEWS_API_KEY",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("two-gate availability", () => {
  it("withholds everything when all flags are off", () => {
    expect(listJobProviders()).toEqual([]);
    expect(listNewsProviders()).toEqual([]);
    expect(listCompanyProviders()).toEqual([]);
    expect(listMacroProviders()).toEqual([]);
  });

  it("reports a flag-off provider as disabled, with the flag to set", () => {
    const entry = unavailabilityOf(getProvider("noozra")!);
    expect(entry?.reason).toBe("disabled");
    expect(entry?.remedy).toBe("Set FEATURE_RESEARCH_NEWS=true");
  });

  it("reports an enabled-but-keyless provider as unconfigured, with the variable", () => {
    // The case that must never look like "found nothing".
    process.env.FEATURE_RESEARCH_JOBS = "true";
    const entry = unavailabilityOf(getProvider("adzuna")!);
    expect(entry?.reason).toBe("unconfigured");
    expect(entry?.remedy).toContain("ADZUNA_APP_ID");
  });

  it("admits a provider only when the flag is on AND credentials exist", () => {
    process.env.FEATURE_RESEARCH_JOBS = "true";
    expect(listJobProviders().map((p) => p.id)).toEqual(["ai_jobs_co"]);

    process.env.ADZUNA_APP_ID = "id";
    process.env.ADZUNA_APP_KEY = "key";
    expect(listJobProviders().map((p) => p.id).sort()).toEqual(["adzuna", "ai_jobs_co"]);
  });

  it("treats the flag as on only for the exact string 'true'", () => {
    process.env.FEATURE_RESEARCH_NEWS = "1";
    expect(listNewsProviders()).toEqual([]);
    process.env.FEATURE_RESEARCH_NEWS = "TRUE";
    expect(listNewsProviders()).toEqual([]);
    process.env.FEATURE_RESEARCH_NEWS = "true";
    expect(listNewsProviders().map((p) => p.id)).toEqual(["noozra"]);
  });

  it("keeps SEC unavailable until its contact User-Agent is set", () => {
    process.env.FEATURE_RESEARCH_COMPANY = "true";
    expect(listCompanyProviders()).toEqual([]);
    expect(listUnavailableOfKind("company")[0].reason).toBe("unconfigured");

    process.env.SEC_EDGAR_USER_AGENT = "CareerCRM/1.0 (dev@example.com)";
    expect(listCompanyProviders().map((p) => p.id)).toEqual(["sec_edgar"]);
    expect(listUnavailableOfKind("company")).toEqual([]);
  });

  it("lists every unavailable provider of a kind with a reason", () => {
    process.env.FEATURE_RESEARCH_JOBS = "true";
    const unavailable = listUnavailableOfKind("job");
    const byId = Object.fromEntries(unavailable.map((u) => [u.provider, u.reason]));
    // aidevboard is gated by its own flag, which is off.
    expect(byId.aidevboard).toBe("disabled");
    expect(byId.adzuna).toBe("unconfigured");
    expect(byId.usajobs).toBe("unconfigured");
    expect(byId.ai_jobs_co).toBeUndefined();
  });
});

describe("listProviderStatus", () => {
  it("explains every provider without throwing, whatever the environment", () => {
    const status = listProviderStatus();
    expect(status.length).toBeGreaterThanOrEqual(8);
    for (const row of status) {
      expect(typeof row.enabled).toBe("boolean");
      expect(typeof row.configured).toBe("boolean");
      expect(row.available).toBe(row.enabled && row.configured);
    }
  });

  it("names the credential a gated provider needs, and none for open ones", () => {
    const byId = Object.fromEntries(listProviderStatus().map((r) => [r.id, r]));
    expect(byId.adzuna.requiredEnv).toContain("ADZUNA_APP_ID");
    expect(byId.fred.requiredEnv).toBe("FRED_API_KEY");
    expect(byId.sec_edgar.requiredEnv).toBe("SEC_EDGAR_USER_AGENT");
    // Open providers need nothing, and must not imply otherwise.
    expect(byId.noozra.requiredEnv).toBeNull();
    expect(byId.ai_jobs_co.requiredEnv).toBeNull();
  });

  it("marks open providers configured even with no environment at all", () => {
    const byId = Object.fromEntries(listProviderStatus().map((r) => [r.id, r]));
    expect(byId.ai_jobs_co.configured).toBe(true);
    expect(byId.noozra.configured).toBe(true);
    expect(byId.aidevboard.configured).toBe(true);
  });
});

describe("people seam", () => {
  it("is present and empty — no adapter is shipped this phase", () => {
    // Every candidate provider is paid with no observable contract, and
    // LinkedIn scraping is out of scope. The seam exists so a future adapter
    // needs no caller changes.
    expect(listPeopleProviders()).toEqual([]);
    expect(listUnavailableOfKind("people")).toEqual([]);
  });
});

describe("provider identity", () => {
  it("resolves by id regardless of availability", () => {
    expect(getProvider("fred")?.kind).toBe("macro");
    expect(getProvider("sec_edgar")?.kind).toBe("company");
    expect(isProviderAvailable(getProvider("fred")!)).toBe(false);
  });

  it("has no duplicate provider ids", () => {
    const ids = listProviderStatus().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
