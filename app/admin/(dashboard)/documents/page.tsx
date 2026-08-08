import { FileText } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  listDocuments,
  DOCUMENT_SORT_FIELDS,
  type DocumentRow,
  type DocumentSortField,
} from "@/lib/career-intelligence/documents";
import {
  PageHeader,
  DataTable,
  Pagination,
  FilterBar,
  SearchInput,
  Badge,
  EmptyState,
  type Column,
  type FilterConfig,
} from "@/components/admin/ui";
import { DOCUMENT_KINDS, documentKindLabel } from "@/types/career-intelligence";

export const metadata = { title: "Documents" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function formatDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

function formatSize(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function linkedLabel(d: DocumentRow): string {
  return d.opportunity?.title ?? d.company?.name ?? d.contact?.full_name ?? "—";
}

export default async function DocumentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const sort = DOCUMENT_SORT_FIELDS.includes(params.sort as never)
    ? (params.sort as DocumentSortField)
    : "created_at";
  const dir = params.dir === "asc" ? "asc" : "desc";

  const result = await listDocuments(supabase, {
    search: params.q,
    kind: params.kind,
    includeArchived: params.archived === "1",
    sort,
    dir,
    page: Number(params.page) || 1,
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
    return s ? `/admin/documents?${s}` : "/admin/documents";
  };

  const filterConfigs: FilterConfig[] = [
    {
      type: "select",
      name: "kind",
      label: "Kind",
      options: DOCUMENT_KINDS.map((k) => ({ value: k, label: documentKindLabel(k) })),
    },
    { type: "toggle", name: "archived", label: "Include archived", onValue: "1" },
  ];

  const columns: Column<DocumentRow>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (d) => (
        <div className="min-w-0">
          <span className="block truncate font-medium text-slate-200">{d.title}</span>
          {d.file_name && <span className="block truncate text-xs text-slate-500">{d.file_name}</span>}
        </div>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      sortable: true,
      render: (d) => <Badge variant="neutral">{documentKindLabel(d.kind)}</Badge>,
    },
    { key: "linked", header: "Linked to", render: linkedLabel },
    { key: "size", header: "Size", align: "right", render: (d) => formatSize(d.file_size_bytes) },
    { key: "created_at", header: "Added", sortable: true, render: (d) => formatDate(d.created_at) },
  ];

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Documents"
        description="Resumes, job descriptions, offer letters and other files filed against an application, company or contact."
        count={result.total}
        countLabel="document"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput param="q" placeholder="Search documents…" className="sm:w-64" />
        <FilterBar filters={filterConfigs} />
      </div>

      <DataTable
        columns={columns}
        rows={result.rows}
        getRowKey={(d) => d.id}
        sort={{ key: sort, dir }}
        hrefForSort={(key, nextDir) => buildHref({ sort: key, dir: nextDir, page: null })}
        emptyState={
          <EmptyState
            icon={<FileText />}
            title="No documents yet"
            description="Files attached to an application appear here. Uploads and provider import arrive in Phase 2."
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
