import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DOCUMENT_KINDS,
  type CareerDocument,
  type DocumentKind,
} from "@/types/career-intelligence";

/**
 * Documents data layer (server-only).
 *
 * Follows the lib/companies + lib/opportunities conventions: the caller passes
 * a Supabase client, filters are validated here, and RLS does the authorization.
 *
 * Scope note: this is the opportunity/company/contact-scoped document store
 * added by the Career Intelligence migration. Message attachments remain in
 * `message_attachments` and are owned by lib/messages — the two are not merged,
 * because an attachment cascades with its message and a document does not.
 */

const DEFAULT_PAGE_SIZE = 25;
const SELECT =
  "*, opportunity:opportunities(id, title), company:companies(id, name), contact:contacts(id, full_name)";

export const DOCUMENT_SORT_FIELDS = ["title", "kind", "created_at", "updated_at"] as const;
export type DocumentSortField = (typeof DOCUMENT_SORT_FIELDS)[number];

export interface DocumentListFilters {
  search?: string;
  kind?: string;
  opportunityId?: string;
  companyId?: string;
  contactId?: string;
  includeArchived?: boolean;
  sort?: DocumentSortField;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface DocumentRow extends CareerDocument {
  opportunity?: { id: string; title: string } | null;
  company?: { id: string; name: string } | null;
  contact?: { id: string; full_name: string } | null;
}

export interface DocumentListResult {
  rows: DocumentRow[];
  total: number;
  page: number;
  pageSize: number;
}

function validKind(kind?: string | null): DocumentKind | null {
  return DOCUMENT_KINDS.includes(kind as never) ? (kind as DocumentKind) : null;
}

export async function listDocuments(
  supabase: SupabaseClient,
  filters: DocumentListFilters = {},
): Promise<DocumentListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("documents").select(SELECT, { count: "exact" });

  if (!filters.includeArchived) query = query.is("archived_at", null);

  const kind = validKind(filters.kind);
  if (kind) query = query.eq("kind", kind);
  if (filters.opportunityId) query = query.eq("opportunity_id", filters.opportunityId);
  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.contactId) query = query.eq("contact_id", filters.contactId);

  const search = filters.search?.trim();
  if (search) {
    query = query.textSearch("search_vector", search, { type: "websearch", config: "english" });
  }

  const sort = DOCUMENT_SORT_FIELDS.includes(filters.sort as never) ? filters.sort! : "created_at";
  const ascending = filters.dir === "asc";

  query = query.order(sort, { ascending }).order("id", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as DocumentRow[], total: count ?? 0, page, pageSize };
}

export async function getDocument(
  supabase: SupabaseClient,
  id: string,
): Promise<DocumentRow | null> {
  const { data, error } = await supabase.from("documents").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as DocumentRow) ?? null;
}

/** Documents filed against one opportunity, newest first. */
export async function listDocumentsForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string,
): Promise<CareerDocument[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CareerDocument[];
}
