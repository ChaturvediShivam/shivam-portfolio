import Link from "next/link";
import { Building2, Users, Briefcase, ListChecks, AlertTriangle, Archive, Plus, Activity } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard";
import { PageHeader, Badge, EmptyState, buttonClasses } from "@/components/admin/ui";
import { StatCard } from "@/components/admin/dashboard/StatCard";
import { humanize, stageBadgeVariant, stageLabel } from "@/types/opportunity";

export const metadata = { title: "Dashboard" };

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { stats, pipeline, taskBuckets, events } = await getDashboardData(supabase);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <PageHeader
        title="Dashboard"
        description="Operational overview of your pipeline."
        actions={
          <>
            <Link href="/admin/companies/new" className={buttonClasses("secondary")}>
              <Plus className="size-4" aria-hidden />
              Company
            </Link>
            <Link href="/admin/contacts/new" className={buttonClasses("secondary")}>
              <Plus className="size-4" aria-hidden />
              Contact
            </Link>
            <Link href="/admin/tasks/new" className={buttonClasses("secondary")}>
              <Plus className="size-4" aria-hidden />
              Task
            </Link>
            <Link href="/admin/opportunities/new" className={buttonClasses("primary")}>
              <Plus className="size-4" aria-hidden />
              Opportunity
            </Link>
          </>
        }
      />

      {/* Stats */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Companies" value={stats.companies} icon={<Building2 />} href="/admin/companies" />
        <StatCard label="Contacts" value={stats.contacts} icon={<Users />} href="/admin/contacts" />
        <StatCard label="Active opportunities" value={stats.activeOpportunities} icon={<Briefcase />} href="/admin/opportunities" />
        <StatCard label="Open tasks" value={stats.openTasks} icon={<ListChecks />} href="/admin/tasks" />
        <StatCard label="Overdue tasks" value={stats.overdueTasks} icon={<AlertTriangle />} href="/admin/tasks?overdue=1" alert />
        <StatCard label="Archived opps" value={stats.archivedOpportunities} icon={<Archive />} href="/admin/opportunities?archived=1" />
      </section>

      {/* Pipeline summary */}
      <section aria-labelledby="pipeline-heading" className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <h2 id="pipeline-heading" className="text-sm font-semibold text-white">
          Pipeline
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          {pipeline.map(({ stage, count }) => (
            <li key={stage}>
              <Link
                href={`/admin/opportunities?stage=${stage}`}
                className="block rounded-md border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                <Badge variant={stageBadgeVariant(stage)}>{stageLabel(stage)}</Badge>
                <p className="mt-2 text-xl font-semibold text-white">{count}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming tasks */}
        <section aria-labelledby="tasks-heading" className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 id="tasks-heading" className="text-sm font-semibold text-white">
            Tasks
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/admin/tasks?overdue=1" className="rounded-md border border-white/[0.06] p-3 transition-colors hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
              <span className="text-xs text-slate-500">Overdue</span>
              <p className={`mt-1 text-xl font-semibold ${taskBuckets.overdue > 0 ? "text-red-400" : "text-white"}`}>{taskBuckets.overdue}</p>
            </Link>
            <Link href="/admin/tasks" className="rounded-md border border-white/[0.06] p-3 transition-colors hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
              <span className="text-xs text-slate-500">Due today</span>
              <p className="mt-1 text-xl font-semibold text-white">{taskBuckets.dueToday}</p>
            </Link>
            <Link href="/admin/tasks" className="rounded-md border border-white/[0.06] p-3 transition-colors hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
              <span className="text-xs text-slate-500">Due this week</span>
              <p className="mt-1 text-xl font-semibold text-white">{taskBuckets.dueThisWeek}</p>
            </Link>
            <div className="rounded-md border border-white/[0.06] p-3">
              <span className="text-xs text-slate-500">Completed today</span>
              <p className="mt-1 text-xl font-semibold text-emerald-400">{taskBuckets.completedToday}</p>
            </div>
          </div>
        </section>

        {/* Recent activity */}
        <section aria-labelledby="activity-heading" className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 id="activity-heading" className="flex items-center gap-2 text-sm font-semibold text-white">
            <Activity className="size-4 text-slate-500" aria-hidden />
            Recent activity
          </h2>
          {events.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={<Activity />} title="No activity yet" description="Opportunity events will appear here as you work your pipeline." />
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="border-l border-white/10 pl-3">
                  <p className="text-sm text-slate-200">
                    {humanize(event.event_type)}
                    {event.opportunity && (
                      <>
                        {" — "}
                        <Link href={`/admin/opportunities/${event.opportunity.id}`} className="text-slate-300 hover:text-white underline decoration-white/20 underline-offset-2">
                          {event.opportunity.title}
                        </Link>
                      </>
                    )}
                  </p>
                  {event.detail && <p className="text-xs text-slate-500">{event.detail}</p>}
                  <p className="mt-0.5 text-xs text-slate-600">
                    <time dateTime={event.created_at}>{timeAgo(event.created_at)}</time>
                    {event.actor_type === "agent" && " · agent"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
