import "server-only";
import { fetchJson, isObject, isoDate, num, str, ResearchResponseError } from "@/lib/research/http";
import type { NewsProvider, NormalizedNewsItem } from "@/lib/research/types";

/**
 * Noozra — news search across ~200 curated RSS sources.
 *
 * Selected as the news provider because it is the only no-auth option in the
 * source list that offers what news intelligence actually requires: a search
 * endpoint, a publication timestamp, an originating-outlet attribution, a
 * canonical URL and a category. Verified live against an "artificial
 * intelligence" query, which returned correctly attributed AI-industry
 * articles.
 *
 * The rejected alternatives, for the record: DataCube AI serves from a
 * `railway.app` development host behind date-shaped paths; Inshorts is an
 * unofficial scraper; Chronicling America is a historical newspaper archive.
 * Every other news API in the list is key-gated.
 *
 * The critical property for this product is that `source` names the ORIGINATING
 * OUTLET, not the aggregator. A competitive-intelligence brief that cites
 * "Noozra" instead of the outlet that actually reported the story is not
 * evidence. Nothing here is summarized by a model — these are source records,
 * and AI synthesis attaches to them by provenance rather than replacing them.
 */

const BASE = "https://noozra.com/api/search";
const PROVIDER = "noozra" as const;

/** Undocumented; kept conservative for a small free service. */
const RATE_LIMIT_PER_SECOND = 2;

const MAX_LIMIT = 50;

/** News moves faster than job listings, so a shorter cache window. */
const REVALIDATE_SECONDS = 300;

function normalize(raw: unknown, retrievedAt: string): NormalizedNewsItem | null {
  if (!isObject(raw)) return null;

  const headline = str(raw.headline);
  const url = str(raw.url);
  // An article with no headline cannot be shown; one with no URL cannot be
  // verified, which makes it useless as evidence.
  if (!headline || !url) return null;

  return {
    provenance: {
      provider: PROVIDER,
      // Prefer their id, fall back to the URL — either way the pair
      // (provider, externalId) stays a usable deduplication key.
      externalId: str(raw.id) ?? url,
      sourceUrl: url,
      retrievedAt,
      publishedAt: isoDate(raw.published_at),
    },
    headline,
    summary: str(raw.description),
    source: str(raw.source),
    category: str(raw.category),
    imageUrl: str(raw.image_url),
  };
}

async function searchNews(
  query: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<NormalizedNewsItem[]> {
  const q = str(query);
  // An empty query would return an arbitrary slice of the firehose, which is
  // never what a research caller wants. Refusing costs nothing.
  if (!q) return [];

  const url = new URL(BASE);
  url.searchParams.set("q", q);
  const size = num(limit);
  url.searchParams.set("limit", String(Math.min(MAX_LIMIT, Math.max(1, Math.trunc(size ?? 10)))));

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
    // Aggregated feeds syndicate the same story across outlets; the URL is the
    // strongest identity the source gives us for collapsing those.
    if (seen.has(item.provenance.sourceUrl ?? "")) continue;
    seen.add(item.provenance.sourceUrl ?? "");
    out.push(item);
  }
  return out;
}

export const noozraProvider: NewsProvider = {
  kind: "news",
  id: PROVIDER,
  displayName: "Noozra",
  configured: true,
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  searchNews,
};

/** Exported for tests. */
export const __testing = { normalize };
