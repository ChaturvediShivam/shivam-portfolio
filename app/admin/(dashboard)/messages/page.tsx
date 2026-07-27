import Link from "next/link";
import { Mail } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listMessages } from "@/lib/messages";
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
import {
  MESSAGE_DIRECTIONS,
  MESSAGE_SORT_FIELDS,
  directionBadgeVariant,
  directionLabel,
  type Message,
  type MessageSortField,
} from "@/types/message";
import { INTEGRATION_PROVIDERS, providerLabel } from "@/types/contact";

export const metadata = { title: "Messages" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function linkedLabel(m: Message): string | null {
  return m.opportunity?.title ?? m.contact?.full_name ?? m.company?.name ?? null;
}
function formatDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

export default async function MessagesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sort = (MESSAGE_SORT_FIELDS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as MessageSortField)
    : "received_at";
  const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";
  const hasFilters = Boolean(params.q || params.direction || params.source || params.unread || params.unlinked || params.archived);

  const result = await listMessages(supabase, {
    search: params.q,
    direction: params.direction,
    source: params.source,
    unreadOnly: params.unread === "1",
    unlinkedOnly: params.unlinked === "1",
    includeArchived: params.archived === "1",
    sort,
    dir,
    page,
  });

  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) base.set(k, v);
  const buildHref = (overrides: Record<string, string | number | null>) => {
    const p = new URLSearchParams(base.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/admin/messages?${s}` : "/admin/messages";
  };

  const filterConfigs: FilterConfig[] = [
    { type: "select", name: "direction", label: "Direction", options: MESSAGE_DIRECTIONS.map((d) => ({ value: d, label: directionLabel(d) })) },
    { type: "select", name: "source", label: "Source", options: INTEGRATION_PROVIDERS.map((p) => ({ value: p, label: providerLabel(p) })) },
    { type: "toggle", name: "unread", label: "Unread", onValue: "1" },
    { type: "toggle", name: "unlinked", label: "Unlinked", onValue: "1" },
    { type: "toggle", name: "archived", label: "Show archived", onValue: "1" },
  ];

  const columns: Column<Message>[] = [
    {
      key: "from",
      header: "From",
      render: (row) => (
        <span className="flex items-center gap-2">
          {!row.is_read && <span className="size-1.5 shrink-0 rounded-full bg-blue-400" aria-label="Unread" />}
          <span className="min-w-0">
            <span className={row.is_read ? "block" : "block font-medium text-slate-100"}>{row.from_name ?? row.from_address ?? "—"}</span>
            <span className="block text-xs text-slate-500">
              <Badge variant={directionBadgeVariant(row.direction)}>{directionLabel(row.direction)}</Badge>
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (row) => (
        <span className="block">
          <span className="block">{row.subject ?? <span className="text-slate-500">(no subject)</span>}</span>
          {row.snippet && <span className="block truncate text-xs text-slate-500">{row.snippet}</span>}
        </span>
      ),
    },
    { key: "linked", header: "Linked", render: (row) => linkedLabel(row) ?? <span className="text-slate-600">—</span> },
    { key: "received_at", header: "Date", sortable: true, align: "right", render: (row) => <span className="text-slate-400">{formatDate(row.received_at ?? row.sent_at)}</span> },
  ];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Messages" count={result.total} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput param="q" placeholder="Search messages…" className="lg:w-72" />
        <FilterBar filters={filterConfigs} />
      </div>

      <DataTable
        columns={columns}
        rows={result.rows}
        getRowKey={(r) => r.id}
        rowHref={(r) => `/admin/messages/${r.id}`}
        sort={{ key: sort, dir }}
        hrefForSort={(key, nextDir) => buildHref({ sort: key, dir: nextDir, page: null })}
        emptyState={
          <EmptyState
            icon={<Mail />}
            title={hasFilters ? "No messages match your filters" : "No messages yet"}
            description={
              hasFilters
                ? "Try adjusting your search or filters."
                : "Messages will appear here once an inbox is connected (Gmail sync arrives in a later phase)."
            }
            action={
              hasFilters ? (
                <Link href="/admin/messages" className={buttonClasses("secondary")}>
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        }
      />

      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefForPage={(p) => buildHref({ page: p <= 1 ? null : p })} />
    </div>
  );
}
