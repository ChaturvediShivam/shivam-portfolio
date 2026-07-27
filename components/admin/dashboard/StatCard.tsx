import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: number;
  icon?: React.ReactNode;
  href?: string;
  /** Emphasize the value (e.g. overdue) in red. */
  alert?: boolean;
}

/** Compact operational metric tile. Renders as a link when `href` is given. */
export function StatCard({ label, value, icon, href, alert }: StatCardProps) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className="text-slate-600 [&>svg]:size-4">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold", alert && value > 0 ? "text-red-400" : "text-white")}>{value}</p>
    </>
  );

  const className = cn(
    "block rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 transition-colors",
    href && "hover:border-white/15 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
  );

  if (href) {
    return (
      <Link href={href} aria-label={`${label}: ${value}`} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={className} aria-label={`${label}: ${value}`}>
      {inner}
    </div>
  );
}
