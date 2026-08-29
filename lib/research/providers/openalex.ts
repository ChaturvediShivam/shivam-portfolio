import "server-only";
import {
  fetchJson,
  isObject,
  isoDate,
  num,
  str,
  ResearchResponseError,
} from "@/lib/research/http";
import type {
  NormalizedScholarlyWork,
  ScholarlyProvider,
  ScholarlySearchParams,
} from "@/lib/research/types";

/**
 * OpenAlex — open catalogue of scholarly works, authors and institutions.
 *
 * Answers the one question no other provider in this system can: "who is
 * actually doing the work in this research area?" A job board says who is
 * hiring, a filing says what a company earned, news says what was announced —
 * only this says which people and institutions are publishing.
 *
 * NO AUTHENTICATION OF ANY KIND. Verified: a request with a blank User-Agent
 * returns 200. So this provider is always `configured` and requires no
 * environment variable. `OPENALEX_CONTACT_EMAIL` is OPTIONAL — OpenAlex
 * documents a "polite pool" giving faster, more consistent service to callers
 * who identify themselves via `mailto`. It is a courtesy, not a credential, and
 * its absence never blocks a request.
 *
 * Contract verified live before this file was written: the envelope
 * (`meta.count` + `results[]`), the nullable `primary_location.source`, the
 * empty-result shape (200 with `count: 0` and `results: []`) and the error
 * shape (400 with a JSON `error`/`message`) are all observed, not assumed.
 */

const BASE = "https://api.openalex.org/works";
const PROVIDER = "openalex" as const;

/** OpenAlex documents 10 requests/second; we stay well inside it. */
const RATE_LIMIT_PER_SECOND = 5;

/** The API caps `per-page` at 200; a tighter bound belongs on our side. */
const MAX_LIMIT = 50;

/** Scholarly records change slowly. An hour keeps repeat searches free. */
const REVALIDATE_SECONDS = 3_600;

/** Bounds on reconstructed abstracts — see `reconstructAbstract`. */
const MAX_ABSTRACT_WORDS = 400;
const MAX_ABSTRACT_CHARS = 1_500;

/** Authors and topics kept per work. Enough to see the shape of a field. */
const MAX_AUTHORS = 10;
const MAX_INSTITUTIONS = 8;
const MAX_TOPICS = 6;

function contactEmail(): string | null {
  return str(process.env.OPENALEX_CONTACT_EMAIL);
}

/**
 * Rebuild an abstract from OpenAlex's inverted index.
 *
 * OpenAlex publishes abstracts as `{word: [positions]}` rather than as text —
 * a documented consequence of their source licensing. Inverting it back is
 * deterministic and lossless for our purposes, so the alternative (showing no
 * abstract at all) would discard real information for no reason.
 *
 * Bounded in both words and characters: this is third-party data of unbounded
 * size feeding a UI, and a pathological index must not become a 2MB string.
 */
function reconstructAbstract(index: unknown): string | null {
  if (!isObject(index)) return null;

  const slots: Array<{ position: number; word: string }> = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (typeof position !== "number" || !Number.isFinite(position)) continue;
      slots.push({ position, word });
      if (slots.length > MAX_ABSTRACT_WORDS) break;
    }
    if (slots.length > MAX_ABSTRACT_WORDS) break;
  }
  if (slots.length === 0) return null;

  slots.sort((a, b) => a.position - b.position);
  const text = slots.map((slot) => slot.word).join(" ").trim();
  return text.length > 0 ? text.slice(0, MAX_ABSTRACT_CHARS) : null;
}

