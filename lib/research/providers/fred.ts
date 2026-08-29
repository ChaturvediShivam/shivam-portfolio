import "server-only";
import {
  fetchJson,
  isObject,
  isoDate,
  num,
  str,
  ResearchResponseError,
  ResearchUnconfiguredError,
} from "@/lib/research/http";
import type {
  EconomicObservation,
  MacroProvider,
  NormalizedEconomicSeries,
} from "@/lib/research/types";

/**
 * FRED — economic time series from the Federal Reserve Bank of St. Louis.
 *
 * CREDENTIAL-GATED. Needs `FRED_API_KEY` (free, instant, from
 * fred.stlouisfed.org/docs/api/api_key.html).
 *
 * Supplies the one layer SEC EDGAR cannot: macro context. A company filing says
 * what one company earned; CPI, GDP and unemployment say what the environment
 * was doing at the time, which is what an industry or market brief needs.
 *
 * Read-only research data. No trading execution, per the standing instruction.
 *
 * VERIFICATION STATUS: the endpoint was confirmed live and key-gated — an
 * unauthenticated call returns a clean JSON error naming the missing variable
 * ("Variable api_key is not set"). The success shape follows FRED's published
 * contract and has NOT been observed. The one quirk handled explicitly below is
 * documented by FRED: a missing observation is the STRING "." and must not
 * become 0.
 */

const BASE = "https://api.stlouisfed.org/fred";
const PROVIDER = "fred" as const;

const RATE_LIMIT_PER_SECOND = 2;

/** Economic series are revised infrequently; a long cache is correct here. */
const REVALIDATE_SECONDS = 21_600;

const MAX_OBSERVATIONS = 240;

/** Common series, so callers do not need to memorise FRED's identifiers. */
export const COMMON_SERIES = {
  gdp: "GDP",
  cpi: "CPIAUCSL",
  unemployment: "UNRATE",
  fedFunds: "FEDFUNDS",
  treasury10y: "DGS10",
} as const;

function apiKey(): string {
  const key = str(process.env.FRED_API_KEY);
  if (!key) throw new ResearchUnconfiguredError(PROVIDER, "FRED_API_KEY");
  return key;
}

/**
 * FRED represents a missing observation as the string "." — not null, not 0.
 * Coercing that to zero would put a fabricated data point on a chart, so it
 * becomes an explicit null the caller must handle.
 */
function toObservation(raw: unknown): EconomicObservation | null {
  if (!isObject(raw)) return null;
  const date = isoDate(raw.date);
  if (!date) return null;
  const rawValue = str(raw.value);
  return { date, value: rawValue === "." || rawValue === null ? null : num(rawValue) };
}

async function readMetadata(
  seriesId: string,
  key: string,
  signal?: AbortSignal,
): Promise<{ title: string | null; units: string | null; frequency: string | null }> {
  const url = new URL(`${BASE}/series`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", key);
  url.searchParams.set("file_type", "json");

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url,
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: REVALIDATE_SECONDS,
  });

  const list = isObject(body) && Array.isArray(body.seriess) ? body.seriess : [];
  const first = list.length > 0 && isObject(list[0]) ? list[0] : null;
  // Metadata is a nicety; a series without it is still usable, so this degrades
  // to nulls rather than failing the whole request.
  if (!first) return { title: null, units: null, frequency: null };

  return {
    title: str(first.title),
    units: str(first.units),
    frequency: str(first.frequency),
  };
}

async function getSeries(
  seriesId: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<NormalizedEconomicSeries | null> {
  const key = apiKey();
  const id = str(seriesId);
  if (!id) return null;

  const url = new URL(`${BASE}/series/observations`);
  url.searchParams.set("series_id", id);
  url.searchParams.set("api_key", key);
  url.searchParams.set("file_type", "json");
  url.searchParams.set(
    "limit",
    String(Math.min(MAX_OBSERVATIONS, Math.max(1, Math.trunc(num(limit) ?? 60)))),
  );
  // Newest first: a macro brief reads from the present backwards.
  url.searchParams.set("sort_order", "desc");

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url,
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: REVALIDATE_SECONDS,
  });

  if (!isObject(body) || !Array.isArray(body.observations)) {
    throw new ResearchResponseError(PROVIDER, 'Response is missing an "observations" array.');
  }

  const observations: EconomicObservation[] = [];
  for (const row of body.observations) {
    const observation = toObservation(row);
    if (observation) observations.push(observation);
  }

  const meta = await readMetadata(id, key, signal);

  return {
    provenance: {
      provider: PROVIDER,
      externalId: id,
      sourceUrl: `https://fred.stlouisfed.org/series/${encodeURIComponent(id)}`,
      retrievedAt: new Date().toISOString(),
      // The newest observation date is the closest thing to a publication date.
      publishedAt: observations[0]?.date ?? null,
    },
    seriesId: id,
    title: meta.title,
    units: meta.units,
    frequency: meta.frequency,
    observations,
  };
}

export const fredProvider: MacroProvider = {
  kind: "macro",
  id: PROVIDER,
  displayName: "FRED",
  get configured() {
    return str(process.env.FRED_API_KEY) !== null;
  },
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  getSeries,
};

/** Exported for tests. */
export const __testing = { toObservation };
