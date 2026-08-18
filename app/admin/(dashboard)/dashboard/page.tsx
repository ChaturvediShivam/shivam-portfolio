import Link from "next/link";
import { Building2, Users, Briefcase, ListChecks, AlertTriangle, Archive, Plus, Activity, Send, MessagesSquare, Trophy, Bookmark, CalendarClock, Clock } from "lucide-react";
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
  const { stats, jobSearch, followUps, pipeline, taskBuckets, events } = await getDashboardData(supabase);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <PageHeader
        title="Dashboard"
        description="Where the job search stands today."
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

      {/* Job search — the numbers that decide what to do today. */}
      <section aria-label="Job search" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Applications sent" value={jobSearch.applied} icon={<Send />} href="/admin/opportunities" />
        <StatCard label="Sent this week" value={jobSearch.appliedLast7Days} icon={<CalendarClock />} href="/admin/opportunities" />
        <StatCard label="In play" value={jobSearch.inPlay} icon={<Briefcase />} href="/admin/opportunities" />
        <StatCard label="Interviewing" value={jobSearch.interviewing} icon={<MessagesSquare />} href="/admin/opportunities?stage=interview" />
        <StatCard label="Offers" value={jobSearch.offers} icon={<Trophy />} href="/admin/opportunities?stage=offer" />
        <StatCard label="Saved to apply" value={jobSearch.saved} icon={<Bookmark />} href="/admin/opportunities?stage=lead" />
      </section>

      {/* CRM object counts — supporting detail beneath the job-search numbers. */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Companies" value={stats.companies} icon={<Building2 />} href="/admin/companies" />
        <StatCard label="Contacts" value={stats.contacts} icon={<Users />} href="/admin/contacts" />
        <StatCard label="Closed" value={jobSearch.closed} icon={<Archive />} href="/admin/opportunities" />
        <StatCard label="Open tasks" value={stats.openTasks} icon={<ListChecks />} href="/admin/tasks" />
        <StatCard label="Overdue tasks" value={stats.overdueTasks} icon={<AlertTriangle />} href="/admin/tasks?overdue=1" alert />
        <StatCard label="Archived opps" value={stats.archivedOpportunities} icon={<Archive />} href="/admin/opportunities?archived=1" />
      </section>

      {/* Pipeline summary */}
      <section aria-labelledby="pipeline-heading" className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <h2 id="pipeline-heading" className="text-sm font-semibold text-white">
          Pipeline
        </h2>
        {pipeline.every(({ count }) => count === 0) && (
          <p className="mt-3 text-sm text-slate-500">No opportunities yet.</p>
        )}
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          {/* Only stages that actually hold something. Nineteen tiles, fifteen
              of them zero, is a grid you stop reading. */}
          {pipeline.filter(({ count }) => count > 0).map(({ stage, count }) => (
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

      {/* Follow-ups — `next_action_at` on the pursuit itself. Named, not just
          counted: "3 overdue" does not tell you who to email. */}
      <section aria-labelledby="followups-heading" className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="followups-heading" className="flex items-center gap-2 text-sm font-semibold text-white">
            <Clock className="size-4 text-slate-500" aria-hidden />
            Follow-ups
          </h2>
          <p className="text-xs text-slate-500">
            <span className={followUps.overdue > 0 ? "font-semibold text-red-400" : "text-slate-400"}>
              {followUps.overdue} overdue
            </span>
            {" · "}
            {followUps.next7Days} in the next 7 days
          </p>
        </div>

        {followUps.items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Clock />}
              title="Nothing due"
              description="Set “Next action” on an opportunity and it will appear here when it comes due."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {followUps.items.map((item) => {
              const due = new Date(item.next_action_at);
              const overdue = due.getTime() < Date.now();
              return (
                <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link
                    href={`/admin/opportunities/${item.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md px-1 py-0.5 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                      {item.title}
                      {item.company && <span className="text-slate-500"> · {item.company.name}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge variant={stageBadgeVariant(item.stage)}>{stageLabel(item.stage)}</Badge>
                      <time
                        dateTime={item.next_action_at}
                        className={`text-xs tabular-nums ${overdue ? "font-semibold text-red-400" : "text-slate-500"}`}
                      >
                        {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </time>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
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
