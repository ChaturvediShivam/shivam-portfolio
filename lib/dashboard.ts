import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLOSED_STAGES,
  INTERVIEW_STAGES,
  OFFER_STAGES,
  OPPORTUNITY_STAGES,
  PRE_APPLICATION_STAGES,
  stageList,
  type OpportunityStage,
} from "@/types/opportunity";

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

/**
 * The numbers a job search is actually steered by.
 *
 * Distinct from `stats`, which counts CRM objects (companies, contacts, tasks).
 * These answer the four questions that decide what to do today: have I sent
 * enough applications, how many are live, how many are converting to
 * conversations, and what is going cold while I wait.
 *
 * Nothing here is a ratio or a rate. A response rate computed over a dozen
 * applications is noise presented as insight, and acting on it is worse than
 * ignoring it.
 */
export interface JobSearchMetrics {
  /** Applications submitted, ever — including archived and closed ones. */
  applied: number;
  /** Submitted, not yet resolved, not archived: the live pipeline. */
  inPlay: number;
  /** In a conversation, from screening through the final round. */
  interviewing: number;
  /** Offer received, under negotiation, or accepted. */
  offers: number;
  /** Rejected, ghosted or withdrawn. */
  closed: number;
  /** Saved but not yet applied to — the queue to work through. */
  saved: number;
  /** Submitted in the last 7 days. The momentum number. */
  appliedLast7Days: number;
}

/**
 * Follow-ups driven by `opportunities.next_action_at`.
 *
 * The column has existed since the foundation migration and is captured by the
 * form, but nothing ever read it back — so the date was being recorded into a
 * field that could not remind anyone of anything. Tasks have their own buckets
 * already; these are the pursuits themselves going quiet.
 */
export interface FollowUp {
  id: string;
  title: string;
  stage: OpportunityStage;
  next_action_at: string;
  company: { id: string; name: string } | null;
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
  jobSearch: JobSearchMetrics;
  followUps: { overdue: number; next7Days: number; items: FollowUp[] };
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

  const weekAgo = new Date(todayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const nowIso = now.toISOString();
  const weekAgoIso = weekAgo.toISOString();
  const todayStartIso = todayStart.toISOString();
  const tomorrowIso = tomorrow.toISOString();
  const weekEndIso = weekEnd.toISOString();

  const head = { count: "exact" as const, head: true };
  const PRE_APPLICATION = stageList(PRE_APPLICATION_STAGES);
  const CLOSED = stageList(CLOSED_STAGES);

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

    // Job-search counts. "Applied" is every opportunity past the
    // pre-application stages, archived ones included: an application that was
    // sent and later archived was still sent, and a total that shrinks when you
    // tidy up is a total nobody can trust.
    applied: supabase.from("opportunities").select("*", head).not("stage", "in", PRE_APPLICATION),
    saved: supabase.from("opportunities").select("*", head).is("archived_at", null).in("stage", [...PRE_APPLICATION_STAGES]),
    inPlay: supabase
      .from("opportunities")
      .select("*", head)
      .is("archived_at", null)
      .not("stage", "in", PRE_APPLICATION)
      .not("stage", "in", CLOSED),
    interviewing: supabase.from("opportunities").select("*", head).is("archived_at", null).in("stage", [...INTERVIEW_STAGES]),
    offers: supabase.from("opportunities").select("*", head).is("archived_at", null).in("stage", [...OFFER_STAGES]),
    closed: supabase.from("opportunities").select("*", head).in("stage", [...CLOSED_STAGES]),
    // The one date-keyed count here, and correctly so: "how many did I send
    // this week" is a question about dates, and an application with no
    // `applied_at` genuinely cannot be placed in a week.
    appliedLast7Days: supabase.from("opportunities").select("*", head).gte("applied_at", weekAgoIso),

    // Follow-ups on the pursuits themselves, not on tasks. Closed pursuits are
    // excluded: a rejected application does not need chasing.
    followUpsOverdue: supabase
      .from("opportunities")
      .select("*", head)
      .is("archived_at", null)
      .not("stage", "in", CLOSED)
      .lt("next_action_at", nowIso),
    followUpsNext7Days: supabase
      .from("opportunities")
      .select("*", head)
      .is("archived_at", null)
      .not("stage", "in", CLOSED)
      .gte("next_action_at", nowIso)
      .lt("next_action_at", weekEndIso),
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

  // The soonest follow-ups, so the dashboard can name them rather than only
  // counting them. Overdue sorts first because `next_action_at` ascending puts
  // the most-late at the top, which is the order they need working in.
  const { data: followUpData, error: followUpErr } = await supabase
    .from("opportunities")
    .select("id, title, stage, next_action_at, company:companies(id, name)")
    .is("archived_at", null)
    .not("stage", "in", CLOSED)
    .not("next_action_at", "is", null)
    .lt("next_action_at", weekEndIso)
    .order("next_action_at", { ascending: true })
    .limit(8);
  if (followUpErr) throw followUpErr;

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
    jobSearch: {
      applied: counts.applied,
      inPlay: counts.inPlay,
      interviewing: counts.interviewing,
      offers: counts.offers,
      closed: counts.closed,
      saved: counts.saved,
      appliedLast7Days: counts.appliedLast7Days,
    },
    followUps: {
      overdue: counts.followUpsOverdue,
      next7Days: counts.followUpsNext7Days,
      items: (followUpData ?? []) as unknown as FollowUp[],
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
