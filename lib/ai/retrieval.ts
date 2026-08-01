import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listCompanies } from "@/lib/companies";
import { listContacts } from "@/lib/contacts";
import { listMessages } from "@/lib/messages";
import { listOpportunities } from "@/lib/opportunities";
import { listTasks } from "@/lib/tasks";

/**
 * CRM retrieval (Phase 3 · M8).
 *
 * Assembles the context the copilot answers from. Keyword recall today: every
 * entity here is searched through the same `search_vector`/GIN indexes and the
 * same Phase-2 data layers the UI uses, so an agent read runs the identical code
 * path — and the identical RLS — as a human read.
 *
 * SEAM FOR SEMANTIC RECALL — the vector half of M8 is deferred, not designed
 * away. `retrieve()` is the single entry point and returns a ranked
 * `RetrievedItem[]`; adding embeddings means adding a second candidate source
 * inside `retrieve()` and blending it in `rank()`. No caller changes, because no
 * caller knows how a candidate was found. The deferral is not a shortcut chosen
 * here: the configured provider exposes no embeddings endpoint, so `AiProvider`
 * has nothing to implement `embed()` with until a second one is configured.
 *
 * ponytail: FTS-only recall, ranked by lexical hit + recency. Add pgvector
 * neighbours as a second source in `retrieve()` once an embedding provider
 * exists — synonym and paraphrase queries are what this cannot answer.
 */

export type RetrievalEntityType =
  | "opportunity"
  | "company"
  | "contact"
  | "message"
  | "task"
  | "calendar_event"
  | "note";

export const RETRIEVAL_ENTITY_TYPES: RetrievalEntityType[] = [
  "opportunity",
  "company",
  "contact",
  "message",
  "task",
  "calendar_event",
  "note",
];

/** One retrieved record, projected to what an agent may see. */
export interface RetrievedItem {
  entityType: RetrievalEntityType;
  entityId: string;
  /** Short human label — the thing the operator would recognise. */
  title: string;
  /** Bounded excerpt of the matching content. */
  snippet: string;
  /** When the record happened, for recency ranking. Null when undated. */
  occurredAt: string | null;
  /** Admin deep link, so an answer can cite where it came from. */
  href: string;
}

export interface RetrievalOptions {
  /** Restrict to these entity types. Defaults to all. */
  types?: RetrievalEntityType[];
  /** Maximum items returned across all types. */
  limit?: number;
}

/** Per-type fetch width. Deliberately small: this text is billed per token. */
const PER_TYPE_LIMIT = 5;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;
const SNIPPET_CHARS = 320;

/** Collapse whitespace and bound length — prompt context, not a document store. */
function excerpt(...parts: (string | null | undefined)[]): string {
  const text = parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" — ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS - 1)}…` : text;
}

/**
 * Interleave by type, then order by recency.
 *
 * Round-robin before truncation so one chatty type — messages, always — cannot
 * crowd every other type out of a narrow budget. Within the selection, newer
 * first: in a job search the recent record is nearly always the relevant one.
 */
function rank(groups: RetrievedItem[][], limit: number): RetrievedItem[] {
  const picked: RetrievedItem[] = [];
  const widest = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < widest && picked.length < limit; index += 1) {
    for (const group of groups) {
      if (picked.length >= limit) break;
      const item = group[index];
      if (item) picked.push(item);
    }
  }

  return picked.sort((a, b) => {
    if (!a.occurredAt && !b.occurredAt) return 0;
    if (!a.occurredAt) return 1;
    if (!b.occurredAt) return -1;
    return b.occurredAt.localeCompare(a.occurredAt);
  });
}

/**
 * A search that fails is not an answer that fails.
 *
 * One unavailable table — a not-yet-applied migration, a permission gap — must
 * degrade that source to empty rather than collapse the whole retrieval and
 * leave the copilot unable to answer from the six sources that did work.
 */
