import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitAutomationEvent } from "@/lib/automation/emit";
import {
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
  type Task,
  type TaskInput,
  type TaskListFilters,
  type TaskListResult,
  type TaskPriority,
  type TaskStatus,
} from "@/types/task";

/**
 * Tasks data layer (server-only). Mirrors lib/opportunities. Reuses the active
 * company/contact searches (read-only) and adds an active-opportunity search
 * for entity linking. `tasks` has no search_vector, so search uses ilike.
 */
export { searchActiveCompanies, searchActiveContacts } from "@/lib/opportunities";

const DEFAULT_PAGE_SIZE = 25;
const SELECT =
  "*, opportunity:opportunities(id, title), contact:contacts(id, full_name), company:companies(id, name)";

function clean(value?: string | null): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}
function validStatus(s?: string | null): TaskStatus {
  return TASK_STATUSES.includes(s as never) ? (s as TaskStatus) : "todo";
}
function validPriority(p?: string | null): TaskPriority {
  return TASK_PRIORITIES.includes(p as never) ? (p as TaskPriority) : "medium";
}

/** Editable columns excluding status / assignee / completed_at. */
function mapInput(input: TaskInput): Record<string, unknown> {
  return {
    title: input.title.trim(),
    description: clean(input.description),
    priority: validPriority(input.priority),
    due_at: clean(input.due_at),
    opportunity_id: input.opportunity_id || null,
    contact_id: input.contact_id || null,
    company_id: input.company_id || null,
  };
}

function searchClause(search: string): string {
  const safe = search.replace(/[%,()]/g, " ");
  return `title.ilike.%${safe}%,description.ilike.%${safe}%`;
}

export async function listTasks(supabase: SupabaseClient, filters: TaskListFilters = {}): Promise<TaskListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("tasks").select(SELECT, { count: "exact" });
  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.overdueOnly) query = query.lt("due_at", new Date().toISOString()).not("status", "in", "(done,cancelled)");
  const search = filters.search?.trim();
  if (search) query = query.or(searchClause(search));

  const sort = TASK_SORT_FIELDS.includes(filters.sort as never) ? filters.sort! : "created_at";
  const ascending = filters.dir === "asc";
  query = query.order(sort, { ascending, nullsFirst: false }).order("id", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Task[], total: count ?? 0, page, pageSize };
}

/** Active tasks for the status board (grouped client-side, capped). */
export async function getTaskBoard(supabase: SupabaseClient, filters: TaskListFilters = {}): Promise<Task[]> {
  let query = supabase.from("tasks").select(SELECT).is("archived_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.overdueOnly) query = query.lt("due_at", new Date().toISOString()).not("status", "in", "(done,cancelled)");
  const search = filters.search?.trim();
  if (search) query = query.or(searchClause(search));
  query = query.order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Task[];
}

export async function getTask(supabase: SupabaseClient, id: string): Promise<Task | null> {
  const { data, error } = await supabase.from("tasks").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Task) ?? null;
}

export async function searchActiveOpportunities(
  supabase: SupabaseClient,
  query: string,
): Promise<{ value: string; label: string; sublabel?: string }[]> {
  let q = supabase
    .from("opportunities")
    .select("id, title, stage")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const term = query.trim();
  if (term) q = q.ilike("title", `%${term}%`);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as { id: string; title: string; stage: string | null }[]).map((o) => ({
    value: o.id,
    label: o.title,
    sublabel: o.stage ?? undefined,
  }));
}

/**
 * The readable snapshot automation conditions evaluate against (M10).
 *
 * Deliberately narrower than the row: `lib/automation/schema.ts` allow-lists
 * exactly these paths, and a field absent here is a field no rule can read.
 */
function taskEntity(task: Task): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_at: task.due_at,
    opportunity_id: task.opportunity_id,
  };
}

export async function createTask(
  supabase: SupabaseClient,
  ownerId: string,
  input: TaskInput,
  assigneeId: string | null,
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...mapInput(input), status: validStatus(input.status), assignee_id: assigneeId, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;

  const created = data as Task;
  await emitAutomationEvent(supabase, {
    type: "task.created",
    ownerId,
    entityType: "task",
    entityId: created.id,
    entity: { task: taskEntity(created) },
  });

  return created;
}

export async function updateTask(
  supabase: SupabaseClient,
  id: string,
  input: TaskInput,
  assigneeId: string | null,
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update({ ...mapInput(input), assignee_id: assigneeId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function changeStatus(supabase: SupabaseClient, id: string, status: TaskStatus): Promise<Task> {
  const { data: current } = await supabase.from("tasks").select("status").eq("id", id).maybeSingle();
  const fromStatus = (current as { status?: string } | null)?.status ?? null;

  const { data, error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  const updated = data as Task;
  if (fromStatus !== status) {
    await emitAutomationEvent(supabase, {
      type: "task.status_changed",
      ownerId: updated.owner_id,
      entityType: "task",
      entityId: updated.id,
      entity: { task: { ...taskEntity(updated), from_status: fromStatus } },
      discriminator: `${fromStatus ?? "none"}->${status}`,
    });
  }

  return updated;
}

export async function setTaskArchived(supabase: SupabaseClient, id: string, archived: boolean): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}
