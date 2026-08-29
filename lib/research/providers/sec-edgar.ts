import "server-only";
import {
  fetchJson,
  isObject,
  isoDate,
  num,
  str,
  strArray,
  ResearchResponseError,
  ResearchUnconfiguredError,
} from "@/lib/research/http";
import type {
  CompanyFiling,
  CompanyProvider,
  CompanyRef,
  FinancialFact,
  NormalizedCompany,
} from "@/lib/research/types";

/**
 * SEC EDGAR — US company profiles, filings and XBRL financials.
 *
 * The highest-value company-research source available without a paid key:
 * official, free, complete for US registrants, and the primary record rather
 * than someone's summary of it. It answers "research this company before I
 * apply" and "research this company's financial position" with figures the
 * company itself filed, each traceable to the filing that reported it.
 *
 * AUTHENTICATION: none, but the SEC's fair-access policy REQUIRES a descriptive
 * User-Agent carrying a contact address. Verified: a request with a blank
 * User-Agent returns 403. That address is a real-world identity, so it is
 * configuration (`SEC_EDGAR_USER_AGENT`), never a hardcoded value — and the
 * provider reports itself unconfigured rather than sending a fake one.
 *
 * RATE LIMIT: the SEC documents 10 requests/second. We use 5, because being a
 * good citizen of a free public service costs nothing here.
 */

const PROVIDER = "sec_edgar" as const;
const DATA_HOST = "https://data.sec.gov";
const WWW_HOST = "https://www.sec.gov";

const RATE_LIMIT_PER_SECOND = 5;

/** Filings change daily at most; company facts less often. */
const REVALIDATE_SECONDS = 3_600;

/** The ticker index is ~800KB and near-static — cached for a day. */
const TICKER_REVALIDATE_SECONDS = 86_400;

/** Recent filings kept per company. Enough to see a pattern, not an archive. */
const MAX_FILINGS = 25;

/** Default metrics for a financial snapshot, in US-GAAP taxonomy terms. */
export const DEFAULT_METRICS = [
  "Revenues",
  "NetIncomeLoss",
  "Assets",
  "Liabilities",
  "StockholdersEquity",
] as const;

function userAgent(): string {
  const configured = str(process.env.SEC_EDGAR_USER_AGENT);
  // Fail closed and loudly. Sending a fabricated contact address to a
  // regulator's fair-access endpoint is not an acceptable default.
  if (!configured) throw new ResearchUnconfiguredError(PROVIDER, "SEC_EDGAR_USER_AGENT");
  return configured;
}

function headers(): Record<string, string> {
  return { "User-Agent": userAgent(), "Accept-Encoding": "gzip, deflate" };
}

/** EDGAR identifies companies by a zero-padded 10-digit CIK. */
export function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

// --- Company search ----------------------------------------------------------

interface TickerRow {
  cik_str?: unknown;
  ticker?: unknown;
  title?: unknown;
}

/**
 * Resolve a company name or ticker to candidate CIKs.
 *
 * EDGAR has no fuzzy search endpoint, so this filters the published ticker
 * index client-side. 10,388 rows is small enough to scan and the file is cached
 * for a day, which is cheaper and more predictable than the full-text search
 * endpoint for the "which Apple did you mean?" question.
 */
async function findCompanies(query: string, signal?: AbortSignal): Promise<CompanyRef[]> {
  const needle = str(query)?.toLowerCase();
  if (!needle) return [];

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url: `${WWW_HOST}/files/company_tickers.json`,
    headers: headers(),
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: TICKER_REVALIDATE_SECONDS,
  });

  if (!isObject(body)) {
    throw new ResearchResponseError(PROVIDER, "Ticker index was not a JSON object.");
  }

  const exact: CompanyRef[] = [];
  const partial: CompanyRef[] = [];

  for (const row of Object.values(body)) {
    if (!isObject(row)) continue;
    const entry = row as TickerRow;
    const name = str(entry.title);
    const cik = num(entry.cik_str);
    if (!name || cik === null) continue;

    const ticker = str(entry.ticker);
    const ref: CompanyRef = { provider: PROVIDER, ref: padCik(cik), name, ticker };

    // An exact ticker match is almost always what the caller meant, so it is
    // ranked above a substring hit on some other company's name.
    if (ticker && ticker.toLowerCase() === needle) exact.push(ref);
    else if (name.toLowerCase().includes(needle)) partial.push(ref);

    if (exact.length + partial.length >= 200) break;
  }

  return [...exact, ...partial].slice(0, 10);
}

// --- Company profile ---------------------------------------------------------

/**
 * `filings.recent` is column-oriented: parallel arrays, not an array of
 * objects. Zipping them is the whole normalization job, and a short array
 * anywhere would silently misalign a filing with another filing's date — hence
 * the explicit length guard rather than trusting index arithmetic.
 */
