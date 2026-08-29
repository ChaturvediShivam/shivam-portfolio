"use client";

import { useState, useTransition } from "react";
import {
  Briefcase,
  Building2,
  Newspaper,
  LineChart,
  GraduationCap,
  ExternalLink,
  Search,
} from "lucide-react";
import { Badge, TextInput, buttonClasses } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import {
  findCompaniesAction,
  getCompanyDossierAction,
  getMacroSeriesAction,
  searchJobsAction,
  searchNewsAction,
  searchScholarlyAction,
} from "@/app/admin/(dashboard)/research/actions";
import type { CompanyDossier, SearchOutcome } from "@/lib/research/search";
import type {
  CompanyRef,
  NormalizedEconomicSeries,
  NormalizedJob,
  NormalizedNewsItem,
  NormalizedScholarlyWork,
  ProviderUnavailable,
} from "@/lib/research/types";
import { ProviderNotice, ResearchEmpty } from "./ProviderNotice";

/**
 * Research workspace.
 *
 * One surface over the four research capabilities, matching the admin CRM's
 * existing dark kit rather than introducing a second visual system.
 *
 * It holds no provider logic, no credentials and no endpoint URLs — every
 * search is a Server Action call, which is what keeps every key server-side.
 *
 * Nothing here is analyzed by a model. These are SOURCE RECORDS: what a
 * provider actually said, with its provenance attached. AI synthesis is a
 * separate, explicitly triggered step (Job Match) so facts and model output
 * never blur together on screen.
 */

type Tab = "jobs" | "companies" | "news" | "macro" | "scholarly";

const TABS: Array<{ id: Tab; label: string; icon: typeof Briefcase }> = [
  { id: "jobs", label: "Jobs", icon: Briefcase },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "news", label: "News", icon: Newspaper },
  { id: "macro", label: "Macro", icon: LineChart },
  { id: "scholarly", label: "Research", icon: GraduationCap },
];

/** Common FRED identifiers, so the operator need not memorise codes. */
const MACRO_PRESETS = [
  { id: "CPIAUCSL", label: "CPI" },
  { id: "GDP", label: "GDP" },
  { id: "UNRATE", label: "Unemployment" },
  { id: "FEDFUNDS", label: "Fed funds" },
  { id: "DGS10", label: "10Y treasury" },
];

const CARD = "rounded-lg border border-white/[0.06] bg-white/[0.02] p-4";
const LINK =
  "inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-200";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Salary is rendered only from what the provider actually supplied. */
function salaryOf(job: NormalizedJob): string | null {
  if (job.salaryMin !== null && job.salaryMax !== null) {
    return `${job.salaryMin.toLocaleString()} – ${job.salaryMax.toLocaleString()}`;
  }
  if (job.salaryMin !== null) return `From ${job.salaryMin.toLocaleString()}`;
  if (job.salaryMax !== null) return `Up to ${job.salaryMax.toLocaleString()}`;
  // The source's own wording when it is not expressible as numbers.
  return job.salaryText;
}

function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  pending,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  pending: boolean;
  children?: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-[16rem] flex-1"
        aria-label={placeholder}
      />
      {children}
      <button type="submit" disabled={pending} className={buttonClasses("primary", "sm")}>
        <Search size={14} aria-hidden="true" />
        {pending ? "Searching…" : "Search"}
      </button>
    </form>
  );
}

export function ResearchWorkspace() {
  const [tab, setTab] = useState<Tab>("jobs");

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Research type" className="flex flex-wrap gap-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
              tab === id
                ? "border-white/15 bg-white/[0.06] text-slate-100"
                : "border-white/[0.06] bg-white/[0.02] text-slate-400 hover:text-slate-200",
            )}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "jobs" ? <JobsPanel /> : null}
      {tab === "companies" ? <CompaniesPanel /> : null}
      {tab === "news" ? <NewsPanel /> : null}
      {tab === "macro" ? <MacroPanel /> : null}
      {tab === "scholarly" ? <ScholarlyPanel /> : null}
    </div>
  );
}

