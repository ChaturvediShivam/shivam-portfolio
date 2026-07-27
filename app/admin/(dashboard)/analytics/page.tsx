import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAnalytics, ANALYTICS_RANGES, rangeLabel, type AnalyticsRange } from "@/lib/analytics";
import { listActiveCompaniesForFilter } from "@/lib/opportunities";
import { PageHeader, FilterBar, EmptyState, type FilterConfig } from "@/components/admin/ui";
import { StatCard } from "@/components/admin/dashboard/StatCard";
import { BarList, type BarItem } from "@/components/admin/analytics/BarList";
import { OPPORTUNITY_STAGES, stageBadgeVariant, stageLabel, type OpportunityStage } from "@/types/opportunity";
import { cn } from "@/lib/utils";

export const metadata = { title: "Analytics" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

const FUNNEL: OpportunityStage[] = ["lead", "applied", "screening", "interview", "offer", "hired"];
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <h2 id={id} className="text-sm font-semibold text-white">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const range: AnalyticsRange = (ANALYTICS_RANGES as string[]).includes(params.range ?? "")
    ? (params.range as AnalyticsRange)
    : "30d";
  const companyId = params.company;

  const [data, companies] = await Promise.all([
    getAnalytics(supabase, { range, companyId }),
    listActiveCompaniesForFilter(supabase),
  ]);

  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) base.set(k, v);
  const buildHref = (overrides: Record<string, string | null>) => {
    const p = new URLSearchParams(base.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `/admin/analytics?${s}` : "/admin/analytics";
  };

  const companyFilter: FilterConfig[] = companies.length
    ? [{ type: "select", name: "company", label: "Company", options: companies.map((c) => ({ value: c.id, label: c.name })) }]
    : [];

  const byStage = Object.fromEntries(data.pipeline.map((p) => [p.stage, p.count])) as Record<OpportunityStage, number>;

  const funnelItems: BarItem[] = OPPORTUNITY_STAGES.map((stage) => ({
    label: stageLabel(stage),
    value: byStage[stage] ?? 0,
    variant: stageBadgeVariant(stage),
    hint: `${pct(byStage[stage] ?? 0, data.opportunities.active)}%`,
  }));

  const conversionItems: BarItem[] = FUNNEL.slice(1).map((stage, i) => {
    const prev = byStage[FUNNEL[i]] ?? 0;
    const cur = byStage[stage] ?? 0;
    return {
      label: `${stageLabel(FUNNEL[i])} → ${stageLabel(stage)}`,
      value: pct(cur, prev),
      variant: "success",
      hint: "%",
    };
  });

  const rangeToggle = (
    <div className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Date range">
      {ANALYTICS_RANGES.map((r) => (
        <Link
          key={r}
          href={buildHref({ range: r === "30d" ? null : r })}
          aria-current={range === r ? "page" : undefined}
          className={cn(
            "rounded px-2.5 py-1.5 text-xs font-medium",
            range === r ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white",
          )}
        >
          {r === "all" ? "All" : r}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Analytics" description={`Reporting & trends · ${rangeLabel(range)}`} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {rangeToggle}
        {companyFilter.length > 0 && <FilterBar filters={companyFilter} />}
      </div>

      {/* Pipeline funnel */}
      <Section id="funnel-heading" title="Pipeline funnel">
        {data.opportunities.active === 0 ? (
          <EmptyState title="No active opportunities" description="Create opportunities to see your pipeline funnel." />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs text-slate-500">Distribution (share of {data.opportunities.active} active)</p>
              <BarList items={funnelItems} max={Math.max(1, ...funnelItems.map((f) => f.value))} />
            </div>
            <div>
              <p className="mb-2 text-xs text-slate-500">Stage-to-stage conversion (snapshot)</p>
              <BarList items={conversionItems} max={100} />
            </div>
          </div>
        )}
      </Section>

      {/* Opportunities */}
      <Section id="opps-heading" title="Opportunities">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label={`Created · ${rangeLabel(range)}`} value={data.opportunities.createdInRange} />
          <StatCard label="Won (hired)" value={data.opportunities.won} />
          <StatCard label="Lost" value={data.opportunities.lost} />
          <StatCard label="Active" value={data.opportunities.active} />
        </div>
      </Section>

      {/* Tasks */}
      <Section id="tasks-heading" title="Tasks">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Completed" value={data.tasks.completed} />
          <StatCard label="Open" value={data.tasks.open} />
          <StatCard label="Overdue" value={data.tasks.overdue} alert />
          <StatCard label="Completed this week" value={data.tasks.completedThisWeek} />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-500">Completion rate</span>
            <span className="text-slate-300">{data.tasks.completionRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.04]" role="img" aria-label={`Completion rate ${data.tasks.completionRate}%`}>
            <div className="h-2 rounded-full bg-emerald-500/60" style={{ width: `${data.tasks.completionRate}%` }} />
          </div>
        </div>
      </Section>

      {/* Contacts */}
      <Section id="contacts-heading" title="Contacts">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label={`New · ${rangeLabel(range)}`} value={data.contacts.newInRange} />
            <StatCard label="Archived" value={data.contacts.archived} />
          </div>
          <div>
            <p className="mb-2 text-xs text-slate-500">Top companies by contacts</p>
            <BarList items={data.contacts.byCompany.map((c) => ({ label: c.name, value: c.count, variant: "info" }))} />
          </div>
        </div>
      </Section>

      {/* Companies */}
      <Section id="companies-heading" title="Companies">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard label={`Created · ${rangeLabel(range)}`} value={data.companies.createdInRange} />
          <StatCard label="Active" value={data.companies.active} />
          <StatCard label="Archived" value={data.companies.archived} />
        </div>
      </Section>

      {/* Messages (only if data exists) */}
      {data.messages && (
        <Section id="messages-heading" title="Messages">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Inbox" value={data.messages.inbox} />
              <StatCard label="Unread" value={data.messages.unread} />
              <StatCard label="Archived" value={data.messages.archived} />
            </div>
            <div>
              <p className="mb-2 text-xs text-slate-500">Direction</p>
              <BarList
                items={[
                  { label: "Inbound", value: data.messages.inbound, variant: "neutral" },
                  { label: "Outbound", value: data.messages.outbound, variant: "info" },
                ]}
              />
            </div>
          </div>
        </Section>
      )}

      {/* Trends */}
      <Section id="trends-heading" title="Recent trends">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-xs text-slate-500">
                <th scope="col" className="px-3 py-2 font-medium">Window</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Opportunities created</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Tasks completed</th>
              </tr>
            </thead>
            <tbody>
              {data.trends.map((t) => (
                <tr key={t.window} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-2 text-slate-300">Last {t.window.replace("d", "")} days</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{t.oppsCreated}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{t.tasksCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
