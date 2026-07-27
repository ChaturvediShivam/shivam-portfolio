import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "@/types/opportunity";

/**
 * Analytics data layer (server-only, read-only). All aggregation happens in the
 * database via exact head-count queries (parallelized) plus one embedded-count
 * query for contacts-by-company — no N+1. Reporting/trends, distinct from the
 * operational Dashboard.
 */

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";
export const ANALYTICS_RANGES: AnalyticsRange[] = ["7d", "30d", "90d", "all"];
export function rangeLabel(r: AnalyticsRange): string {
  return r === "all" ? "All time" : `Last ${r.replace("d", "")} days`;
}

export interface AnalyticsFilters {
  range?: AnalyticsRange;
  companyId?: string;
}

export interface AnalyticsData {
  range: AnalyticsRange;
  pipeline: { stage: OpportunityStage; count: number }[];
  opportunities: { createdInRange: number; won: number; lost: number; active: number };
  tasks: { completed: number; open: number; overdue: number; completedThisWeek: number; completionRate: number };
  contacts: { newInRange: number; archived: number; byCompany: { name: string; count: number }[] };
  companies: { createdInRange: number; active: number; archived: number };
  messages: { inbox: number; unread: number; archived: number; inbound: number; outbound: number } | null;
  trends: { window: "7d" | "30d" | "90d"; oppsCreated: number; tasksCompleted: number }[];
}

const HEAD = { count: "exact" as const, head: true };
const OPEN_EXCLUDE = "(done,cancelled)";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function getAnalytics(supabase: SupabaseClient, filters: AnalyticsFilters = {}): Promise<AnalyticsData> {
  const range: AnalyticsRange = filters.range ?? "30d";
  const companyId = filters.companyId;
  const nowIso = new Date().toISOString();
  const weekAgoIso = daysAgoIso(7);
  const fromIso = range === "all" ? null : daysAgoIso(range === "7d" ? 7 : range === "30d" ? 30 : 90);

  // Company-scoped base builders (company filter applied where the table has company_id).
  const oppBase = () => {
    let q = supabase.from("opportunities").select("*", HEAD);
    if (companyId) q = q.eq("company_id", companyId);
    return q;
  };
  const taskBase = () => {
    let q = supabase.from("tasks").select("*", HEAD);
    if (companyId) q = q.eq("company_id", companyId);
    return q;
  };
  const contactBase = () => {
    let q = supabase.from("contacts").select("*", HEAD);
    if (companyId) q = q.eq("company_id", companyId);
    return q;
  };
  const messageBase = () => {
    let q = supabase.from("messages").select("*", HEAD);
    if (companyId) q = q.eq("company_id", companyId);
    return q;
  };

  const builders = {
    // opportunities
    oppCreatedInRange: fromIso ? oppBase().gte("created_at", fromIso) : oppBase(),
    // tasks
    taskCompleted: taskBase().eq("status", "done"),
    taskOpen: taskBase().is("archived_at", null).not("status", "in", OPEN_EXCLUDE),
    taskOverdue: taskBase().is("archived_at", null).not("status", "in", OPEN_EXCLUDE).lt("due_at", nowIso),
    taskCompletedThisWeek: taskBase().eq("status", "done").gte("completed_at", weekAgoIso),
    // contacts
    contactNewInRange: fromIso ? contactBase().gte("created_at", fromIso) : contactBase(),
    contactArchived: contactBase().not("archived_at", "is", null),
    // companies (not company-scoped)
    companyCreatedInRange: fromIso
      ? supabase.from("companies").select("*", HEAD).gte("created_at", fromIso)
      : supabase.from("companies").select("*", HEAD),
    companyActive: supabase.from("companies").select("*", HEAD).is("archived_at", null),
    companyArchived: supabase.from("companies").select("*", HEAD).not("archived_at", "is", null),
    // messages
    msgInbox: messageBase().is("archived_at", null),
    msgUnread: messageBase().is("archived_at", null).eq("is_read", false),
    msgArchived: messageBase().not("archived_at", "is", null),
    msgInbound: messageBase().eq("direction", "inbound"),
    msgOutbound: messageBase().eq("direction", "outbound"),
    // trends
    opps7: oppBase().gte("created_at", daysAgoIso(7)),
    opps30: oppBase().gte("created_at", daysAgoIso(30)),
    opps90: oppBase().gte("created_at", daysAgoIso(90)),
    done7: taskBase().eq("status", "done").gte("completed_at", daysAgoIso(7)),
    done30: taskBase().eq("status", "done").gte("completed_at", daysAgoIso(30)),
    done90: taskBase().eq("status", "done").gte("completed_at", daysAgoIso(90)),
  };

  const keys = Object.keys(builders) as (keyof typeof builders)[];
  const [results, pipelineResults, byCompany] = await Promise.all([
    Promise.all(keys.map((k) => builders[k])),
    Promise.all(OPPORTUNITY_STAGES.map((s) => oppBase().is("archived_at", null).eq("stage", s))),
    getContactsByCompany(supabase),
  ]);

  const counts = {} as Record<keyof typeof builders, number>;
  keys.forEach((k, i) => {
    const r = results[i];
    if (r.error) throw r.error;
    counts[k] = r.count ?? 0;
  });

  const pipeline = OPPORTUNITY_STAGES.map((stage, i) => {
    const r = pipelineResults[i];
    if (r.error) throw r.error;
    return { stage, count: r.count ?? 0 };
  });
  const byStage = Object.fromEntries(pipeline.map((p) => [p.stage, p.count])) as Record<OpportunityStage, number>;
  const active = pipeline.reduce((sum, p) => sum + p.count, 0);

  const completed = counts.taskCompleted;
  const open = counts.taskOpen;
  const completionRate = completed + open > 0 ? Math.round((completed / (completed + open)) * 100) : 0;

  const inbox = counts.msgInbox;
  const messages =
    inbox + counts.msgArchived + counts.msgInbound + counts.msgOutbound > 0
      ? { inbox, unread: counts.msgUnread, archived: counts.msgArchived, inbound: counts.msgInbound, outbound: counts.msgOutbound }
      : null;

  return {
    range,
    pipeline,
    opportunities: {
      createdInRange: counts.oppCreatedInRange,
      won: byStage.hired ?? 0,
      lost: (byStage.rejected ?? 0) + (byStage.withdrawn ?? 0),
      active,
    },
    tasks: { completed, open, overdue: counts.taskOverdue, completedThisWeek: counts.taskCompletedThisWeek, completionRate },
    contacts: { newInRange: counts.contactNewInRange, archived: counts.contactArchived, byCompany },
    companies: { createdInRange: counts.companyCreatedInRange, active: counts.companyActive, archived: counts.companyArchived },
    messages,
    trends: [
      { window: "7d", oppsCreated: counts.opps7, tasksCompleted: counts.done7 },
      { window: "30d", oppsCreated: counts.opps30, tasksCompleted: counts.done30 },
      { window: "90d", oppsCreated: counts.opps90, tasksCompleted: counts.done90 },
    ],
  };
}

/** Top companies by contact count, via a single embedded-count query (no N+1). */
async function getContactsByCompany(supabase: SupabaseClient): Promise<{ name: string; count: number }[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("name, contacts(count)")
    .is("archived_at", null)
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { name: string; contacts: { count: number }[] }[];
  return rows
    .map((r) => ({ name: r.name, count: r.contacts?.[0]?.count ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}