/** Display names from a list of `{display_name}` objects, deduped and bounded. */
function displayNames(list: unknown, max: number): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!isObject(entry)) continue;
    const name = str(entry.display_name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Authors and their institutions, read from `authorships[]`.
 *
 * `institutions` is frequently an empty array even on well-attributed works, so
 * an empty result here is normal and must not be treated as a parse failure.
 */
function readAuthorships(raw: unknown): { authors: string[]; institutions: string[] } {
  if (!Array.isArray(raw)) return { authors: [], institutions: [] };

  const authors: string[] = [];
  const institutions: string[] = [];
  const seenInstitution = new Set<string>();

  for (const entry of raw) {
    if (!isObject(entry)) continue;

    if (authors.length < MAX_AUTHORS && isObject(entry.author)) {
      const name = str(entry.author.display_name) ?? str(entry.raw_author_name);
      if (name) authors.push(name);
    }

    for (const institution of displayNames(entry.institutions, MAX_INSTITUTIONS)) {
      if (seenInstitution.has(institution)) continue;
      if (institutions.length >= MAX_INSTITUTIONS) break;
      seenInstitution.add(institution);
      institutions.push(institution);
    }
  }

  return { authors, institutions };
}

/** Journal/conference name. `primary_location.source` is nullable — observed. */
function readVenue(raw: unknown): string | null {
  if (!isObject(raw)) return null;
  const source = raw.source;
  return isObject(source) ? str(source.display_name) : null;
}

/** Best human-viewable URL: publisher landing page, then DOI, then the record. */
function readSourceUrl(raw: Record<string, unknown>, id: string): string | null {
  const location = isObject(raw.primary_location) ? raw.primary_location : null;
  return (location ? str(location.landing_page_url) : null) ?? str(raw.doi) ?? id;
}

function normalize(raw: unknown, retrievedAt: string): NormalizedScholarlyWork | null {
  if (!isObject(raw)) return null;

  const id = str(raw.id);
  const title = str(raw.title) ?? str(raw.display_name);
  // A work with no id cannot be deduplicated and one with no title cannot be
  // shown, so it is dropped rather than rendered as a blank row.
  if (!id || !title) return null;

  const { authors, institutions } = readAuthorships(raw.authorships);
  const openAccess = isObject(raw.open_access) ? raw.open_access : null;

  // `topics` is the current field; `concepts` is the legacy one. Preferring
  // topics and falling back keeps this working across their migration.
  const topics = displayNames(raw.topics, MAX_TOPICS);

  return {
    provenance: {
      provider: PROVIDER,
      externalId: id,
      sourceUrl: readSourceUrl(raw, id),
      retrievedAt,
      publishedAt: isoDate(raw.publication_date),
    },
    title,
    authors,
    institutions,
    venue: readVenue(raw.primary_location),
    publicationYear: num(raw.publication_year),
    citedByCount: num(raw.cited_by_count),
    topics: topics.length > 0 ? topics : displayNames(raw.concepts, MAX_TOPICS),
    doi: str(raw.doi),
    openAccessUrl: openAccess ? str(openAccess.oa_url) : null,
    workType: str(raw.type),
    abstract: reconstructAbstract(raw.abstract_inverted_index),
  };
}

async function searchWorks(
  params: ScholarlySearchParams,
  signal?: AbortSignal,
): Promise<NormalizedScholarlyWork[]> {
  const query = str(params.query);
  // An empty search would return an arbitrary slice of 250M+ works, which is
  // never what a research caller wants.
  if (!query) return [];

  const url = new URL(BASE);
  url.searchParams.set("search", query);
  url.searchParams.set(
    "per-page",
    String(Math.min(MAX_LIMIT, Math.max(1, Math.trunc(num(params.limit) ?? 20)))),
  );

  const page = num(params.page);
  if (page !== null && page > 1) url.searchParams.set("page", String(Math.trunc(page)));

  const fromDate = str(params.fromDate);
  if (fromDate) url.searchParams.set("filter", `from_publication_date:${fromDate}`);

  // Default relevance ordering is deliberate. Sorting by citation count was
  // tried and surfaced decades-old classics for a modern query — relevance
  // answers "who is working on this now", which is the actual question.
  const contact = contactEmail();
  if (contact) url.searchParams.set("mailto", contact);

  const body = await fetchJson<unknown>({
    provider: PROVIDER,
    url,
    signal,
    rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
    revalidateSeconds: REVALIDATE_SECONDS,
  });

  if (!isObject(body) || !Array.isArray(body.results)) {
    throw new ResearchResponseError(PROVIDER, 'Response is missing a "results" array.');
  }

  const retrievedAt = new Date().toISOString();
  const seen = new Set<string>();
  const out: NormalizedScholarlyWork[] = [];

  for (const row of body.results) {
    const work = normalize(row, retrievedAt);
    // One malformed row must not cost the caller the rest of the page.
    if (!work) continue;
    if (seen.has(work.provenance.externalId)) continue;
    seen.add(work.provenance.externalId);
    out.push(work);
  }
  return out;
}

export const openAlexProvider: ScholarlyProvider = {
  kind: "scholarly",
  id: PROVIDER,
  displayName: "OpenAlex",
  // Always true: OpenAlex needs no credential, and reporting otherwise would
  // make a working provider look broken. OPENALEX_CONTACT_EMAIL is a courtesy.
  configured: true,
  rateLimitPerSecond: RATE_LIMIT_PER_SECOND,
  searchWorks,
};

/** Exported for tests. */
export const __testing = { normalize, reconstructAbstract };