// --- Jobs --------------------------------------------------------------------

function JobsPanel() {
  const [query, setQuery] = useState("AI engineer");
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [outcome, setOutcome] = useState<SearchOutcome<NormalizedJob> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    start(async () => {
      const result = await searchJobsAction({ query, remoteOnly, limit: 25 });
      if (isActionError(result)) return setError(result.formError ?? "Search failed.");
      setOutcome(result.data);
    });
  }

  const ran = outcome ? outcome.succeeded.length > 0 || outcome.failed.length > 0 : false;

  return (
    <div className="space-y-4">
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={run}
        placeholder="Search jobs across providers"
        pending={pending}
      >
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            className="accent-slate-400"
          />
          Remote only
        </label>
      </SearchBar>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {outcome ? (
        <ProviderNotice
          unavailable={outcome.unavailable}
          failed={outcome.failed}
          succeeded={outcome.succeeded}
        />
      ) : null}

      {outcome && outcome.results.length > 0 ? (
        <ul className="space-y-3">
          {outcome.results.map((job) => {
            const salary = salaryOf(job);
            const posted = formatDate(job.provenance.publishedAt);
            return (
              <li key={`${job.provenance.provider}:${job.provenance.externalId}`} className={CARD}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-slate-100">{job.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {job.company ?? "Unknown company"}
                      {job.location ? <span className="text-slate-500"> · {job.location}</span> : null}
                    </p>
                  </div>
                  {job.applyUrl ? (
                    <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                      Apply
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {/* Source attribution is not decoration — a record with no
                      traceable origin is a claim, not evidence. */}
                  <Badge variant="special">{job.provenance.provider}</Badge>
                  {job.workplace !== "unknown" ? (
                    <Badge variant="info">{job.workplace}</Badge>
                  ) : null}
                  {job.experienceLevel ? <Badge variant="neutral">{job.experienceLevel}</Badge> : null}
                  {job.employmentType ? <Badge variant="neutral">{job.employmentType}</Badge> : null}
                  {salary ? <Badge variant="success">{salary}</Badge> : null}
                </div>

                {job.tags.length > 0 ? (
                  <p className="mt-2 text-[11px] text-slate-500">{job.tags.join(" · ")}</p>
                ) : null}
                {posted ? <p className="mt-1.5 text-[11px] text-slate-600">Posted {posted}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <ResearchEmpty searched={outcome !== null} ran={ran} noun="jobs" />
      )}
    </div>
  );
}

// --- Companies ---------------------------------------------------------------

function CompaniesPanel() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<SearchOutcome<CompanyRef> | null>(null);
  const [dossier, setDossier] = useState<CompanyDossier | null>(null);
  const [dossierUnavailable, setDossierUnavailable] = useState<readonly ProviderUnavailable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    setDossier(null);
    start(async () => {
      const result = await findCompaniesAction({ query });
      if (isActionError(result)) return setError(result.formError ?? "Search failed.");
      setOutcome(result.data);
    });
  }

  function open(ref: CompanyRef) {
    setError(null);
    start(async () => {
      const result = await getCompanyDossierAction({ providerId: ref.provider, ref: ref.ref });
      if (isActionError(result)) return setError(result.formError ?? "Could not load company.");
      setDossier(result.data.dossier);
      setDossierUnavailable(result.data.unavailable);
    });
  }

  const ran = outcome ? outcome.succeeded.length > 0 || outcome.failed.length > 0 : false;

  return (
    <div className="space-y-4">
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={run}
        placeholder="Company name or ticker (e.g. AAPL)"
        pending={pending}
      />

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {outcome ? (
        <ProviderNotice
          unavailable={outcome.unavailable}
          failed={outcome.failed}
          succeeded={outcome.succeeded}
        />
      ) : null}

      {dossier ? (
        <div className={CARD}>
          <h3 className="text-sm font-medium text-slate-100">{dossier.company.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="special">{dossier.company.provenance.provider}</Badge>
            {dossier.company.tickers.map((t) => (
              <Badge key={t} variant="info">
                {t}
              </Badge>
            ))}
            {dossier.company.sicDescription ? (
              <Badge variant="neutral">{dossier.company.sicDescription}</Badge>
            ) : null}
          </div>

          {dossier.financials.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-1.5 text-left font-medium">Metric</th>
                    <th className="pb-1.5 text-right font-medium">Value</th>
                    <th className="pb-1.5 text-left font-medium">Period</th>
                    {/* The filing is the point: a figure with no source is not evidence. */}
                    <th className="pb-1.5 text-left font-medium">Filing</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  {dossier.financials.slice(0, 12).map((fact, i) => (
                    <tr key={`${fact.metric}-${fact.periodEnd}-${i}`} className="border-t border-white/[0.04]">
                      <td className="py-1.5">{fact.label ?? fact.metric}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-300">
                        {fact.value.toLocaleString()} {fact.unit}
                      </td>
                      <td className="py-1.5">{formatDate(fact.periodEnd)}</td>
                      <td className="py-1.5">{fact.form ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">
              No financial facts returned for the default metrics.
            </p>
          )}

          {dossier.company.recentFilings.length > 0 ? (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Recent filings
              </p>
              <ul className="mt-1.5 space-y-1">
                {dossier.company.recentFilings.slice(0, 8).map((filing) => (
                  <li key={filing.accessionNumber} className="text-[11px] text-slate-400">
                    <span className="text-slate-300">{filing.form}</span> ·{" "}
                    {formatDate(filing.filedAt)}
                    {filing.documentUrl ? (
                      <>
                        {" "}
                        <a
                          href={filing.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 underline hover:text-slate-300"
                        >
                          view
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {dossierUnavailable.length > 0 && !dossier ? (
        <ProviderNotice unavailable={dossierUnavailable} />
      ) : null}

      {outcome && outcome.results.length > 0 ? (
        <ul className="space-y-1.5">
          {outcome.results.map((ref) => (
            <li key={`${ref.provider}:${ref.ref}`}>
              <button
                type="button"
                onClick={() => open(ref)}
                disabled={pending}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:border-white/15 disabled:opacity-50"
              >
                <span className="truncate">{ref.name}</span>
                {ref.ticker ? <Badge variant="info">{ref.ticker}</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : dossier ? null : (
        <ResearchEmpty searched={outcome !== null} ran={ran} noun="companies" />
      )}
    </div>
  );
}

// --- News --------------------------------------------------------------------

function NewsPanel() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<SearchOutcome<NormalizedNewsItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    start(async () => {
      const result = await searchNewsAction({ query, limit: 15 });
      if (isActionError(result)) return setError(result.formError ?? "Search failed.");
      setOutcome(result.data);
    });
  }

  const ran = outcome ? outcome.succeeded.length > 0 || outcome.failed.length > 0 : false;

  return (
    <div className="space-y-4">
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={run}
        placeholder="Company, industry or topic"
        pending={pending}
      />

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {outcome ? (
        <ProviderNotice
          unavailable={outcome.unavailable}
          failed={outcome.failed}
          succeeded={outcome.succeeded}
        />
      ) : null}

      {outcome && outcome.results.length > 0 ? (
        <ul className="space-y-2.5">
          {outcome.results.map((item) => (
            <li key={`${item.provenance.provider}:${item.provenance.externalId}`} className={CARD}>
              <a
                href={item.provenance.sourceUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-slate-100 hover:text-white"
              >
                {item.headline}
              </a>
              {item.summary ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.summary}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {/* The ORIGINATING outlet, never the aggregator. */}
                {item.source ? <Badge variant="neutral">{item.source}</Badge> : null}
                <Badge variant="special">{item.provenance.provider}</Badge>
                {item.category ? <Badge variant="info">{item.category}</Badge> : null}
                {formatDate(item.provenance.publishedAt) ? (
                  <span className="text-[11px] text-slate-600">
                    {formatDate(item.provenance.publishedAt)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ResearchEmpty searched={outcome !== null} ran={ran} noun="articles" />
      )}
    </div>
  );
}

// --- Macro -------------------------------------------------------------------

function MacroPanel() {
  const [seriesId, setSeriesId] = useState("CPIAUCSL");
  const [series, setSeries] = useState<NormalizedEconomicSeries | null>(null);
  const [unavailable, setUnavailable] = useState<readonly ProviderUnavailable[]>([]);
  const [failed, setFailed] = useState<readonly { provider: string; reason: string }[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(id: string) {
    setError(null);
    start(async () => {
      const result = await getMacroSeriesAction({ seriesId: id, limit: 24 });
      if (isActionError(result)) return setError(result.formError ?? "Could not load series.");
      setSeries(result.data.series);
      setUnavailable(result.data.unavailable);
      setFailed(result.data.failed);
      setSearched(true);
    });
  }

  return (
    <div className="space-y-4">
      <SearchBar
        value={seriesId}
        onChange={setSeriesId}
        onSubmit={() => run(seriesId)}
        placeholder="FRED series id (e.g. CPIAUCSL)"
        pending={pending}
      />

      <div className="flex flex-wrap gap-1.5">
        {MACRO_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              setSeriesId(preset.id);
              run(preset.id);
            }}
            disabled={pending}
            className={LINK}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <ProviderNotice unavailable={unavailable} failed={failed} />

      {series ? (
        <div className={CARD}>
          <h3 className="text-sm font-medium text-slate-100">{series.title ?? series.seriesId}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="special">{series.provenance.provider}</Badge>
            {series.units ? <Badge variant="neutral">{series.units}</Badge> : null}
            {series.frequency ? <Badge variant="neutral">{series.frequency}</Badge> : null}
            {series.provenance.sourceUrl ? (
              <a
                href={series.provenance.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                Source
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            ) : null}
          </div>

          <div className="mt-3 max-h-72 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0B0E14] text-slate-500">
                <tr>
                  <th className="pb-1.5 text-left font-medium">Period</th>
                  <th className="pb-1.5 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="text-slate-400">
                {series.observations.map((observation) => (
                  <tr key={observation.date} className="border-t border-white/[0.04]">
                    <td className="py-1">{formatDate(observation.date)}</td>
                    <td className="py-1 text-right tabular-nums text-slate-300">
                      {/* FRED reports a missing period as "."; it is null here
                          and rendered as such rather than as a zero. */}
                      {observation.value === null ? (
                        <span className="text-slate-600">not reported</span>
                      ) : (
                        observation.value.toLocaleString()
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ResearchEmpty searched={searched} ran={unavailable.length === 0} noun="series" />
      )}
    </div>
  );
}

// --- Scholarly ---------------------------------------------------------------

/**
 * Scholarly works — "who is actually doing the work in this area?"
 *
 * Authors and institutions lead, because they are the answer to that question;
 * the citation count is a popularity signal, deliberately not framed as a
 * quality judgement. Uses the same generic ProviderNotice / ResearchEmpty
 * mechanism as every other tab rather than a bespoke empty state.
 */
function ScholarlyPanel() {
  const [query, setQuery] = useState("");
  const [recentOnly, setRecentOnly] = useState(true);
  const [outcome, setOutcome] = useState<SearchOutcome<NormalizedScholarlyWork> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    start(async () => {
      const result = await searchScholarlyAction({
        query,
        // Two years back keeps a fast-moving field current without hiding the
        // work that defined it.
        fromDate: recentOnly ? `${new Date().getFullYear() - 2}-01-01` : undefined,
        limit: 20,
      });
      if (isActionError(result)) return setError(result.formError ?? "Search failed.");
      setOutcome(result.data);
    });
  }

  const ran = outcome ? outcome.succeeded.length > 0 || outcome.failed.length > 0 : false;

  return (
    <div className="space-y-4">
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={run}
        placeholder="Research topic (e.g. retrieval augmented generation)"
        pending={pending}
      >
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={recentOnly}
            onChange={(e) => setRecentOnly(e.target.checked)}
            className="accent-slate-400"
          />
          Last 2 years
        </label>
      </SearchBar>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {outcome ? (
        <ProviderNotice
          unavailable={outcome.unavailable}
          failed={outcome.failed}
          succeeded={outcome.succeeded}
        />
      ) : null}

      {outcome && outcome.results.length > 0 ? (
        <ul className="space-y-3">
          {outcome.results.map((work) => (
            <li key={work.provenance.externalId} className={CARD}>
              <a
                href={work.provenance.sourceUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-slate-100 hover:text-white"
              >
                {work.title}
              </a>

              {/* Every field below renders an explicit "Not available" rather
                  than vanishing, so a gap in the source is visible as a gap
                  instead of looking like a field we forgot to map. */}
              <p className="mt-1 text-xs text-slate-400">
                {work.authors.length > 0 ? (
                  <>
                    {work.authors.slice(0, 4).join(", ")}
                    {work.authors.length > 4 ? ` +${work.authors.length - 4} more` : ""}
                  </>
                ) : (
                  <span className="text-slate-600">Authors not available</span>
                )}
              </p>

              <p className="mt-0.5 text-[11px] text-slate-500">
                {work.institutions.length > 0 ? (
                  work.institutions.slice(0, 3).join(" · ")
                ) : (
                  <span className="text-slate-600">Affiliation not available</span>
                )}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="special">{work.provenance.provider}</Badge>
                {work.publicationYear !== null ? (
                  <Badge variant="neutral">{work.publicationYear}</Badge>
                ) : (
                  <Badge variant="neutral">Year not available</Badge>
                )}
                {work.workType ? <Badge variant="neutral">{work.workType}</Badge> : null}
                {work.citedByCount !== null ? (
                  <Badge variant="info">{work.citedByCount.toLocaleString()} citations</Badge>
                ) : (
                  <Badge variant="neutral">Citations not available</Badge>
                )}
                {work.openAccessUrl ? (
                  <a href={work.openAccessUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                    Full text
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                ) : null}
              </div>

              {/* OpenAlex supplies abstracts as an inverted index; the adapter
                  reconstructs them. Many records genuinely have none. */}
              <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
                {work.abstract ? (
                  work.abstract.length > 320 ? `${work.abstract.slice(0, 320)}…` : work.abstract
                ) : (
                  <span className="text-slate-600">Abstract not available</span>
                )}
              </p>

              <dl className="mt-2.5 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-slate-600">Journal</dt>
                  <dd className="truncate text-slate-400">
                    {work.venue ?? <span className="text-slate-600">Not available</span>}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-slate-600">Published</dt>
                  <dd className="text-slate-400">
                    {formatDate(work.provenance.publishedAt) ?? (
                      <span className="text-slate-600">Not available</span>
                    )}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-slate-600">DOI</dt>
                  <dd className="truncate">
                    {work.doi ? (
                      <a
                        href={work.doi}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 underline hover:text-slate-200"
                      >
                        {work.doi.replace("https://doi.org/", "")}
                      </a>
                    ) : (
                      <span className="text-slate-600">Not available</span>
                    )}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-slate-600">OpenAlex</dt>
                  <dd className="truncate">
                    <a
                      href={work.provenance.externalId}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 underline hover:text-slate-200"
                    >
                      {work.provenance.externalId.replace("https://openalex.org/", "")}
                    </a>
                  </dd>
                </div>
              </dl>

              {work.topics.length > 0 ? (
                <p className="mt-2 text-[11px] text-slate-600">{work.topics.join(" · ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <ResearchEmpty searched={outcome !== null} ran={ran} noun="research" />
      )}
    </div>
  );
}