async function safely(
  label: RetrievalEntityType,
  load: () => Promise<RetrievedItem[]>,
): Promise<RetrievedItem[]> {
  try {
    return await load();
  } catch (error) {
    console.error(`[ai/retrieval] ${label} search failed:`, error);
    return [];
  }
}

/** Rows are owner-scoped in application code — see the H5 note on tools. */
function owned<T extends { owner_id?: string | null }>(rows: T[], ownerId: string): T[] {
  return rows.filter((row) => row.owner_id === ownerId);
}

async function searchOpportunities(
  client: SupabaseClient,
  ownerId: string,
  query: string,
): Promise<RetrievedItem[]> {
  const { rows } = await listOpportunities(client, { search: query, pageSize: PER_TYPE_LIMIT, page: 1 });
  return owned(rows, ownerId).map((row) => ({
    entityType: "opportunity" as const,
    entityId: row.id,
    title: row.company?.name ? `${row.title} @ ${row.company.name}` : row.title,
    // `ai_summary` is the M7 rollup — the best one-paragraph account of this
    // pursuit that exists, and null until the opportunity has been summarized.
    snippet: excerpt(`Stage: ${row.stage}`, row.location, row.seniority, row.ai_summary),
    occurredAt: row.updated_at ?? null,
    href: `/admin/opportunities/${row.id}`,
  }));
}

async function searchCompanies(
  client: SupabaseClient,
  ownerId: string,
  query: string,
): Promise<RetrievedItem[]> {
  const { rows } = await listCompanies(client, { search: query, pageSize: PER_TYPE_LIMIT, page: 1 });
  return owned(rows, ownerId).map((row) => ({
    entityType: "company" as const,
    entityId: row.id,
    title: row.name,
    snippet: excerpt(row.industry, row.headquarters, row.description),
    occurredAt: row.updated_at ?? null,
    href: `/admin/companies/${row.id}`,
  }));
}

async function searchContacts(
  client: SupabaseClient,
  ownerId: string,
  query: string,
): Promise<RetrievedItem[]> {
  const { rows } = await listContacts(client, { search: query, pageSize: PER_TYPE_LIMIT, page: 1 });
  return owned(rows, ownerId).map((row) => ({
    entityType: "contact" as const,
    entityId: row.id,
    title: row.full_name,
    snippet: excerpt(row.title, row.company?.name, row.email, row.location),
    occurredAt: row.updated_at ?? null,
    href: `/admin/contacts/${row.id}`,
  }));
}

async function searchMessages(
  client: SupabaseClient,
  ownerId: string,
  query: string,
): Promise<RetrievedItem[]> {
  const { rows } = await listMessages(client, { search: query, pageSize: PER_TYPE_LIMIT, page: 1 });
  return owned(rows, ownerId).map((row) => ({
    entityType: "message" as const,
    entityId: row.id,
    title: row.subject?.trim() || "(no subject)",
    // The AI summary is preferred over the raw body when one exists: it is
    // shorter, already redacted, and says the same thing.
    snippet: excerpt(
      `${row.direction} · ${row.from_name ?? row.from_address ?? "unknown sender"}`,
      row.ai_summary ?? row.snippet ?? row.body_text,
    ),
    occurredAt: row.received_at ?? row.created_at ?? null,
    href: `/admin/messages/${row.id}`,
  }));
}

async function searchTasks(
  client: SupabaseClient,
  ownerId: string,
  query: string,
): Promise<RetrievedItem[]> {
  const { rows } = await listTasks(client, { search: query, pageSize: PER_TYPE_LIMIT, page: 1 });
  return owned(rows, ownerId).map((row) => ({
    entityType: "task" as const,
    entityId: row.id,
    title: row.title,
    snippet: excerpt(
      `${row.status} · ${row.priority}`,
      row.due_at ? `due ${row.due_at.slice(0, 10)}` : null,
      row.description,
    ),
    occurredAt: row.due_at ?? row.updated_at ?? null,
    href: `/admin/tasks`,
  }));
}

