import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCompanies, getCompanyFacets } from "@/lib/companies";
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
import { COMPANY_SORT_FIELDS, type Company, type CompanySortField } from "@/types/company";

export const metadata = { title: "Companies" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sort = (COMPANY_SORT_FIELDS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as CompanySortField)
    : "created_at";
  const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";
  const hasFilters = Boolean(params.q || params.industry || params.country || params.archived);

  const [result, facets] = await Promise.all([
    listCompanies(supabase, {
      search: params.q,
      industry: params.industry,
      country: params.country,
      includeArchived: params.archived === "1",
      sort,
      dir,
      page,
    }),
    getCompanyFacets(supabase),
  ]);

  // Href builder preserving current query.
  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) base.set(k, v);
  const buildHref = (overrides: Record<string, string | number | null>) => {
    const p = new URLSearchParams(base.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/admin/companies?${s}` : "/admin/companies";
  };

  const filterConfigs: FilterConfig[] = [
    ...(facets.industries.length
      ? [{ type: "select" as const, name: "industry", label: "Industry", options: facets.industries.map((i) => ({ value: i, label: i })) }]
      : []),
    ...(facets.countries.length
      ? [{ type: "select" as const, name: "country", label: "Country", options: facets.countries.map((c) => ({ value: c, label: c })) }]
      : []),
    { type: "toggle", name: "archived", label: "Show archived", onValue: "1" },
  ];

  const columns: Column<Company>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <span className="block">
          <span className="block">{row.name}</span>
          {row.domain && <span className="block text-xs text-slate-500">{row.domain}</span>}
        </span>
      ),
    },
    { key: "industry", header: "Industry", render: (row) => row.industry ?? <span className="text-slate-600">—</span> },
    {
      key: "location",
      header: "Location",
      render: (row) => {
        const loc = [row.headquarters, row.country].filter(Boolean).join(", ");
        return loc || <span className="text-slate-600">—</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) =>
        row.archived_at ? (
          <Badge variant="neutral">Archived</Badge>
        ) : (
          <span className="text-xs text-slate-500">Active</span>
        ),
    },
    { key: "created_at", header: "Added", sortable: true, align: "right", render: (row) => (
      <span className="text-slate-400">{formatDate(row.created_at)}</span>
    ) },
  ];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Companies"
        count={result.total}
        actions={
          <Link href="/admin/companies/new" className={buttonClasses("primary")}>
            <Plus className="size-4" aria-hidden />
            New company
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput param="q" placeholder="Search companies…" className="sm:max-w-xs" />
        <FilterBar filters={filterConfigs} />
      </div>

      <DataTable
        columns={columns}
        rows={result.rows}
        getRowKey={(r) => r.id}
        rowHref={(r) => `/admin/companies/${r.id}`}
        sort={{ key: sort, dir }}
        hrefForSort={(key, nextDir) => buildHref({ sort: key, dir: nextDir, page: null })}
        emptyState={
          <EmptyState
            icon={<Building2 />}
            title={hasFilters ? "No companies match your filters" : "No companies yet"}
            description={
              hasFilters
                ? "Try adjusting your search or filters."
                : "Add your first company to start building your pipeline."
            }
            action={
              hasFilters ? (
                <Link href="/admin/companies" className={buttonClasses("secondary")}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/admin/companies/new" className={buttonClasses("primary")}>
                  <Plus className="size-4" aria-hidden />
                  New company
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
