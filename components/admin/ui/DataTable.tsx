import * as React from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingState } from "./LoadingState";

export type SortDir = "asc" | "desc";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Cell renderer; defaults to `String(row[key])`. */
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Makes the whole row navigate (stretched link on the first cell). */
  rowHref?: (row: T) => string;
  /** Current sort, to render header carets. */
  sort?: { key: string; dir: SortDir };
  /** Builds a header link that applies the next sort state. */
  hrefForSort?: (key: string, dir: SortDir) => string;
  isLoading?: boolean;
  loadingRows?: number;
  /** Rendered when there are no rows and not loading. */
  emptyState?: React.ReactNode;
  className?: string;
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" } as const;

/**
 * Generic, server-friendly table. Sorting and row links are plain anchors, so
 * no client JS is required. Interactive cells (e.g. an ActionMenu) must set
 * `relative z-10` on their content to sit above a `rowHref` stretched link.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  rowHref,
  sort,
  hrefForSort,
  isLoading,
  loadingRows = 6,
  emptyState,
  className,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingState variant="table" rows={loadingRows} />;
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-white/[0.06]", className)}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const nextDir: SortDir = active && sort?.dir === "asc" ? "desc" : "asc";
              const header = (
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable &&
                    (active ? (
                      sort?.dir === "asc" ? (
                        <ChevronUp className="size-3.5" aria-hidden />
                      ) : (
                        <ChevronDown className="size-3.5" aria-hidden />
                      )
                    ) : (
                      <ChevronsUpDown className="size-3.5 text-slate-600" aria-hidden />
                    ))}
                </span>
              );
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500",
                    alignClass[col.align ?? "left"],
                    col.headerClassName,
                  )}
                >
                  {col.sortable && hrefForSort ? (
                    <Link
                      href={hrefForSort(col.key, nextDir)}
                      className="inline-flex items-center rounded hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                    >
                      {header}
                    </Link>
                  ) : (
                    header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={getRowKey(row)}
                className="relative border-b border-white/[0.06] last:border-0 transition-colors hover:bg-white/[0.03]"
              >
                {columns.map((col, ci) => {
                  const content = col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "");
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-slate-200 align-middle",
                        alignClass[col.align ?? "left"],
                        col.className,
                      )}
                    >
                      {href && ci === 0 ? (
                        <Link
                          href={href}
                          className="font-medium text-slate-100 hover:text-white after:absolute after:inset-0 focus-visible:outline-none"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
