/**
 * Company domain types for the Career CRM (Phase 2, M1).
 * Mirrors the `companies` table (see supabase/migrations + DATABASE_GUIDE.md).
 */

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  linkedin_url: string | null;
  careers_url: string | null;
  industry: string | null;
  employee_range: string | null;
  headquarters: string | null;
  country: string | null;
  description: string | null;
  logo_url: string | null;
  external_ids: Record<string, unknown>;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** User-editable fields for create/edit. */
export interface CompanyInput {
  name: string;
  domain?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
  careers_url?: string | null;
  industry?: string | null;
  employee_range?: string | null;
  headquarters?: string | null;
  country?: string | null;
  description?: string | null;
}

/** Sortable columns (whitelist — all backed by an index). */
export const COMPANY_SORT_FIELDS = ["name", "created_at", "updated_at"] as const;
export type CompanySortField = (typeof COMPANY_SORT_FIELDS)[number];

/** Suggested employee-range bands (free-form column; these seed the Select). */
export const COMPANY_EMPLOYEE_RANGES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5000+",
] as const;

export interface CompanyListFilters {
  search?: string;
  industry?: string;
  country?: string;
  includeArchived?: boolean;
  sort?: CompanySortField;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface CompanyListResult {
  rows: Company[];
  total: number;
  page: number;
  pageSize: number;
}
