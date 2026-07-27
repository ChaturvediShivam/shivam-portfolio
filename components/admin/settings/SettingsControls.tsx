import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/admin/ui";

/** A labelled read-only value row. */
export function SettingRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="text-sm text-slate-200 sm:text-right">{value}</div>
    </div>
  );
}

/**
 * Placeholder toggle switch. Visually present but disabled (aria-disabled) — no
 * persistence exists yet, so it never operates; it advertises a future feature.
 */
export function SettingToggle({
  label,
  description,
  defaultOn = false,
}: {
  label: string;
  description?: string;
  defaultOn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-slate-300">{label}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      <span
        role="switch"
        aria-checked={defaultOn}
        aria-disabled="true"
        aria-label={`${label} (coming soon)`}
        title="Coming soon"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full opacity-50 transition-colors",
          defaultOn ? "bg-emerald-500/50" : "bg-white/10",
        )}
      >
        <span className={cn("inline-block size-4 rounded-full bg-slate-300 transition-transform", defaultOn ? "translate-x-4" : "translate-x-0.5")} />
      </span>
    </div>
  );
}

export type IntegrationStatus = "connected" | "not_connected" | "coming_soon";

export function IntegrationCard({
  name,
  description,
  status,
  detail,
}: {
  name: string;
  description: string;
  status: IntegrationStatus;
  detail?: string;
}) {
  const badge =
    status === "connected" ? (
      <Badge variant="success" dot>
        Connected
      </Badge>
    ) : status === "coming_soon" ? (
      <Badge variant="neutral">Coming soon</Badge>
    ) : (
      <Badge variant="neutral">Not connected</Badge>
    );

  return (
    <div className="flex flex-col justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-200">{name}</p>
          {badge}
        </div>
        <p className="mt-1 text-xs text-slate-500">{detail ?? description}</p>
      </div>
      <div className="mt-4">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Coming soon"
          className="w-full cursor-not-allowed rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-500"
        >
          {status === "connected" ? "Manage" : "Connect"}
        </button>
      </div>
    </div>
  );
}
