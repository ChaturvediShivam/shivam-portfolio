import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "@/types/opportunity";

/**
 * Dashboard data layer (server-only, read-only). Aggregates operational counts,
 * pipeline-by-stage, task buckets, and a recent-activity feed from
 * opportunity_events. Uses exact head-count queries so results are correct
 * regardless of row volume.
 */

export interface RecentEvent {
  id: string;
  event_type: string;
  detail: string | null;
  actor_type: string;
  created_at: string;
  opportunity: { id: string; title: string } | null;
}

export interface DashboardData {
  stats: {
    companies: number;
    contacts: number;
    activeOpportunities: number;
    openTasks: number;
    overdueTasks: number;
    archivedOpportunities: number;
  };
  pipeline: { stage: OpportunityStage; count: number }[];
  taskBuckets: { dueToday: number; dueThisWeek: number; overdue: number; completedToday: number };
  events: RecentEvent[];
}

const OPEN_STATUS_EXCLUDE = "(done,cancelled)";

export async function getDashboardData(supabase: SupabaseClient): Promise<DashboardData> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const nowIso = now.toISOString();
  const todayStartIso = todayStart.toISOString();
  const tomorrowIso = tomorrow.toISOString();
  const weekEndIso = weekEnd.toISOString();

  const head = { count: "exact" as const, head: true };

  const statBuilders = {
    companies: supabase.from("companies").select("*", head).is("archived_at", null),
    contacts: supabase.from("contacts").select("*", head).is("archived_at", null),
    activeOpportunities: supabase.from("opportunities").select("*", head).is("archived_at", null),
    archivedOpportunities: supabase.from("opportunities").select("*", head).not("archived_at", "is", null),
    openTasks: supabase.from("tasks").select("*", head).is("archived_at", null).not("status", "in", OPEN_STATUS_EXCLUDE),
    overdueTasks: supabase
      .from("tasks")
      .select("*", head)
      .is("archived_at", null)
      .not("status", "in", OPEN_STATUS_EXCLUDE)
      .lt("due_at", nowIso),
    dueToday: supabase
      .from("tasks")
      .select("*", head)
      .is("archived_at", null)
      .not("status", "in", OPEN_STATUS_EXCLUDE)
      .gte("due_at", todayStartIso)
      .lt("due_at", tomorrowIso),
    dueThisWeek: supabase
      .from("tasks")
      .select("*", head)
      .is("archived_at", null)
      .not("status", "in", OPEN_STATUS_EXCLUDE)
      .gte("due_at", todayStartIso)
      .lt("due_at", weekEndIso),
    completedToday: supabase.from("tasks").select("*", head).eq("status", "done").gte("completed_at", todayStartIso),
  };

  const statKeys = Object.keys(statBuilders) as (keyof typeof statBuilders)[];
  const statResults = await Promise.all(statKeys.map((k) => statBuilders[k]));
  const counts = {} as Record<keyof typeof statBuilders, number>;
  statKeys.forEach((k, i) => {
    const r = statResults[i];
    if (r.error) throw r.error;
    counts[k] = r.count ?? 0;
  });

  const pipelineResults = await Promise.all(
    OPPORTUNITY_STAGES.map((s) => supabase.from("opportunities").select("*", head).is("archived_at", null).eq("stage", s)),
  );
  const pipeline = OPPORTUNITY_STAGES.map((stage, i) => {
    const r = pipelineResults[i];
    if (r.error) throw r.error;
    return { stage, count: r.count ?? 0 };
  });

  const { data: eventsData, error: eventsErr } = await supabase
    .from("opportunity_events")
    .select("id, event_type, detail, actor_type, created_at, opportunity:opportunities(id, title)")
    .order("created_at", { ascending: false })
    .limit(15);
  if (eventsErr) throw eventsErr;

  return {
    stats: {
      companies: counts.companies,
      contacts: counts.contacts,
      activeOpportunities: counts.activeOpportunities,
      openTasks: counts.openTasks,
      overdueTasks: counts.overdueTasks,
      archivedOpportunities: counts.archivedOpportunities,
    },
    pipeline,
    taskBuckets: {
      dueToday: counts.dueToday,
      dueThisWeek: counts.dueThisWeek,
      overdue: counts.overdueTasks,
      completedToday: counts.completedToday,
    },
    events: (eventsData ?? []) as unknown as RecentEvent[],
  };
}
