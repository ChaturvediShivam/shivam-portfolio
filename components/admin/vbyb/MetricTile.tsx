import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MetricValue } from "@/lib/vbyb/metrics";

/**
 * Metric tile in the StatCard style, taking a display string so values like
 * "4 / 10", "$156.00", "Not tracked" and "Insufficient data" render as-is.
 */
export function MetricTile({
  label,
  value,
  detail,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "alert" | "muted";
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-2 font-semibold tabular-nums",
          tone === "muted" ? "text-base text-slate-400" : "text-2xl",
          tone === "alert" ? "text-red-400" : tone === "default" ? "text-white" : undefined,
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </>
  );

  const className = cn(
    "block rounded-lg border border-white/[0.06] bg-white/[0.02] p-4",
    href && "transition-colors hover:border-white/15 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
  );

  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/** A tile for a metric that may be "Not tracked" or "Insufficient data". */
export function MetricValueTile({ label, metric }: { label: string; metric: MetricValue }) {
  return (
    <MetricTile
      label={label}
      value={metric.display}
      detail={metric.detail}
      tone={metric.kind === "value" ? "default" : "muted"}
    />
  );
}