/**
 * Calendar events and notes are queried here rather than through a data layer
 * because neither has a search-capable list function, and the Phase-2 layers are
 * frozen for this milestone. Both follow the same conventions as `lib/*.ts`:
 * archived rows excluded, owner asserted, bounded result.
 */
/**
 * Build a LIKE pattern safe to embed in a PostgREST filter expression.
 *
 * Two separate hazards. `%` and `_` are LIKE wildcards, so an unescaped one
 * silently widens the match. Commas, parentheses, dots and quotes are
 * structural in PostgREST's `or=(a.ilike.x,b.ilike.y)` grammar — an ordinary
 * query like `Acme (Berlin)` would produce a malformed filter, PostgREST would
 * reject it, and `safely()` would degrade that entire source to empty. Both
 * classes are stripped rather than escaped: this is a keyword search, and the
 * punctuation carries no meaning worth preserving.
 */
function likePattern(query: string): string {
  return `%${query.replace(/[%_\\,()."'{}:]/g, " ").replace(/\s+/g, " ").trim()}%`;
}

async function searchCalendarEvents(
  client: SupabaseClient,
  ownerId: string,
  query: string,
): Promise<RetrievedItem[]> {
  const pattern = likePattern(query);
  const { data, error } = await client
    .from("calendar_events")
    .select("id, title, description, location, starts_at, owner_id")
    .is("archived_at", null)
    .eq("owner_id", ownerId)
    .or(`title.ilike.${pattern},description.ilike.${pattern},location.ilike.${pattern}`)
    .order("starts_at", { ascending: false })
    .limit(PER_TYPE_LIMIT);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    entityType: "calendar_event" as const,
    entityId: row.id as string,
    title: (row.title as string | null)?.trim() || "(untitled event)",
    snippet: excerpt(row.location as string | null, row.description as string | null),
    occurredAt: (row.starts_at as string | null) ?? null,
    href: "/admin/calendar",
  }));
}

async function searchNotes(
  client: SupabaseClient,
  ownerId: string,
  query: string,
): Promise<RetrievedItem[]> {
  const pattern = likePattern(query);
  const { data, error } = await client
    .from("opportunity_notes")
    .select("id, body, opportunity_id, created_at, owner_id, opportunity:opportunities(title)")
    .is("archived_at", null)
    .eq("owner_id", ownerId)
    .ilike("body", pattern)
    .order("created_at", { ascending: false })
    .limit(PER_TYPE_LIMIT);
  if (error) throw error;

  return (data ?? []).map((row) => {
    // PostgREST types a many-to-one embed as an array; at runtime it is an object.
    const opportunity = row.opportunity as unknown as { title?: string } | null;
    return {
      entityType: "note" as const,
      entityId: row.id as string,
      title: opportunity?.title ? `Note on ${opportunity.title}` : "Note",
      snippet: excerpt(row.body as string | null),
      occurredAt: (row.created_at as string | null) ?? null,
      href: row.opportunity_id ? `/admin/opportunities/${row.opportunity_id}` : "/admin/opportunities",
    };
  });
}

const SEARCHERS: Record<
  RetrievalEntityType,
  (client: SupabaseClient, ownerId: string, query: string) => Promise<RetrievedItem[]>
> = {
  opportunity: searchOpportunities,
  company: searchCompanies,
  contact: searchContacts,
  message: searchMessages,
  task: searchTasks,
  calendar_event: searchCalendarEvents,
  note: searchNotes,
};

/**
 * Retrieve CRM context for a query.
 *
 * Sources are searched concurrently — they are independent reads, and doing them
 * in series would put seven round trips on the critical path of a streaming
 * answer the operator is watching arrive.
 */
export async function retrieve(
  client: SupabaseClient,
  ownerId: string,
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievedItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const types = options.types?.length ? options.types : RETRIEVAL_ENTITY_TYPES;
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

  const groups = await Promise.all(
    types
      .filter((type) => type in SEARCHERS)
      .map((type) => safely(type, () => SEARCHERS[type](client, ownerId, trimmed))),
  );

  return rank(groups, limit);
}
