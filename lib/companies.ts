import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMPANY_SORT_FIELDS,
  type Company,
  type CompanyInput,
  type CompanyListFilters,
  type CompanyListResult,
} from "@/types/company";

/**
 * Companies data layer. Every query/mutation the Companies module needs lives
 * here (server-only), accepting the caller's session-bound Supabase client so
 * RLS is always enforced. Mirrors the pattern in lib/inquiries.ts.
 */

const DEFAULT_PAGE_SIZE = 25;

/** Normalize a domain for dedup: lowercase, strip protocol/www/path. */
export function normalizeDomain(value?: string | null): string | null {
  if (!value) return null;
  let d = value.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0];
  return d || null;
}

/** Trim a string field; convert blanks to null. */
function clean(value?: string | null): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function mapInput(input: CompanyInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    domain: normalizeDomain(input.domain),
    website: clean(input.website),
    linkedin_url: clean(input.linkedin_url),
    careers_url: clean(input.careers_url),
    industry: clean(input.industry),
    employee_range: clean(input.employee_range),
    headquarters: clean(input.headquarters),
    country: clean(input.country),
    description: clean(input.description),
  };
}

export async function listCompanies(
  supabase: SupabaseClient,
  filters: CompanyListFilters = {},
): Promise<CompanyListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("companies").select("*", { count: "exact" });

  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.industry) query = query.eq("industry", filters.industry);
  if (filters.country) query = query.eq("country", filters.country);

  const search = filters.search?.trim();
  if (search) {
    query = query.textSearch("search_vector", search, { type: "websearch", config: "english" });
  }

  const sort = COMPANY_SORT_FIELDS.includes(filters.sort as never) ? filters.sort! : "created_at";
  const ascending = filters.dir === "asc";

  query = query.order(sort, { ascending }).order("id", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as Company[], total: count ?? 0, page, pageSize };
}

export async function getCompany(supabase: SupabaseClient, id: string): Promise<Company | null> {
  const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Company) ?? null;
}

/** Read-only counts of related records for the detail page. */
export async function getCompanyRelationCounts(
  supabase: SupabaseClient,
  id: string,
): Promise<{ contacts: number; opportunities: number }> {
  const [contacts, opportunities] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("company_id", id).is("archived_at", null),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id)
      .is("archived_at", null),
  ]);
  return { contacts: contacts.count ?? 0, opportunities: opportunities.count ?? 0 };
}

/** Distinct industry/country values to populate list filters. */
export async function getCompanyFacets(
  supabase: SupabaseClient,
): Promise<{ industries: string[]; countries: string[] }> {
  const { data, error } = await supabase
    .from("companies")
    .select("industry, country")
    .is("archived_at", null)
    .limit(1000);
  if (error) throw error;

  const industries = new Set<string>();
  const countries = new Set<string>();
  for (const row of (data ?? []) as { industry: string | null; country: string | null }[]) {
    if (row.industry) industries.add(row.industry);
    if (row.country) countries.add(row.country);
  }
  return {
    industries: [...industries].sort(),
    countries: [...countries].sort(),
  };
}

/** Duplicate detection by normalized domain. */
export async function findCompanyByDomain(
  supabase: SupabaseClient,
  domain: string,
  excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  let query = supabase.from("companies").select("id, name").eq("domain", domain);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return (data as { id: string; name: string }) ?? null;
}

export async function createCompany(
  supabase: SupabaseClient,
  ownerId: string,
  input: CompanyInput,
): Promise<Company> {
  const { data, error } = await supabase
    .from("companies")
    .insert({ ...mapInput(input), owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as Company;
}

export async function updateCompany(
  supabase: SupabaseClient,
  id: string,
  input: CompanyInput,
): Promise<Company> {
  const { data, error } = await supabase
    .from("companies")
    .update(mapInput(input))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Company;
}

export async function setCompanyArchived(
  supabase: SupabaseClient,
  id: string,
  archived: boolean,
): Promise<Company> {
  const { data, error } = await supabase
    .from("companies")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Company;
}
