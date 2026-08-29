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
import type { NewsProvider, NormalizedNewsItem } from "@/lib/research/types";

/**
 * GNews — keyed news search across mainstream outlets.
 *
 * CREDENTIAL-GATED. Needs `GNEWS_API_KEY` (free tier: 100 requests/day).
 *
 * Complements Noozra rather than replacing it. Noozra covers ~200 curated RSS
 * sources with strong AI-industry coverage; GNews reaches mainstream business
 * and financial press with date-range and language filters. Running both and
 * deduplicating by URL is the redundancy the standing instruction allows when
 * it has strategic value — one outlet's silence is not the market's.
 *
 * VERIFICATION STATUS: the endpoint was confirmed live and key-gated — an
 * unauthenticated call returns `{"errors":["You did not provide an API key."]}`.
 * The success shape follows GNews's published v4 contract and has NOT been
 * observed live.
 *
 * NOTE on the free tier: GNews truncates article `content` and returns a
 * `description` only. Nothing here reconstructs a full article body, and the
 * summary is the outlet's own — no model runs in this file.
 */

const BASE = "https://gnews.io/api/v4/search";
const PROVIDER = "gnews" as const;

/** Free tier is 100 requests/day; keep per-second pressure minimal. */
const RATE_LIMIT_PER_SECOND = 1;

/** GNews caps `max` at 100; the free tier is far lower. */
const MAX_LIMIT = 25;

const REVALIDATE_SECONDS = 900;

function apiKey(): string {
  const key = str(process.env.GNEWS_API_KEY);
  if (!key) throw new ResearchUnconfiguredError(PROVIDER, "GNEWS_API_KEY");
  return key;
}

function normalize(raw: unknown, retrievedAt: string): NormalizedNewsItem | null {
  if (!isObject(raw)) return null;

  const headline = str(raw.title);
  const url = str(raw.url);
  // No headline means nothing to show; no URL means nothing to verify, which
  // makes the record useless as evidence.
  if (!headline || !url) return null;

  // `source` is an object: { name, url }. The outlet, never the aggregator.
  const source = isObject(raw.source) ? str(raw.source.name) : null;

  return {
    provenance: {
      provider: PROVIDER,
      externalId: url,
      sourceUrl: url,
      retrievedAt,
      publishedAt: isoDate(raw.publishedAt),
    },
    headline,
    summary: str(raw.description),
    source,
    // GNews's search endpoint returns no category; asserting one would be
    // inventing metadata the source did not supply.
    category: null,
    imageUrl: str(raw.image),
  };
}

async function searchNews(
  query: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<NormalizedNewsItem[]> {
  const key = apiKey();
  const q = str(query);
  // An empty query would return an arbitrary slice of the firehose and spend
  // one of a small daily quota for nothing.
  if (!q) return [];

  const url = new URL(BASE);
  url.searchParams.set("q", q);
  url.searchParams.set("apikey", key);
  url.searchParams.set("lang", str(process.env.GNEWS_LANG) ?? "en");
  url.searchParams.set(
    "max",
    String(Math.min(MAX_LIMIT, Math.max(1, Math.trunc(num(limit) ?? 10)))),
  );

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url,
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: REVALIDATE_SECONDS,
  });

  if (!isObject(body) || !Array.isArray(body.articles)) {
    throw new ResearchResponseError(PROVIDER, 'Response is missing an "articles" array.');
  }

  const retrievedAt = new Date().toISOString();
  const seen = new Set<string>();
  const out: NormalizedNewsItem[] = [];

  for (const row of body.articles) {
    const item = normalize(row, retrievedAt);
    if (!item) continue;
    const key = (item.provenance.sourceUrl ?? "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const gnewsProvider: NewsProvider = {
  kind: "news",
  id: PROVIDER,
  displayName: "GNews",
  get configured() {
    return str(process.env.GNEWS_API_KEY) !== null;
  },
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  searchNews,
};

/** Exported for tests. */
export const __testing = { normalize };
