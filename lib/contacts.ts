import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTACT_SORT_FIELDS,
  type Contact,
  type ContactInput,
  type ContactListFilters,
  type ContactListResult,
} from "@/types/contact";

/**
 * Contacts data layer (server-only). Mirrors lib/companies.ts. Accepts the
 * caller's session-bound Supabase client so RLS is enforced.
 */

const DEFAULT_PAGE_SIZE = 25;
const COMPANY_JOIN = "*, company:companies(id, name)";

/** Normalize an email for dedup/storage: trim + lowercase, blanks → null. */
export function normalizeEmail(value?: string | null): string | null {
  if (!value) return null;
  const t = value.trim().toLowerCase();
  return t === "" ? null : t;
}

function clean(value?: string | null): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function mapInput(input: ContactInput): Record<string, unknown> {
  return {
    full_name: input.full_name.trim(),
    email: normalizeEmail(input.email),
    phone: clean(input.phone),
    title: clean(input.title),
    department: clean(input.department),
    linkedin_url: clean(input.linkedin_url),
    location: clean(input.location),
    timezone: clean(input.timezone),
    company_id: input.company_id ? input.company_id : null,
    source: clean(input.source),
  };
}

export async function listContacts(
  supabase: SupabaseClient,
  filters: ContactListFilters = {},
): Promise<ContactListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("contacts").select(COMPANY_JOIN, { count: "exact" });

  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.source) query = query.eq("source", filters.source);

  const search = filters.search?.trim();
  if (search) {
    query = query.textSearch("search_vector", search, { type: "websearch", config: "english" });
  }

  const sort = CONTACT_SORT_FIELDS.includes(filters.sort as never) ? filters.sort! : "created_at";
  const ascending = filters.dir === "asc";

  query = query.order(sort, { ascending }).order("id", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as Contact[], total: count ?? 0, page, pageSize };
}

export async function getContact(supabase: SupabaseClient, id: string): Promise<Contact | null> {
  const { data, error } = await supabase.from("contacts").select(COMPANY_JOIN).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Contact) ?? null;
}

/** Active companies for the EntityPicker (never surfaces archived companies). */
export async function searchActiveCompanies(
  supabase: SupabaseClient,
  query: string,
): Promise<{ value: string; label: string; sublabel?: string }[]> {
  let q = supabase
    .from("companies")
    .select("id, name, domain")
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(20);

  const term = query.trim();
  if (term) q = q.ilike("name", `%${term}%`);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as { id: string; name: string; domain: string | null }[]).map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.domain ?? undefined,
  }));
}

/** Active companies as {id,name} for the list filter select. */
export async function listActiveCompaniesForFilter(
  supabase: SupabaseClient,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

/** Duplicate detection by normalized email, scoped to the owner. */
export async function findContactByEmail(
  supabase: SupabaseClient,
  email: string,
  ownerId: string,
  excludeId?: string,
): Promise<{ id: string; full_name: string } | null> {
  let query = supabase
    .from("contacts")
    .select("id, full_name")
    .eq("email", email)
    .eq("owner_id", ownerId);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return (data as { id: string; full_name: string }) ?? null;
}

export async function createContact(
  supabase: SupabaseClient,
  ownerId: string,
  input: ContactInput,
): Promise<Contact> {
  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...mapInput(input), owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as Contact;
}

export async function updateContact(
  supabase: SupabaseClient,
  id: string,
  input: ContactInput,
): Promise<Contact> {
  const { data, error } = await supabase
    .from("contacts")
    .update(mapInput(input))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Contact;
}

export async function setContactArchived(
  supabase: SupabaseClient,
  id: string,
  archived: boolean,
): Promise<Contact> {
  const { data, error } = await supabase
    .from("contacts")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Contact;
}
