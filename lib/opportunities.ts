import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitAutomationEvent } from "@/lib/automation/emit";
import {
  EMPLOYMENT_TYPES,
  LOCATION_TYPES,
  OPPORTUNITY_SORT_FIELDS,
  OPPORTUNITY_STAGES,
  humanize,
  type Opportunity,
  type OpportunityContactLink,
  type OpportunityEvent,
  type OpportunityInput,
  type OpportunityListFilters,
  type OpportunityListResult,
  type OpportunityNote,
  type OpportunityStage,
} from "@/types/opportunity";
import { TASK_PRIORITIES, type TaskPriority } from "@/types/task";
import {
  maxLength,
  oneOf,
  optional,
  required,
  url,
  validate,
  type Schema,
  type Validator,
} from "@/lib/validation";

/**
 * Opportunities data layer (server-only). Reuses lib/companies + lib/contacts
 * conventions. Also owns the opportunity_events / opportunity_notes /
 * opportunity_contacts helpers, and reuses the Contacts module's active-company
 * search (read-only) so no other module is modified.
 */
export { searchActiveCompanies, listActiveCompaniesForFilter } from "@/lib/contacts";

const DEFAULT_PAGE_SIZE = 25;
const SELECT =
  "*, company:companies(id, name), primary_contact:contacts(id, full_name, title)";

/**
 * Query parameters that identify *how someone arrived*, never *which posting
 * this is*. Stripped before comparison so the same job shared from a LinkedIn
 * feed, an email alert and a recruiter's link resolves to one opportunity.
 *
 * This is deliberately a denylist rather than an allowlist. Job boards carry
 * meaningful identifiers in the query string — Indeed's `vjk`, Greenhouse's
 * `gh_jid`, LinkedIn's `currentJobId` — and dropping an unrecognised parameter
 * would silently merge two different roles into one. An unknown parameter is
 * therefore kept, which at worst leaves a duplicate to notice rather than a
 * posting that was never saved.
 *
 * Compared lowercase; `utm_*` is matched by prefix.
 */
const TRACKING_PARAMS = new Set([
  "ref", "refid", "trk", "trkinfo", "trackingid", "src", "source", "from",
  "origin", "originalsubdomain", "position", "pagenum", "savedsearchid",
  "recommendedflavor", "gh_src", "lever-source", "lever-origin",
  "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "_ga", "_gl",
]);

/**
 * Canonical form of a job posting URL, for duplicate detection.
 *
 * The same posting reaches you spelled several ways — with and without `www.`,
 * with a trailing slash, with a `#section` fragment, and above all with a
 * different tracking parameter every time it is shared. Comparing raw strings
 * treats all of those as distinct postings, which is how a pipeline fills up
 * with four copies of one job.
 *
 * The result stays a working link: only the fragment and known tracking
 * parameters are removed, so it can be stored in `job_url` directly rather than
 * shadowed in a second column that can drift out of step with the first.
 *
 * Returns null for blank input, and the trimmed original for anything that does
 * not parse as a URL — a value that cannot be normalized must still be storable,
 * because refusing to save a job over a malformed link would be worse than not
 * deduplicating it.
 */
export function normalizeJobUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  // Only web URLs are normalized. Anything else (mailto:, javascript:, file:)
  // is returned as-is rather than being rewritten into something it is not.
  if (url.protocol !== "http:" && url.protocol !== "https:") return trimmed;

  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      url.searchParams.delete(key);
    }
  }
  // Order is not meaning: ?a=1&b=2 and ?b=2&a=1 are the same page.
  url.searchParams.sort();

  // A trailing slash is a spelling, not a different page — except at the root,
  // where removing it produces a URL with no path at all.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

/**
 * The rules for writing an opportunity, in one place.
 *
 * Two callers create opportunities: the admin form (a Server Action) and the
 * capture extension (a route handler). They authenticate differently and render
 * failures differently, but the rules for what may be written — required
 * fields, field bounds, and "is this posting already tracked" — must be
 * identical, or the extension becomes a way to put rows into the database that
 * the form would have rejected.
 *
 * Kept here rather than in the action that used to own it so neither caller is
 * the owner and neither can drift.
 */
