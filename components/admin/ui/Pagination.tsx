import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Build the href for a given page number (server-friendly navigation). */
  hrefForPage: (page: number) => string;
  className?: string;
}

/**
 * Numbered, server-friendly pagination. Renders anchor links (no client JS).
 * For high-volume tables (messages) prefer a cursor variant; this covers the
 * offset case used by entity lists.
 */
export function Pagination({ page, pageSize, total, hrefForPage, className }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const linkBase =
    "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";
  const enabled = "text-slate-300 hover:bg-white/[0.06] hover:text-white";
  const disabled = "text-slate-600 pointer-events-none";

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-between gap-4", className)}
    >
      <p className="text-xs text-slate-500">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={hrefForPage(page - 1)}
          aria-label="Previous page"
          aria-disabled={page <= 1}
          className={cn(linkBase, page <= 1 ? disabled : enabled)}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Prev
        </Link>
        <span className="px-2 text-xs text-slate-500" aria-current="page">
          {page} / {pageCount}
        </span>
        <Link
          href={hrefForPage(page + 1)}
          aria-label="Next page"
          aria-disabled={page >= pageCount}
          className={cn(linkBase, page >= pageCount ? disabled : enabled)}
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
