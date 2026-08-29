import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { CompanyProvider, MacroProvider } from "@/lib/research/types";

/**
 * Company and macro search layers.
 *
 * The registry is mocked so these assert the merge and failure rules rather
 * than whatever flags happen to be set in the environment running the tests.
 *
 * The invariant under test throughout: an unavailable provider is reported as
 * unavailable, never rendered as a successful search that found nothing.
 */

const { listCompanyProviders, listMacroProviders, listUnavailableOfKind } = vi.hoisted(() => ({
  listCompanyProviders: vi.fn(),
  listMacroProviders: vi.fn(),
  listUnavailableOfKind: vi.fn(() => []),
}));

vi.mock("@/lib/research/registry", () => ({
  listCompanyProviders,
  listMacroProviders,
  listUnavailableOfKind,
  listJobProviders: vi.fn(() => []),
  listNewsProviders: vi.fn(() => []),
}));

const { findCompaniesAcrossProviders, getCompanyDossier, getMacroSeries, didNotRun } = await import(
  "@/lib/research/search"
);

beforeEach(() => {
  listUnavailableOfKind.mockReturnValue([]);
  listCompanyProviders.mockReturnValue([]);
  listMacroProviders.mockReturnValue([]);
});

afterEach(() => vi.restoreAllMocks());

const COMPANY = {
  provenance: {
    provider: "sec_edgar" as const,
    externalId: "0000320193",
    sourceUrl: "https://sec.gov/x",
    retrievedAt: "2026-08-27T12:00:00.000Z",
    publishedAt: null,
  },
  name: "Apple Inc.",
  tickers: ["AAPL"],
  exchanges: ["Nasdaq"],
  sic: "3571",
  sicDescription: "Electronic Computers",
  entityType: "operating",
  stateOfIncorporation: "CA",
  website: null,
  recentFilings: [],
};

function companyProvider(over: Partial<CompanyProvider> = {}): CompanyProvider {
  return {
    kind: "company",
    id: "sec_edgar",
    displayName: "SEC EDGAR",
    configured: true,
    rateLimitPerSecond: 5,
    findCompanies: async () => [
      { provider: "sec_edgar" as const, ref: "0000320193", name: "Apple Inc.", ticker: "AAPL" },
    ],
    getCompany: async () => COMPANY,
    getFinancials: async () => [
      {
        metric: "Revenues",
        label: "Revenues",
        value: 383000000000,
        unit: "USD",
        periodStart: null,
        periodEnd: "2024-09-28T00:00:00.000Z",
        fiscalYear: 2024,
        fiscalPeriod: "FY",
        form: "10-K",
        filedAt: "2024-11-01T00:00:00.000Z",
      },
    ],
    ...over,
  };
}

describe("findCompaniesAcrossProviders", () => {
  it("reports why nothing ran when no provider is available", async () => {
    listUnavailableOfKind.mockReturnValue([
      {
        provider: "sec_edgar",
        displayName: "SEC EDGAR",
        reason: "unconfigured",
        remedy: "Set SEC_EDGAR_USER_AGENT",
      },
    ]);
    const outcome = await findCompaniesAcrossProviders("apple");
    expect(outcome.results).toEqual([]);
    expect(outcome.unavailable[0].reason).toBe("unconfigured");
    expect(didNotRun(outcome)).toBe(true);
  });

  it("distinguishes a genuine no-match from a search that never ran", async () => {
    listCompanyProviders.mockReturnValue([companyProvider({ findCompanies: async () => [] })]);
    const outcome = await findCompaniesAcrossProviders("zzz");
    expect(outcome.results).toEqual([]);
    expect(didNotRun(outcome)).toBe(false);
    expect(outcome.succeeded).toEqual(["sec_edgar"]);
  });

  it("returns candidates and names the answering provider", async () => {
    listCompanyProviders.mockReturnValue([companyProvider()]);
    const outcome = await findCompaniesAcrossProviders("aapl");
    expect(outcome.results[0].name).toBe("Apple Inc.");
    expect(outcome.succeeded).toEqual(["sec_edgar"]);
  });

  it("survives a provider throwing, naming the failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listCompanyProviders.mockReturnValue([
      companyProvider({
        findCompanies: async () => {
          throw new Error("edgar down");
        },
      }),
    ]);
    const outcome = await findCompaniesAcrossProviders("apple");
    expect(outcome.results).toEqual([]);
    expect(outcome.failed).toEqual([{ provider: "sec_edgar", reason: "edgar down" }]);
    // It ran and failed — not the same as never having run.
    expect(didNotRun(outcome)).toBe(false);
    spy.mockRestore();
  });

  it("deduplicates identical (provider, ref) pairs", async () => {
    const dup = companyProvider({
      findCompanies: async () => [
        { provider: "sec_edgar" as const, ref: "0000320193", name: "Apple Inc.", ticker: "AAPL" },
        { provider: "sec_edgar" as const, ref: "0000320193", name: "Apple Inc.", ticker: "AAPL" },
      ],
    });
    listCompanyProviders.mockReturnValue([dup]);
    expect((await findCompaniesAcrossProviders("apple")).results).toHaveLength(1);
  });
});

