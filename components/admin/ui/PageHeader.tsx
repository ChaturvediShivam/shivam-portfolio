import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional count shown under the title (e.g. "12 results"). */
  count?: number;
  countLabel?: string;
  /** Breadcrumb node, rendered above the title. */
  breadcrumb?: React.ReactNode;
  /** Right-aligned actions (primary button, etc.). */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  count,
  countLabel = "result",
  breadcrumb,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        <h1 className="text-xl font-semibold text-white truncate">{title}</h1>
        {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
        {typeof count === "number" && (
          <p className="text-sm text-slate-500 mt-1">
            {count} {count === 1 ? countLabel : `${countLabel}s`}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