function zipFilings(recent: unknown, cik: string): CompanyFiling[] {
  if (!isObject(recent)) return [];

  const forms = Array.isArray(recent.form) ? recent.form : [];
  const filed = Array.isArray(recent.filingDate) ? recent.filingDate : [];
  const reports = Array.isArray(recent.reportDate) ? recent.reportDate : [];
  const accessions = Array.isArray(recent.accessionNumber) ? recent.accessionNumber : [];
  const documents = Array.isArray(recent.primaryDocument) ? recent.primaryDocument : [];

  const count = Math.min(forms.length, filed.length, accessions.length, MAX_FILINGS);
  const out: CompanyFiling[] = [];

  for (let i = 0; i < count; i += 1) {
    const form = str(forms[i]);
    const filedAt = isoDate(filed[i]);
    const accession = str(accessions[i]);
    if (!form || !filedAt || !accession) continue;

    const bare = accession.replace(/-/g, "");
    const document = str(documents[i]);
    out.push({
      form,
      filedAt,
      reportDate: isoDate(reports[i]),
      accessionNumber: accession,
      documentUrl: document
        ? `${WWW_HOST}/Archives/edgar/data/${Number(cik)}/${bare}/${document}`
        : null,
    });
  }
  return out;
}

async function getCompany(ref: string, signal?: AbortSignal): Promise<NormalizedCompany | null> {
  const cik = padCik(ref);
  if (cik === "0000000000") return null;

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url: `${DATA_HOST}/submissions/CIK${cik}.json`,
    headers: headers(),
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: REVALIDATE_SECONDS,
  });

  if (!isObject(body)) {
    throw new ResearchResponseError(PROVIDER, "Submissions response was not a JSON object.");
  }

  const name = str(body.name);
  if (!name) return null;

  const filings = isObject(body.filings) ? body.filings.recent : null;

  return {
    provenance: {
      provider: PROVIDER,
      externalId: cik,
      sourceUrl: `${WWW_HOST}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`,
      retrievedAt: new Date().toISOString(),
      // A company profile is a living record, not something "published" once.
      publishedAt: null,
    },
    name,
    tickers: strArray(body.tickers),
    exchanges: strArray(body.exchanges),
    sic: str(body.sic),
    sicDescription: str(body.sicDescription),
    entityType: str(body.entityType),
    stateOfIncorporation: str(body.stateOfIncorporation),
    website: str(body.website),
    recentFilings: zipFilings(filings, cik),
  };
}

// --- Financials --------------------------------------------------------------

/**
 * Read one XBRL concept.
 *
 * A 404 here is normal and is NOT an error: not every registrant reports every
 * us-gaap tag (many use `RevenueFromContractWithCustomerExcludingAssessedTax`
 * rather than `Revenues`). Returning [] lets the caller ask for five metrics
 * and get back the three this company actually files.
 */
async function readConcept(
  cik: string,
  metric: string,
  signal?: AbortSignal,
): Promise<FinancialFact[]> {
  let body: unknown;
  try {
    body = await fetchJson<unknown>({
      provider: PROVIDER,
      url: `${DATA_HOST}/api/xbrl/companyconcept/CIK${cik}/us-gaap/${encodeURIComponent(metric)}.json`,
      headers: headers(),
      signal,
      rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
      revalidateSeconds: REVALIDATE_SECONDS,
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return [];
    throw error;
  }

  if (!isObject(body) || !isObject(body.units)) return [];

  const label = str(body.label);
  const out: FinancialFact[] = [];

  for (const [unit, facts] of Object.entries(body.units)) {
    if (!Array.isArray(facts)) continue;
    for (const fact of facts) {
      if (!isObject(fact)) continue;
      const value = num(fact.val);
      const periodEnd = isoDate(fact.end);
      // A figure without a value or a period is unusable as evidence.
      if (value === null || !periodEnd) continue;

      out.push({
        metric,
        label,
        value,
        unit,
        periodStart: isoDate(fact.start),
        periodEnd,
        fiscalYear: num(fact.fy),
        fiscalPeriod: str(fact.fp),
        form: str(fact.form),
        filedAt: isoDate(fact.filed),
      });
    }
  }

  // Newest first: a financial profile is read from the present backwards.
  out.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  return out;
}

async function getFinancials(
  ref: string,
  metrics: readonly string[] = DEFAULT_METRICS,
  signal?: AbortSignal,
): Promise<FinancialFact[]> {
  const cik = padCik(ref);
  const out: FinancialFact[] = [];
  // Serial, not parallel: the shared limiter would queue them anyway, and this
  // keeps the request pattern obvious to anyone reading the SEC's access logs.
  for (const metric of metrics) {
    out.push(...(await readConcept(cik, metric, signal)));
  }
  return out;
}

export const secEdgarProvider: CompanyProvider = {
  kind: "company",
  id: PROVIDER,
  displayName: "SEC EDGAR",
  get configured() {
    return str(process.env.SEC_EDGAR_USER_AGENT) !== null;
  },
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  findCompanies,
  getCompany,
  getFinancials,
};

/** Exported for tests. */
export const __testing = { zipFilings, padCik };