describe("getCompanyDossier", () => {
  it("returns the profile with the financials that back it", async () => {
    listCompanyProviders.mockReturnValue([companyProvider()]);
    const { dossier } = await getCompanyDossier("sec_edgar", "0000320193");
    expect(dossier?.company.name).toBe("Apple Inc.");
    expect(dossier?.financials).toHaveLength(1);
    // Every figure must carry the filing that reported it.
    expect(dossier?.financials[0].form).toBe("10-K");
  });

  it("still returns the profile when financials fail", async () => {
    // A filings list is useful even when XBRL hiccups.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listCompanyProviders.mockReturnValue([
      companyProvider({
        getFinancials: async () => {
          throw new Error("xbrl down");
        },
      }),
    ]);
    const { dossier } = await getCompanyDossier("sec_edgar", "0000320193");
    expect(dossier?.company.name).toBe("Apple Inc.");
    expect(dossier?.financials).toEqual([]);
    spy.mockRestore();
  });

  it("returns null with the reason when the provider is unavailable", async () => {
    listUnavailableOfKind.mockReturnValue([
      { provider: "sec_edgar", displayName: "SEC EDGAR", reason: "disabled", remedy: "Set FEATURE_RESEARCH_COMPANY=true" },
    ]);
    const { dossier, unavailable } = await getCompanyDossier("sec_edgar", "0000320193");
    expect(dossier).toBeNull();
    expect(unavailable[0].reason).toBe("disabled");
  });

  it("returns null for an unknown company without throwing", async () => {
    listCompanyProviders.mockReturnValue([companyProvider({ getCompany: async () => null })]);
    expect((await getCompanyDossier("sec_edgar", "0000000001")).dossier).toBeNull();
  });
});

describe("getMacroSeries", () => {
  function macroProvider(over: Partial<MacroProvider> = {}): MacroProvider {
    return {
      kind: "macro",
      id: "fred",
      displayName: "FRED",
      configured: true,
      rateLimitPerSecond: 2,
      getSeries: async (seriesId) => ({
        provenance: {
          provider: "fred" as const,
          externalId: seriesId,
          sourceUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
          retrievedAt: "2026-08-27T12:00:00.000Z",
          publishedAt: "2026-06-01T00:00:00.000Z",
        },
        seriesId,
        title: "Consumer Price Index",
        units: "Index",
        frequency: "Monthly",
        observations: [
          { date: "2026-06-01T00:00:00.000Z", value: 315.2 },
          { date: "2026-05-01T00:00:00.000Z", value: null },
        ],
      }),
      ...over,
    };
  }

  it("returns a series with provenance and preserves unreported periods", async () => {
    listMacroProviders.mockReturnValue([macroProvider()]);
    const { series } = await getMacroSeries("CPIAUCSL");
    expect(series?.title).toBe("Consumer Price Index");
    // A missing period must stay null, never become 0.
    expect(series?.observations[1].value).toBeNull();
  });

  it("reports unavailability instead of an empty series", async () => {
    listUnavailableOfKind.mockReturnValue([
      { provider: "fred", displayName: "FRED", reason: "unconfigured", remedy: "Set FRED_API_KEY" },
    ]);
    const { series, unavailable } = await getMacroSeries("CPIAUCSL");
    expect(series).toBeNull();
    expect(unavailable[0].remedy).toBe("Set FRED_API_KEY");
  });

  it("names the failure when the provider throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listMacroProviders.mockReturnValue([
      macroProvider({
        getSeries: async () => {
          throw new Error("fred down");
        },
      }),
    ]);
    const { series, failed } = await getMacroSeries("CPIAUCSL");
    expect(series).toBeNull();
    expect(failed).toEqual([{ provider: "fred", reason: "fred down" }]);
    spy.mockRestore();
  });

  it("does not fan out — one series id belongs to one provider", async () => {
    const a = macroProvider();
    const b = macroProvider({ id: "fred", getSeries: vi.fn() });
    listMacroProviders.mockReturnValue([a, b]);
    await getMacroSeries("GDP");
    expect(b.getSeries).not.toHaveBeenCalled();
  });
});
