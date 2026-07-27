/**
 * Opportunity domain types for the Career CRM (Phase 2, M3).
 * Mirrors the `opportunities`, `opportunity_contacts`, `opportunity_notes`,
 * and `opportunity_events` tables (see DATABASE_GUIDE.md).
 */

import type { BadgeVariant } from "@/components/admin/ui";

export const OPPORTUNITY_STAGES = [
  "lead",
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
  "on_hold",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
  "freelance",
  "other",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const LOCATION_TYPES = ["remote", "hybrid", "onsite"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}

export function stageLabel(stage: string): string {
  return humanize(stage);
}

export function stageBadgeVariant(stage: OpportunityStage): BadgeVariant {
  switch (stage) {
    case "hired":
      return "success";
    case "offer":
      return "special";
    case "interview":
      return "progress";
    case "applied":
    case "screening":
      return "info";
    case "rejected":
      return "danger";
    default:
      return "neutral"; // lead, withdrawn, on_hold
  }
}

export interface LinkedCompany {
  id: string;
  name: string;
}
export interface LinkedContact {
  id: string;
  full_name: string;
  title?: string | null;
}

export interface Opportunity {
  id: string;
  company_id: string | null;
  primary_contact_id: string | null;
  integration_account_id: string | null;
  title: string;
  stage: OpportunityStage;
  source: string | null;
  external_job_id: string | null;
  external_ids: Record<string, unknown>;
  job_url: string | null;
  location: string | null;
  location_type: LocationType | null;
  employment_type: EmploymentType | null;
  seniority: string | null;
  work_authorization: string | null;
  application_method: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  applied_at: string | null;
  next_action_at: string | null;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  company?: LinkedCompany | null;
  primary_contact?: LinkedContact | null;
}

export interface OpportunityInput {
  title: string;
  stage?: string | null;
  company_id?: string | null;
  primary_contact_id?: string | null;
  source?: string | null;
  job_url?: string | null;
  location?: string | null;
  location_type?: string | null;
  employment_type?: string | null;
  seniority?: string | null;
  work_authorization?: string | null;
  application_method?: string | null;
  salary_min?: string | null;
  salary_max?: string | null;
  salary_currency?: string | null;
  applied_at?: string | null;
  next_action_at?: string | null;
}

export interface OpportunityContactLink {
  id: string;
  contact_id: string;
  role: string | null;
  contact: LinkedContact | null;
}

export interface OpportunityNote {
  id: string;
  body: string;
  author_id: string | null;
  created_at: string;
}

export interface OpportunityEvent {
  id: string;
  event_type: string;
  actor_type: string;
  detail: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const OPPORTUNITY_SORT_FIELDS = ["title", "stage", "next_action_at", "created_at", "updated_at"] as const;
export type OpportunitySortField = (typeof OPPORTUNITY_SORT_FIELDS)[number];

export interface OpportunityListFilters {
  search?: string;
  stage?: string;
  companyId?: string;
  source?: string;
  includeArchived?: boolean;
  sort?: OpportunitySortField;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface OpportunityListResult {
  rows: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
}