const numericIfPresent: Validator = (v) =>
  v == null || v === "" || Number.isFinite(Number(v)) ? null : "Enter a number";

export const opportunitySchema: Schema<OpportunityInput> = {
  title: [required("Title is required"), maxLength(200)],
  job_url: [optional(url("Enter a valid URL (including https://)"))],
  source: [optional(maxLength(40))],
  location: [optional(maxLength(160))],
  location_type: [optional(oneOf(LOCATION_TYPES, "Invalid location type"))],
  employment_type: [optional(oneOf(EMPLOYMENT_TYPES, "Invalid employment type"))],
  seniority: [optional(maxLength(80))],
  work_authorization: [optional(maxLength(120))],
  application_method: [optional(maxLength(80))],
  salary_min: [numericIfPresent],
  salary_max: [numericIfPresent],
  salary_currency: [optional(maxLength(8))],
  // Generous, because a real posting can be long and a truncated description is
  // worse than none — but bounded, because this text arrives from a browser
  // extension and an unbounded field reachable from a page is an unbounded row.
  job_description: [optional(maxLength(60_000))],
};

/**
 * The message shown when a posting is already tracked.
 *
 * Names the existing opportunity and its stage, because "this is a duplicate"
 * is not actionable on its own — what the person needs to know is which record
 * to look at, and whether they have already applied to it.
 */
export function duplicateJobUrlMessage(existing: {
  title: string;
  stage: OpportunityStage;
  archived_at: string | null;
}): string {
  const where = existing.archived_at ? "archived" : humanize(existing.stage).toLowerCase();
  return `Already tracked as "${existing.title}" (${where}). Open that opportunity instead of creating a second one.`;
}

/**
 * Why the failure arm is a named type, and why callers cast to it.
 *
 * This project compiles with `strict: false`, and with `strictNullChecks` off
 * TypeScript will not narrow a union on a BOOLEAN discriminant — `if (result.ok)`
 * leaves the type exactly as it was. STRING literal discriminants still narrow,
 * which is why `reason` works once the success arm has been cast away.
 *
 * So the shape is: check `ok` for control flow, cast once to this type, then let
 * `reason` narrow normally. The existing actions hit the same wall and solve it
 * the same way (`result.fieldErrors as Record<string, string>` in
 * lib/validation's callers). Do not delete the cast expecting inference to cover
 * it — it will compile as `any` and the branches will silently stop being checked.
 */
export type CreateOpportunityFailure =
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> }
  | {
      ok: false;
      reason: "duplicate";
      duplicate: { id: string; title: string; stage: OpportunityStage; archived_at: string | null };
    };

export type CreateOpportunityResult = { ok: true; id: string } | CreateOpportunityFailure;

/**
 * Validate, reject duplicates, then create. The whole write path for both
 * callers.
 *
 * Returns the duplicate itself on collision, not merely an error string: the
 * extension needs the id to offer "open the one you already have", which is the
 * only useful thing to do at that point.
 */
export async function createOpportunityChecked(
  supabase: SupabaseClient,
  ownerId: string,
  input: OpportunityInput,
): Promise<CreateOpportunityResult> {
  const result = validate(input, opportunitySchema);
  if (!result.ok) {
    return { ok: false, reason: "invalid", fieldErrors: result.fieldErrors as Record<string, string> };
  }

  // Checked before the insert rather than relied on afterwards: there is no
  // unique index on job_url, because re-applying to the same role in a later
  // cycle is legitimate and a database constraint could not tell the two apart.
  if (input.job_url) {
    const duplicate = await findOpportunityByJobUrl(supabase, input.job_url);
    if (duplicate) return { ok: false, reason: "duplicate", duplicate };
  }

  const created = await createOpportunity(supabase, ownerId, input);
  return { ok: true, id: created.id };
}

