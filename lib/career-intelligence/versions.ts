import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoverLetterVersion, ResumeVersion } from "@/types/career-intelligence";

/**
 * Resume / cover letter version history (server-only).
 *
 * The version model: every revision is a row. Rows sharing a `lineage_id` are
 * one document's history, numbered by `version`, and exactly one of them is
 * `is_current` — enforced in Postgres by the partial unique index
 * `<table>_lineage_current_uniq`, so "the current resume" is a query rather than
 * a mutable pointer that can drift out of sync with the rows.
 *
 * Both tables have an identical shape, so the helpers are written once and
 * parameterized by table name rather than duplicated.
 */

type VersionTable = "resume_versions" | "cover_letter_versions";

export interface NewVersionInput {
  label: string;
  summary?: string | null;
  contentText?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  source?: string | null;
  /** Cover letters only; ignored by resume_versions. */
  opportunityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Compute the row for the next revision in a lineage.
 *
 * Pure so the numbering rule is testable without a database: a brand-new
 * lineage starts at version 1, and an existing one continues from the highest
 * version seen — not from the row count, which would collide after a delete.
 */
export function nextVersionNumber(existingVersions: readonly number[]): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

/** Every revision in a lineage, newest first. */
export async function getVersionHistory<T extends ResumeVersion | CoverLetterVersion>(
  supabase: SupabaseClient,
  table: VersionTable,
  lineageId: string,
): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("lineage_id", lineageId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

/** The current revision of every lineage, newest first. */
export async function listCurrentVersions<T extends ResumeVersion | CoverLetterVersion>(
  supabase: SupabaseClient,
  table: VersionTable,
): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("is_current", true)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

/**
 * Append a revision to a lineage and make it current.
 *
 * ponytail: the demote-then-insert pair is not wrapped in a transaction —
 * supabase-js cannot open one from the client. The partial unique index is the
 * real guarantee: two concurrent appends cannot both end up current, the loser
 * gets a constraint violation and can retry. Upgrade path if concurrent edits
 * become common: move this into a Postgres function and call it via rpc().
 */
export async function appendVersion<T extends ResumeVersion | CoverLetterVersion>(
  supabase: SupabaseClient,
  table: VersionTable,
  lineageId: string | null,
  input: NewVersionInput,
  ownerId: string,
): Promise<T> {
  let version = 1;
  let lineage = lineageId;

  if (lineage) {
    const { data, error } = await supabase.from(table).select("version").eq("lineage_id", lineage);
    if (error) throw error;
    version = nextVersionNumber((data ?? []).map((r) => (r as { version: number }).version));

    const { error: demoteError } = await supabase
      .from(table)
      .update({ is_current: false })
      .eq("lineage_id", lineage)
      .eq("is_current", true);
    if (demoteError) throw demoteError;
  } else {
    lineage = crypto.randomUUID();
  }

  const row: Record<string, unknown> = {
    lineage_id: lineage,
    version,
    is_current: true,
    label: input.label.trim(),
    summary: input.summary ?? null,
    content_text: input.contentText ?? null,
    file_url: input.fileUrl ?? null,
    file_name: input.fileName ?? null,
    mime_type: input.mimeType ?? null,
    file_size_bytes: input.fileSizeBytes ?? null,
    source: input.source ?? null,
    metadata: input.metadata ?? {},
    owner_id: ownerId,
  };

  if (table === "cover_letter_versions") {
    row.opportunity_id = input.opportunityId ?? null;
  }

  const { data, error } = await supabase.from(table).insert(row).select("*").single();
  if (error) throw error;
  return data as T;
}
