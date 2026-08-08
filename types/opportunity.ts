/**
 * Opportunity domain types for the Career CRM (Phase 2, M3).
 * Mirrors the `opportunities`, `opportunity_contacts`, `opportunity_notes`,
 * and `opportunity_events` tables (see DATABASE_GUIDE.md).
 */

import type { BadgeVariant } from "@/components/admin/ui";
import type { TaskPriority } from "@/types/task";

/**
 * Pipeline stages, in the same order as the `opportunity_stage` enum in
 * Postgres (declaration order is the enum's sort order). Phase 1 of Career
 * Intelligence spliced the pre-application, assessment, interview-round,
 * negotiation and ghosted stages into their pipeline positions; no pre-existing
 * value was renamed or removed.
 *
 * `accepted` is the candidate accepting an offer; `hired` remains the terminal
 * "started the role" state.
 */
export const OPPORTUNITY_STAGES = [
  "draft",
  "prepared",
  "lead",
  "applied",
  "assessment",
  "screening",
  "interview",
  "interview_round_1",
  "interview_round_2",
  "interview_round_3",
  "final_interview",
  "offer",
  "negotiation",
  "accepted",
  "hired",
  "rejected",
  "ghosted",
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

/** Stages whose label `humanize` alone would render awkwardly. */
const STAGE_LABELS: Partial<Record<OpportunityStage, string>> = {
  interview_round_1: "Interview Round 1",
  interview_round_2: "Interview Round 2",
  interview_round_3: "Interview Round 3",
  final_interview: "Final Interview",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as OpportunityStage] ?? humanize(stage);
}

export function stageBadgeVariant(stage: OpportunityStage): BadgeVariant {
  switch (stage) {
    case "hired":
    case "accepted":
      return "success";
    case "offer":
    case "negotiation":
      return "special";
    case "interview":
    case "interview_round_1":
    case "interview_round_2":
    case "interview_round_3":
    case "final_interview":
    case "assessment":
      return "progress";
    case "applied":
    case "screening":
      return "info";
    case "rejected":
    case "ghosted":
      return "danger";
    default:
      return "neutral"; // draft, prepared, lead, withdrawn, on_hold
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
  /** Career Intelligence Phase 1 — pursuit planning and outcome dates. */
  deadline_at: string | null;
  priority: TaskPriority | null;
  offer_at: string | null;
  rejected_at: string | null;
  /**
   * Fit scores for this (resume, role) pair, 0-100. They live on the
   * opportunity rather than the resume version because both describe the fit of
   * a resume to *this* role, not the resume in isolation.
   */
  resume_score: number | null;
  ats_score: number | null;
  /** Which resume / cover letter revision was submitted for this role. */
  resume_version_id: string | null;
  cover_letter_version_id: string | null;
  /** AI rollup + its provenance (Phase 3 · M7). Null until summarized. */
  ai_summary: string | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  ai_confidence: number | null;
  ai_processed_at: string | null;
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
  deadline_at?: string | null;
  priority?: string | null;
  offer_at?: string | null;
  rejected_at?: string | null;
  resume_score?: string | null;
  ats_score?: string | null;
  resume_version_id?: string | null;
  cover_letter_version_id?: string | null;
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
