import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderNotice, ResearchEmpty } from "@/components/admin/research/ProviderNotice";

/**
 * The UI half of the "not configured is not zero results" rule.
 *
 * The contract enforces the distinction in `SearchOutcome`; these assert the
 * screen actually renders it. A correct contract feeding an empty state that
 * says "no results" would defeat the entire design, and that failure is
 * invisible in a type check.
 */

describe("ProviderNotice", () => {
  it("renders nothing when every provider ran", () => {
    const { container } = render(<ProviderNotice unavailable={[]} failed={[]} succeeded={["noozra"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the exact variable for an unconfigured provider", () => {
    // A dead end becomes a setup step only if we say which variable to set.
    render(
      <ProviderNotice
        unavailable={[
          {
            provider: "adzuna",
            displayName: "Adzuna",
            reason: "unconfigured",
            remedy: "Set ADZUNA_APP_ID + ADZUNA_APP_KEY",
          },
        ]}
      />,
    );
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByText(/ADZUNA_APP_ID/)).toBeInTheDocument();
  });

  it("names the flag for a disabled provider, under a different heading", () => {
    render(
      <ProviderNotice
        unavailable={[
          {
            provider: "fred",
            displayName: "FRED",
            reason: "disabled",
            remedy: "Set FEATURE_RESEARCH_MACRO=true",
          },
        ]}
      />,
    );
    expect(screen.getByText("Turned off")).toBeInTheDocument();
    expect(screen.queryByText("Not configured")).not.toBeInTheDocument();
    expect(screen.getByText(/FEATURE_RESEARCH_MACRO/)).toBeInTheDocument();
  });

  it("separates disabled from unconfigured in one notice", () => {
    render(
      <ProviderNotice
        unavailable={[
          { provider: "fred", displayName: "FRED", reason: "disabled", remedy: "Set FEATURE_RESEARCH_MACRO=true" },
          { provider: "gnews", displayName: "GNews", reason: "unconfigured", remedy: "Set GNEWS_API_KEY" },
        ]}
      />,
    );
    expect(screen.getByText("Turned off")).toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("surfaces a provider failure rather than swallowing it", () => {
    render(
      <ProviderNotice unavailable={[]} failed={[{ provider: "noozra", reason: "Noozra API error (503)." }]} />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/503/)).toBeInTheDocument();
  });

  it("says which providers did answer when a result is partial", () => {
    render(
      <ProviderNotice
        unavailable={[{ provider: "gnews", displayName: "GNews", reason: "unconfigured", remedy: "Set GNEWS_API_KEY" }]}
        succeeded={["noozra"]}
      />,
    );
    expect(screen.getByText(/Answered by noozra/)).toBeInTheDocument();
  });
});

describe("ResearchEmpty", () => {
  it("prompts for a query before any search", () => {
    render(<ResearchEmpty searched={false} ran={false} noun="jobs" />);
    expect(screen.getByText(/Enter a query to search jobs/)).toBeInTheDocument();
  });

  it("says nothing was searched when no provider could run", () => {
    // The failure this whole design exists to prevent: implying the market is
    // empty when in fact we never looked.
    render(<ResearchEmpty searched ran={false} noun="jobs" />);
    expect(screen.getByText(/nothing was searched/i)).toBeInTheDocument();
    expect(screen.queryByText(/No jobs matched/i)).not.toBeInTheDocument();
  });

  it("says no match only when a provider actually ran", () => {
    render(<ResearchEmpty searched ran noun="jobs" />);
    expect(screen.getByText(/No jobs matched that query/)).toBeInTheDocument();
    expect(screen.queryByText(/nothing was searched/i)).not.toBeInTheDocument();
  });
});

// --- Scholarly card field rendering ------------------------------------------

import { ResearchWorkspace } from "@/components/admin/research/ResearchWorkspace";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/app/admin/(dashboard)/research/actions", () => ({
  searchScholarlyAction: vi.fn(),
  searchJobsAction: vi.fn(),
  searchNewsAction: vi.fn(),
  findCompaniesAction: vi.fn(),
  getCompanyDossierAction: vi.fn(),
  getMacroSeriesAction: vi.fn(),
}));
const { searchScholarlyAction } = await import("@/app/admin/(dashboard)/research/actions");

/** Shape copied from a real normalized OpenAlex result. */
function work(over: Record<string, unknown> = {}) {
  return {
    provenance: {
      provider: "openalex",
      externalId: "https://openalex.org/W2991532994",
      sourceUrl: "https://doi.org/10.2139/ssrn.3482150",
      retrievedAt: "2026-08-27T12:00:00.000Z",
      publishedAt: "2019-01-01T00:00:00.000Z",
    },
    title: "The Impact of Artificial Intelligence on the Labor Market",
    authors: ["Michael A. Webb"],
    institutions: ["Stanford University"],
    venue: "SSRN Electronic Journal",
    publicationYear: 2019,
    citedByCount: 454,
    topics: ["Labor market dynamics"],
    doi: "https://doi.org/10.2139/ssrn.3482150",
    openAccessUrl: null,
    workType: "preprint",
    abstract: null,
    ...over,
  };
}

async function searchScholarly(results: unknown[]) {
  (searchScholarlyAction as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: { results, succeeded: ["openalex"], failed: [], unavailable: [] },
  });
  const user = userEvent.setup();
  render(<ResearchWorkspace />);
  await user.click(screen.getByRole("tab", { name: /Research/i }));
  await user.type(screen.getByPlaceholderText(/Research topic/i), "ai");
  await user.click(screen.getByRole("button", { name: /Search/i }));
  await waitFor(() => expect(screen.getByText(/Impact of Artificial Intelligence/)).toBeInTheDocument());
}

describe("scholarly card renders every verified field", () => {
  it("shows title, authors, affiliation, year, citations, journal, date, DOI and OpenAlex id", async () => {
    await searchScholarly([work({ abstract: "Recent advances in machine learning." })]);
    expect(screen.getByText("Michael A. Webb")).toBeInTheDocument();
    expect(screen.getByText("Stanford University")).toBeInTheDocument();
    expect(screen.getByText("2019")).toBeInTheDocument();
    expect(screen.getByText("454 citations")).toBeInTheDocument();
    expect(screen.getByText("SSRN Electronic Journal")).toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2019")).toBeInTheDocument();
    expect(screen.getByText("10.2139/ssrn.3482150")).toBeInTheDocument();
    expect(screen.getByText("W2991532994")).toBeInTheDocument();
    expect(screen.getByText("Recent advances in machine learning.")).toBeInTheDocument();
  });

  it("renders 'Not available' for every missing field instead of hiding it", async () => {
    // A gap in the source must look like a gap, not like a field we forgot.
    await searchScholarly([
      work({
        authors: [],
        institutions: [],
        venue: null,
        publicationYear: null,
        citedByCount: null,
        doi: null,
        abstract: null,
        provenance: { ...work().provenance, publishedAt: null },
      }),
    ]);
    expect(screen.getByText("Authors not available")).toBeInTheDocument();
    expect(screen.getByText("Affiliation not available")).toBeInTheDocument();
    expect(screen.getByText("Abstract not available")).toBeInTheDocument();
    expect(screen.getByText("Year not available")).toBeInTheDocument();
    expect(screen.getByText("Citations not available")).toBeInTheDocument();
    expect(screen.getAllByText("Not available").length).toBeGreaterThanOrEqual(3);
  });

  it("never invents a value for a missing field", async () => {
    await searchScholarly([work({ citedByCount: null, publicationYear: null })]);
    expect(screen.queryByText("0 citations")).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });
});
