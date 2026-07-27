import Link from "next/link";
import { Briefcase, Plus, LayoutGrid, Table as TableIcon } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listOpportunities, getPipeline, listActiveCompaniesForFilter } from "@/lib/opportunities";
import {
  PageHeader,
  DataTable,
  Pagination,
  FilterBar,
  SearchInput,
  Badge,
  EmptyState,
  buttonClasses,
  type Column,
  type FilterConfig,
} from "@/components/admin/ui";
import { PipelineBoard } from "@/components/admin/opportunities/PipelineBoard";
import {
  OPPORTUNITY_SORT_FIELDS,
  OPPORTUNITY_STAGES,
  humanize,
  stageBadgeVariant,
  stageLabel,
  type Opportunity,
  type OpportunitySortField,
} from "@/types/opportunity";
import { cn } from "@/lib/utils";

export const metadata = { title: "Opportunities" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const view = params.view === "board" ? "board" : "table";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sort = (OPPORTUNITY_SORT_FIELDS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as OpportunitySortField)
    : "created_at";
  const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";
  const hasFilters = Boolean(params.q || params.stage || params.company || params.source || params.archived);

  const filters = {
    search: params.q,
    stage: params.stage,
    companyId: params.company,
    source: params.source,
    includeArchived: params.archived === "1",
  };

  const companies = await listActiveCompaniesForFilter(supabase);

  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) base.set(k, v);
  const buildHref = (overrides: Record<string, string | number | null>) => {
    const p = new URLSearchParams(base.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/admin/opportunities?${s}` : "/admin/opportunities";
  };

  const filterConfigs: FilterConfig[] = [
    ...(view === "table"
      ? [{ type: "select" as const, name: "stage", label: "Stage", options: OPPORTUNITY_STAGES.map((s) => ({ value: s, label: stageLabel(s) })) }]
      : []),
    ...(companies.length
      ? [{ type: "select" as const, name: "company", label: "Company", options: companies.map((c) => ({ value: c.id, label: c.name })) }]
      : []),
    ...(view === "table" ? [{ type: "toggle" as const, name: "archived", label: "Show archived", onValue: "1" }] : []),
  ];

  const emptyState = (
    <EmptyState
      icon={<Briefcase />}
      title={hasFilters ? "No opportunities match your filters" : "No opportunities yet"}
      description={
        hasFilters ? "Try adjusting your search or filters." : "Create your first opportunity to start your pipeline."
      }
      action={
        hasFilters ? (
          <Link href="/admin/opportunities" className={buttonClasses("secondary")}>
            Clear filters
          </Link>
        ) : (
          <Link href="/admin/opportunities/new" className={buttonClasses("primary")}>
            <Plus className="size-4" aria-hidden />
            New opportunity
          </Link>
        )
      }
    />
  );

  const toggle = (
    <div className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.03] p-0.5">
      <Link
        href={buildHref({ view: null, page: null })}
        aria-current={view === "table" ? "page" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium",
          view === "table" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white",
        )}
      >
        <TableIcon className="size-3.5" aria-hidden />
        Table
      </Link>
      <Link
        href={buildHref({ view: "board", page: null })}
        aria-current={view === "board" ? "page" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium",
          view === "board" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white",
        )}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        Board
      </Link>
    </div>
  );

  let boardNode: React.ReactNode = null;
  if (view === "board") {
    const pipeline = await getPipeline(supabase, filters);
    boardNode = pipeline.length === 0 ? emptyState : <PipelineBoard opportunities={pipeline} />;
  }

  return (
    <div className={cn("p-6 md:p-10 space-y-6", view === "board" ? "max-w-none" : "max-w-7xl mx-auto")}>
      <PageHeader
        title="Opportunities"
        actions={
          <Link href="/admin/opportunities/new" className={buttonClasses("primary")}>
            <Plus className="size-4" aria-hidden />
            New opportunity
          </Link>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {toggle}
          <SearchInput param="q" placeholder="Search opportunities…" className="sm:w-64" />
        </div>
        <FilterBar filters={filterConfigs} />
      </div>

      {view === "board" ? (
        boardNode
      ) : (
        <TableView
          filters={{ ...filters, sort, dir, page }}
          buildHref={buildHref}
          sort={sort}
          dir={dir}
          emptyState={emptyState}
        />
      )}
    </div>
  );
}

async function TableView({
  filters,
  buildHref,
  sort,
  dir,
  emptyState,
}: {
  filters: Parameters<typeof listOpportunities>[1];
  buildHref: (o: Record<string, string | number | null>) => string;
  sort: OpportunitySortField;
  dir: "asc" | "desc";
  emptyState: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const result = await listOpportunities(supabase, filters);

  const columns: Column<Opportunity>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <span className="block">
          <span className="block">{row.title}</span>
          {row.company?.name && <span className="block text-xs text-slate-500">{row.company.name}</span>}
        </span>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      render: (row) => <Badge variant={stageBadgeVariant(row.stage)}>{stageLabel(row.stage)}</Badge>,
    },
    { key: "location", header: "Location", render: (row) => row.location ?? <span className="text-slate-600">—</span> },
    { key: "next_action_at", header: "Next action", sortable: true, render: (row) => <span className="text-slate-400">{formatDate(row.next_action_at)}</span> },
    { key: "created_at", header: "Added", sortable: true, align: "right", render: (row) => <span className="text-slate-400">{formatDate(row.created_at)}</span> },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={result.rows}
        getRowKey={(r) => r.id}
        rowHref={(r) => `/admin/opportunities/${r.id}`}
        sort={{ key: sort, dir }}
        hrefForSort={(key, nextDir) => buildHref({ sort: key, dir: nextDir, page: null })}
        emptyState={emptyState}
      />
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        hrefForPage={(p) => buildHref({ page: p <= 1 ? null : p })}
      />
    </>
  );
}
