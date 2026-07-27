import Link from "next/link";
import { Users, Plus } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listContacts, listActiveCompaniesForFilter } from "@/lib/contacts";
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
  CONTACT_SORT_FIELDS,
  INTEGRATION_PROVIDERS,
  providerLabel,
  type Contact,
  type ContactSortField,
} from "@/types/contact";

export const metadata = { title: "Contacts" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function ContactsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sort = (CONTACT_SORT_FIELDS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as ContactSortField)
    : "created_at";
  const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";
  const hasFilters = Boolean(params.q || params.company || params.source || params.archived);

  const [result, companies] = await Promise.all([
    listContacts(supabase, {
      search: params.q,
      companyId: params.company,
      source: params.source,
      includeArchived: params.archived === "1",
      sort,
      dir,
      page,
    }),
    listActiveCompaniesForFilter(supabase),
  ]);

  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) base.set(k, v);
  const buildHref = (overrides: Record<string, string | number | null>) => {
    const p = new URLSearchParams(base.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/admin/contacts?${s}` : "/admin/contacts";
  };

  const filterConfigs: FilterConfig[] = [
    ...(companies.length
      ? [{ type: "select" as const, name: "company", label: "Company", options: companies.map((c) => ({ value: c.id, label: c.name })) }]
      : []),
    { type: "select", name: "source", label: "Source", options: INTEGRATION_PROVIDERS.map((p) => ({ value: p, label: providerLabel(p) })) },
    { type: "toggle", name: "archived", label: "Show archived", onValue: "1" },
  ];

  const columns: Column<Contact>[] = [
    {
      key: "full_name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <span className="block">
          <span className="block">{row.full_name}</span>
          {row.email && <span className="block text-xs text-slate-500">{row.email}</span>}
        </span>
      ),
    },
    { key: "title", header: "Title", render: (row) => row.title ?? <span className="text-slate-600">—</span> },
    { key: "company", header: "Company", render: (row) => row.company?.name ?? <span className="text-slate-600">—</span> },
    {
      key: "source",
      header: "Source",
      render: (row) => (row.source ? <span className="text-slate-400">{providerLabel(row.source)}</span> : <span className="text-slate-600">—</span>),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (row.archived_at ? <Badge variant="neutral">Archived</Badge> : <span className="text-xs text-slate-500">Active</span>),
    },
    { key: "created_at", header: "Added", sortable: true, align: "right", render: (row) => <span className="text-slate-400">{formatDate(row.created_at)}</span> },
  ];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Contacts"
        count={result.total}
        actions={
          <Link href="/admin/contacts/new" className={buttonClasses("primary")}>
            <Plus className="size-4" aria-hidden />
            New contact
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput param="q" placeholder="Search contacts…" className="sm:max-w-xs" />
        <FilterBar filters={filterConfigs} />
      </div>

      <DataTable
        columns={columns}
        rows={result.rows}
        getRowKey={(r) => r.id}
        rowHref={(r) => `/admin/contacts/${r.id}`}
        sort={{ key: sort, dir }}
        hrefForSort={(key, nextDir) => buildHref({ sort: key, dir: nextDir, page: null })}
        emptyState={
          <EmptyState
            icon={<Users />}
            title={hasFilters ? "No contacts match your filters" : "No contacts yet"}
            description={
              hasFilters
                ? "Try adjusting your search or filters."
                : "Add your first contact to start tracking people."
            }
            action={
              hasFilters ? (
                <Link href="/admin/contacts" className={buttonClasses("secondary")}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/admin/contacts/new" className={buttonClasses("primary")}>
                  <Plus className="size-4" aria-hidden />
                  New contact
                </Link>
              )
            }
          />
        }
      />

      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        hrefForPage={(p) => buildHref({ page: p <= 1 ? null : p })}
      />
    </div>
  );
}
