/**
 * Career Intelligence domain types (Phase 1).
 *
 * Mirrors the tables added by
 * `supabase/migrations/20260807090000_career_intelligence.sql`:
 * `resume_versions`, `cover_letter_versions`, `documents`, `tags`, `taggables`.
 *
 * These extend the Career CRM — they do not replace any of it. Applications
 * remain `opportunities` (see `types/opportunity.ts`), companies remain
 * `companies`, and recruiters remain `contacts`.
 */

export const DOCUMENT_KINDS = [
  "resume",
  "cover_letter",
  "job_description",
  "offer_letter",
  "assessment",
  "portfolio",
  "certificate",
  "correspondence",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * Entities a tag can be attached to. Must stay in sync with the
 * `taggables_entity_type_check` constraint.
 */
export const TAGGABLE_ENTITY_TYPES = [
  "opportunity",
  "company",
  "contact",
  "document",
  "resume_version",
  "cover_letter_version",
  "message",
] as const;
export type TaggableEntityType = (typeof TAGGABLE_ENTITY_TYPES)[number];

/** Columns shared by every AI-touchable row in the Career CRM. */
export interface AiProvenance {
  ai_model: string | null;
  ai_prompt_version: string | null;
  ai_confidence: number | null;
  ai_processed_at: string | null;
}

/** Columns shared by every ingestable row (see migration conventions). */
export interface OwnedRow {
  external_ids: Record<string, unknown>;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * One revision of a document lineage. Rows sharing `lineage_id` are the
 * version history of a single resume/cover letter; exactly one is `is_current`.
 */
export interface DocumentVersionBase extends AiProvenance, OwnedRow {
  id: string;
  lineage_id: string;
  version: number;
  is_current: boolean;
  label: string;
  summary: string | null;
  content_text: string | null;
  file_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  source: string | null;
}

export type ResumeVersion = DocumentVersionBase;

export interface CoverLetterVersion extends DocumentVersionBase {
  /** Null when the letter is a reusable template rather than role-specific. */
  opportunity_id: string | null;
}

export interface CareerDocument extends AiProvenance, OwnedRow {
  id: string;
  opportunity_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  kind: DocumentKind;
  title: string;
  description: string | null;
  file_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  content_text: string | null;
  source: string | null;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Taggable {
  id: string;
  tag_id: string;
  entity_type: TaggableEntityType;
  entity_id: string;
  metadata: Record<string, unknown>;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export function documentKindLabel(kind: string): string {
  return kind.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}

/** `slug` is unique per owner; normalize the same way everywhere it is set. */
export function tagSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
