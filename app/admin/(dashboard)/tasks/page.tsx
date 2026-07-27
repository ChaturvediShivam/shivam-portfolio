import Link from "next/link";
import { ListChecks, Plus, LayoutGrid, Table as TableIcon } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listTasks, getTaskBoard } from "@/lib/tasks";
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
import { TaskBoard } from "@/components/admin/tasks/TaskBoard";
import {
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
  isOverdue,
  priorityBadgeVariant,
  priorityLabel,
  statusBadgeVariant,
  statusLabel,
  type Task,
  type TaskSortField,
} from "@/types/task";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tasks" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function linkedLabel(t: Task): string | null {
  return t.opportunity?.title ?? t.contact?.full_name ?? t.company?.name ?? null;
}
function formatDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

export default async function TasksPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const view = params.view === "board" ? "board" : "table";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sort = (TASK_SORT_FIELDS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as TaskSortField)
    : "created_at";
  const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";
  const hasFilters = Boolean(params.q || params.status || params.priority || params.overdue || params.archived);

  const filters = {
    search: params.q,
    status: params.status,
    priority: params.priority,
    overdueOnly: params.overdue === "1",
    includeArchived: params.archived === "1",
  };

  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) base.set(k, v);
  const buildHref = (overrides: Record<string, string | number | null>) => {
    const p = new URLSearchParams(base.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/admin/tasks?${s}` : "/admin/tasks";
  };

  const filterConfigs: FilterConfig[] = [
    ...(view === "table"
      ? [{ type: "select" as const, name: "status", label: "Status", options: TASK_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) }]
      : []),
    { type: "select", name: "priority", label: "Priority", options: TASK_PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) })) },
    { type: "toggle", name: "overdue", label: "Overdue", onValue: "1" },
    ...(view === "table" ? [{ type: "toggle" as const, name: "archived", label: "Show archived", onValue: "1" }] : []),
  ];

  const emptyState = (
    <EmptyState
      icon={<ListChecks />}
      title={hasFilters ? "No tasks match your filters" : "No tasks yet"}
      description={hasFilters ? "Try adjusting your search or filters." : "Create your first task to start executing."}
      action={
        hasFilters ? (
          <Link href="/admin/tasks" className={buttonClasses("secondary")}>
            Clear filters
          </Link>
        ) : (
          <Link href="/admin/tasks/new" className={buttonClasses("primary")}>
            <Plus className="size-4" aria-hidden />
            New task
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
        className={cn("inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium", view === "table" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white")}
      >
        <TableIcon className="size-3.5" aria-hidden />
        Table
      </Link>
      <Link
        href={buildHref({ view: "board", page: null })}
        aria-current={view === "board" ? "page" : undefined}
        className={cn("inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium", view === "board" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white")}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        Board
      </Link>
    </div>
  );

  let boardNode: React.ReactNode = null;
  let tableNode: React.ReactNode = null;

  if (view === "board") {
    const tasks = await getTaskBoard(supabase, filters);
    boardNode = tasks.length === 0 ? emptyState : <TaskBoard tasks={tasks} />;
  } else {
    const result = await listTasks(supabase, { ...filters, sort, dir, page });
    const columns: Column<Task>[] = [
      {
        key: "title",
        header: "Title",
        sortable: true,
        render: (row) => {
          const linked = linkedLabel(row);
          return (
            <span className="block">
              <span className="block">{row.title}</span>
              {linked && <span className="block text-xs text-slate-500">{linked}</span>}
            </span>
          );
        },
      },
      { key: "status", header: "Status", sortable: true, render: (row) => <Badge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge> },
      { key: "priority", header: "Priority", render: (row) => <Badge variant={priorityBadgeVariant(row.priority)}>{priorityLabel(row.priority)}</Badge> },
      {
        key: "due_at",
        header: "Due",
        sortable: true,
        render: (row) =>
          row.due_at ? (
            <span className={isOverdue(row) ? "text-red-400" : "text-slate-400"}>
              {isOverdue(row) ? "Overdue · " : ""}
              {formatDate(row.due_at)}
            </span>
          ) : (
            <span className="text-slate-600">—</span>
          ),
      },
      { key: "created_at", header: "Added", sortable: true, align: "right", render: (row) => <span className="text-slate-400">{formatDate(row.created_at)}</span> },
    ];
    tableNode = (
      <>
        <DataTable
          columns={columns}
          rows={result.rows}
          getRowKey={(r) => r.id}
          rowHref={(r) => `/admin/tasks/${r.id}`}
          sort={{ key: sort, dir }}
          hrefForSort={(key, nextDir) => buildHref({ sort: key, dir: nextDir, page: null })}
          emptyState={emptyState}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefForPage={(p) => buildHref({ page: p <= 1 ? null : p })} />
      </>
    );
  }

  return (
    <div className={cn("p-6 md:p-10 space-y-6", view === "board" ? "max-w-none" : "max-w-7xl mx-auto")}>
      <PageHeader
        title="Tasks"
        actions={
          <Link href="/admin/tasks/new" className={buttonClasses("primary")}>
            <Plus className="size-4" aria-hidden />
            New task
          </Link>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {toggle}
          <SearchInput param="q" placeholder="Search tasks…" className="sm:w-64" />
        </div>
        <FilterBar filters={filterConfigs} />
      </div>

      {view === "board" ? boardNode : tableNode}
    </div>
  );
}
