import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitAutomationEvent } from "@/lib/automation/emit";
import {
  OPPORTUNITY_SORT_FIELDS,
  OPPORTUNITY_STAGES,
  type Opportunity,
  type OpportunityContactLink,
  type OpportunityEvent,
  type OpportunityInput,
  type OpportunityListFilters,
  type OpportunityListResult,
  type OpportunityNote,
  type OpportunityStage,
} from "@/types/opportunity";

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

/** Editable columns, excluding `stage` (stage changes go through changeStage). */
function mapInput(input: OpportunityInput): Record<string, unknown> {
  return {
    title: input.title.trim(),
    company_id: input.company_id || null,
    primary_contact_id: input.primary_contact_id || null,
    source: clean(input.source),
    job_url: clean(input.job_url),
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
  };
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
