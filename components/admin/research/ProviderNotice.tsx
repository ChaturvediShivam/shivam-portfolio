"use client";

import { AlertTriangle, PlugZap, PowerOff } from "lucide-react";
import type { ProviderUnavailable } from "@/lib/research/types";

/**
 * Why a search returned less than it might have.
 *
 * The UI half of the architecture's central rule: "turned off", "missing a
 * credential", "errored" and "ran and found nothing" are four different
 * answers, and collapsing them into one empty state is what the whole
 * `SearchOutcome` contract exists to prevent.
 *
 * Deliberately not an error banner. An unconfigured provider is not a fault —
 * it is a setup step — so it reads as guidance and names the exact variable or
 * flag to set, rather than telling the operator to go read the code.
 */

export interface ProviderNoticeProps {
  /** Providers that never ran. */
  unavailable: readonly ProviderUnavailable[];
  /** Providers that ran and errored, already carrying a safe reason. */
  failed?: readonly { provider: string; reason: string }[];
  /** Providers that answered. Used to say how partial a result is. */
  succeeded?: readonly string[];
}

export function ProviderNotice({ unavailable, failed = [], succeeded = [] }: ProviderNoticeProps) {
  if (unavailable.length === 0 && failed.length === 0) return null;

  const disabled = unavailable.filter((entry) => entry.reason === "disabled");
  const unconfigured = unavailable.filter((entry) => entry.reason === "unconfigured");

  return (
    <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      {succeeded.length > 0 ? (
        <p className="text-[11px] text-slate-500">
          Answered by {succeeded.join(", ")}. Some sources did not run:
        </p>
      ) : null}

      {unconfigured.length > 0 ? (
        <div className="flex gap-2.5">
          <PlugZap size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-400/80" />
          <div className="min-w-0">
            <p className="text-xs text-slate-300">Not configured</p>
            <ul className="mt-1 space-y-0.5">
              {unconfigured.map((entry) => (
                <li key={entry.provider} className="text-[11px] text-slate-500">
                  <span className="text-slate-400">{entry.displayName}</span> — {entry.remedy}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {disabled.length > 0 ? (
        <div className="flex gap-2.5">
          <PowerOff size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="text-xs text-slate-300">Turned off</p>
            <ul className="mt-1 space-y-0.5">
              {disabled.map((entry) => (
                <li key={entry.provider} className="text-[11px] text-slate-500">
                  <span className="text-slate-400">{entry.displayName}</span> — {entry.remedy}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="flex gap-2.5">
          <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-red-400/80" />
          <div className="min-w-0">
            <p className="text-xs text-slate-300">Failed</p>
            <ul className="mt-1 space-y-0.5">
              {failed.map((entry) => (
                <li key={entry.provider} className="text-[11px] text-slate-500">
                  <span className="text-slate-400">{entry.provider}</span> — {entry.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The empty state, told apart from "nothing ran".
 *
 * `searched` false means no query yet; `ran` false means no provider could
 * answer. Only when a provider actually ran and returned nothing do we say the
 * search found nothing — anything else would imply the world is empty when in
 * fact we never looked.
 */
export function ResearchEmpty({
  searched,
  ran,
  noun,
}: {
  searched: boolean;
  ran: boolean;
  noun: string;
}) {
  if (!searched) {
    return <p className="text-xs text-slate-500">Enter a query to search {noun}.</p>;
  }
  if (!ran) {
    return (
      <p className="text-xs text-amber-400/80">
        No {noun} source could run, so nothing was searched. See above for what to enable.
      </p>
    );
  }
  return <p className="text-xs text-slate-500">No {noun} matched that query.</p>;
}
