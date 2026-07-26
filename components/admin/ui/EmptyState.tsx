import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Usually a lucide icon element, e.g. <Inbox />. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Primary CTA (a Button or Link). */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-16 rounded-lg border border-white/[0.06] bg-white/[0.02]",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-white/[0.03] text-slate-400 [&>svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
