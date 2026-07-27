/**
 * Contact domain types for the Career CRM (Phase 2, M2).
 * Mirrors the `contacts` table (see supabase/migrations + DATABASE_GUIDE.md).
 */

/** integration_provider enum values (shared source of origin). */
export const INTEGRATION_PROVIDERS = [
  "gmail",
  "linkedin",
  "wellfound",
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "indeed",
  "company_portal",
  "manual",
  "other",
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

/** Human-friendly label for a provider/source value. */
export function providerLabel(p: string): string {
  if (p === "linkedin") return "LinkedIn";
  return p.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}

/** Minimal company shape joined onto a contact row. */
export interface LinkedCompany {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  company_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  department: string | null;
  linkedin_url: string | null;
  location: string | null;
  timezone: string | null;
  avatar_url: string | null;
  source: IntegrationProvider | null;
  external_ids: Record<string, unknown>;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Present when the query joins the company (list/detail). */
  company?: LinkedCompany | null;
}

/** User-editable fields for create/edit. */
export interface ContactInput {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  timezone?: string | null;
  company_id?: string | null;
  source?: string | null;
}

/** Sortable columns (whitelist — all backed by an index). */
export const CONTACT_SORT_FIELDS = ["full_name", "created_at", "updated_at"] as const;
export type ContactSortField = (typeof CONTACT_SORT_FIELDS)[number];

export interface ContactListFilters {
  search?: string;
  companyId?: string;
  source?: string;
  includeArchived?: boolean;
  sort?: ContactSortField;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ContactListResult {
  rows: Contact[];
  total: number;
  page: number;
  pageSize: number;
}