/**
 * An existing opportunity for this posting, if there is one.
 *
 * Matches on the normalized URL *and* on the raw string. The second is what
 * catches rows saved before normalization existed: those hold whatever URL was
 * pasted, tracking parameters and all, so a normalized-only comparison would
 * miss them.
 *
 * Archived opportunities are included on purpose. "You already tracked this and
 * archived it" is the answer the person needs; silently creating a second row
 * would hide the decision they already made about this role.
 */
export async function findOpportunityByJobUrl(
  supabase: SupabaseClient,
  jobUrl: string,
  excludeId?: string,
): Promise<{ id: string; title: string; stage: OpportunityStage; archived_at: string | null } | null> {
  const normalized = normalizeJobUrl(jobUrl);
  if (!normalized) return null;

  const candidates = [...new Set([normalized, jobUrl.trim()])];

  let query = supabase
    .from("opportunities")
    .select("id, title, stage, archived_at")
    .in("job_url", candidates);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return (data as { id: string; title: string; stage: OpportunityStage; archived_at: string | null }) ?? null;
}

function clean(value?: string | null): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function toNumber(value?: string | null): number | null {
  const t = clean(value);
  if (t == null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function validStage(stage?: string | null): OpportunityStage {
  return OPPORTUNITY_STAGES.includes(stage as never) ? (stage as OpportunityStage) : "lead";
}

/** Unrecognized priorities become null rather than a Postgres enum error. */
function validPriority(priority?: string | null): TaskPriority | null {
  return TASK_PRIORITIES.includes(priority as never) ? (priority as TaskPriority) : null;
}

/**
 * Scores are CHECK-constrained to 0-100 in Postgres. Clamping here turns a
 * bad client value into a stored bound instead of a 500 from the database.
 */
function toScore(value?: string | null): number | null {
  const n = toNumber(value);
  if (n == null) return null;
  return Math.min(100, Math.max(0, n));
}

/**
 * Editable columns, excluding `stage` (stage changes go through changeStage).
 *
 * Only columns the caller actually supplied are emitted. `updateOpportunity`
 * writes this object wholesale, so any key present here overwrites its column —
 * and a partial payload would silently null everything it omitted. The
 * opportunity form is exactly such a payload: it carries only the fields it
 * renders, so without this an edit to the title would erase deadline_at,
 * priority, resume_score, ats_score, offer_at, rejected_at and both version
 * links.
 *
 * `undefined` means "not part of this edit" and is dropped; `null` and "" still
 * mean "clear this column" and are written. That distinction is the whole point.
 *
 * Relies on every emitted column name matching its `OpportunityInput` key. A
 * future column whose name diverges from its input key must not use this path.
 */
function mapInput(input: OpportunityInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    title: input.title.trim(),
    company_id: input.company_id || null,
    primary_contact_id: input.primary_contact_id || null,
    source: clean(input.source),
    job_url: normalizeJobUrl(input.job_url),
    location: clean(input.location),
    location_type: input.location_type || null,
    employment_type: input.employment_type || null,
    seniority: clean(input.seniority),
    work_authorization: clean(input.work_authorization),
    application_method: clean(input.application_method),
    salary_min: toNumber(input.salary_min),
    salary_max: toNumber(input.salary_max),
    salary_currency: clean(input.salary_currency) ?? "USD",
    applied_at: clean(input.applied_at),
    next_action_at: clean(input.next_action_at),
    job_description: clean(input.job_description),
    deadline_at: clean(input.deadline_at),
    priority: validPriority(input.priority),
    offer_at: clean(input.offer_at),
    rejected_at: clean(input.rejected_at),
    resume_score: toScore(input.resume_score),
    ats_score: toScore(input.ats_score),
    resume_version_id: input.resume_version_id || null,
    cover_letter_version_id: input.cover_letter_version_id || null,
  };

  for (const column of Object.keys(row)) {
    if (input[column as keyof OpportunityInput] === undefined) delete row[column];
  }
  return row;
}

async function insertEvent(
  supabase: SupabaseClient,
  opts: {
    opportunityId: string;
    eventType: string;
    ownerId: string;
    detail?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("opportunity_events").insert({
    opportunity_id: opts.opportunityId,
    event_type: opts.eventType,
    actor_type: "user",
    actor_id: opts.ownerId,
    detail: opts.detail ?? null,
    metadata: opts.metadata ?? {},
    owner_id: opts.ownerId,
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listOpportunities(
  supabase: SupabaseClient,
  filters: OpportunityListFilters = {},
): Promise<OpportunityListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("opportunities").select(SELECT, { count: "exact" });

  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.stage) query = query.eq("stage", filters.stage);
  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.source) query = query.eq("source", filters.source);

  const search = filters.search?.trim();
  if (search) query = query.textSearch("search_vector", search, { type: "websearch", config: "english" });

  const sort = OPPORTUNITY_SORT_FIELDS.includes(filters.sort as never) ? filters.sort! : "created_at";
  const ascending = filters.dir === "asc";
  query = query.order(sort, { ascending, nullsFirst: false }).order("id", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Opportunity[], total: count ?? 0, page, pageSize };
}

/** Active opportunities for the Kanban board (filtered, capped). */
export async function getPipeline(
  supabase: SupabaseClient,
  filters: OpportunityListFilters = {},
): Promise<Opportunity[]> {
  let query = supabase.from("opportunities").select(SELECT).is("archived_at", null);
  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.source) query = query.eq("source", filters.source);
  const search = filters.search?.trim();
  if (search) query = query.textSearch("search_vector", search, { type: "websearch", config: "english" });
  query = query.order("next_action_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Opportunity[];
}

export async function getOpportunity(supabase: SupabaseClient, id: string): Promise<Opportunity | null> {
  const { data, error } = await supabase.from("opportunities").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Opportunity) ?? null;
}

export async function getOpportunityContacts(supabase: SupabaseClient, id: string): Promise<OpportunityContactLink[]> {
  const { data, error } = await supabase
    .from("opportunity_contacts")
    .select("id, contact_id, role, contact:contacts(id, full_name, title)")
    .eq("opportunity_id", id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OpportunityContactLink[];
}

export async function getOpportunityNotes(supabase: SupabaseClient, id: string): Promise<OpportunityNote[]> {
  const { data, error } = await supabase
    .from("opportunity_notes")
    .select("id, body, author_id, created_at")
    .eq("opportunity_id", id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OpportunityNote[];
}

export async function getOpportunityEvents(supabase: SupabaseClient, id: string): Promise<OpportunityEvent[]> {
  const { data, error } = await supabase
    .from("opportunity_events")
    .select("id, event_type, actor_type, detail, metadata, created_at")
    .eq("opportunity_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as OpportunityEvent[];
}

/** Active contacts for the EntityPicker (never surfaces archived contacts). */
export async function searchActiveContacts(
  supabase: SupabaseClient,
  query: string,
): Promise<{ value: string; label: string; sublabel?: string }[]> {
  let q = supabase
    .from("contacts")
    .select("id, full_name, title")
    .is("archived_at", null)
    .order("full_name", { ascending: true })
    .limit(20);
  const term = query.trim();
  if (term) q = q.ilike("full_name", `%${term}%`);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as { id: string; full_name: string; title: string | null }[]).map((c) => ({
    value: c.id,
    label: c.full_name,
    sublabel: c.title ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Mutations (each logs an opportunity_event where meaningful)
// ---------------------------------------------------------------------------

export async function createOpportunity(
  supabase: SupabaseClient,
  ownerId: string,
  input: OpportunityInput,
): Promise<Opportunity> {
  const stage = validStage(input.stage);
  const { data, error } = await supabase
    .from("opportunities")
    .insert({ ...mapInput(input), stage, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  const created = data as Opportunity;
  await insertEvent(supabase, {
    opportunityId: created.id,
    eventType: "created",
    ownerId,
    detail: `Created at stage “${stage}”`,
    metadata: { stage },
  });

  await emitAutomationEvent(supabase, {
    type: "opportunity.created",
    ownerId,
    entityType: "opportunity",
    entityId: created.id,
    entity: {
      opportunity: {
        id: created.id,
        stage: created.stage,
        title: created.title,
        source: created.source,
        location: created.location,
        location_type: created.location_type,
        employment_type: created.employment_type,
        seniority: created.seniority,
        applied_at: created.applied_at,
        next_action_at: created.next_action_at,
      },
    },
  });

  return created;
}

export async function updateOpportunity(
  supabase: SupabaseClient,
  id: string,
  input: OpportunityInput,
): Promise<Opportunity> {
  const { data, error } = await supabase.from("opportunities").update(mapInput(input)).eq("id", id).select().single();
  if (error) throw error;
  return data as Opportunity;
}

export async function changeStage(
  supabase: SupabaseClient,
  id: string,
  toStage: OpportunityStage,
  ownerId: string,
): Promise<Opportunity> {
  const { data: current, error: readErr } = await supabase.from("opportunities").select("stage").eq("id", id).single();
  if (readErr) throw readErr;
  const fromStage = (current as { stage: OpportunityStage }).stage;

  const { data, error } = await supabase.from("opportunities").update({ stage: toStage }).eq("id", id).select().single();
  if (error) throw error;

  if (fromStage !== toStage) {
    await insertEvent(supabase, {
      opportunityId: id,
      eventType: "stage_changed",
      ownerId,
      detail: `Stage: ${fromStage} → ${toStage}`,
      metadata: { from: fromStage, to: toStage },
    });

    // M10. Best-effort and never throwing (see lib/automation/emit.ts): moving
    // a stage must not fail because a rule about moving stages is broken.
    const row = data as Opportunity;
    await emitAutomationEvent(supabase, {
      type: "opportunity.stage_changed",
      ownerId,
      entityType: "opportunity",
      entityId: id,
      entity: {
        opportunity: {
          id,
          stage: toStage,
          from_stage: fromStage,
          title: row.title,
          source: row.source,
          location: row.location,
          location_type: row.location_type,
          employment_type: row.employment_type,
          seniority: row.seniority,
          applied_at: row.applied_at,
          next_action_at: row.next_action_at,
        },
      },
      discriminator: `${fromStage}->${toStage}`,
    });
  }
  return data as Opportunity;
}

export async function setOpportunityArchived(
  supabase: SupabaseClient,
  id: string,
  archived: boolean,
  ownerId: string,
): Promise<Opportunity> {
  const { data, error } = await supabase
    .from("opportunities")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  await insertEvent(supabase, {
    opportunityId: id,
    eventType: archived ? "archived" : "restored",
    ownerId,
  });
  return data as Opportunity;
}

export async function addNote(
  supabase: SupabaseClient,
  id: string,
  body: string,
  ownerId: string,
): Promise<OpportunityNote> {
  const { data, error } = await supabase
    .from("opportunity_notes")
    .insert({ opportunity_id: id, body: body.trim(), author_id: ownerId, owner_id: ownerId })
    .select("id, body, author_id, created_at")
    .single();
  if (error) throw error;
  await insertEvent(supabase, { opportunityId: id, eventType: "note_added", ownerId });
  return data as OpportunityNote;
}

/** Returns false if the contact is already linked. */
export async function addContactLink(
  supabase: SupabaseClient,
  id: string,
  contactId: string,
  role: string | null,
  ownerId: string,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("opportunity_contacts")
    .select("id")
    .eq("opportunity_id", id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (existing) return false;

  const { error } = await supabase
    .from("opportunity_contacts")
    .insert({ opportunity_id: id, contact_id: contactId, role: clean(role), owner_id: ownerId });
  if (error) throw error;
  await insertEvent(supabase, { opportunityId: id, eventType: "contact_linked", ownerId, metadata: { contact_id: contactId } });
  return true;
}

export async function removeContactLink(
  supabase: SupabaseClient,
  id: string,
  contactId: string,
  ownerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("opportunity_contacts")
    .delete()
    .eq("opportunity_id", id)
    .eq("contact_id", contactId);
  if (error) throw error;
  await insertEvent(supabase, { opportunityId: id, eventType: "contact_unlinked", ownerId, metadata: { contact_id: contactId } });
}
