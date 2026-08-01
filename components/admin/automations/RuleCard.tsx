"use client";

import * as React from "react";
import { Archive, Power, PowerOff } from "lucide-react";
import { Badge, Button, useToast } from "@/components/admin/ui";
import { isActionError, type ActionResult } from "@/lib/action-result";
import type { AutomationRule, AutomationRun } from "@/types/automation";
import { runStatusBadgeVariant, runStatusLabel } from "@/types/automation";
import {
  archiveRuleAction,
  setEnabledAction,
} from "@/app/admin/(dashboard)/automations/actions";

/**
 * One rule, its arming state and its recent runs (Phase 3 · M10).
 *
 * The run list is the point of this card, not a detail. A rule that is not
 * firing and a rule that is firing and matching nothing look identical from the
 * outside; the run log is the only thing that distinguishes them, which is why
 * skipped evaluations are recorded and shown rather than dropped.
 */

interface RuleCardProps {
  rule: AutomationRule;
  runs: AutomationRun[];
}

type Pending = "toggle" | "archive" | null;

function describeTrigger(rule: AutomationRule): string {
  return rule.trigger.type === "event"
    ? `When ${rule.trigger.event.replace(/[._]/g, " ")}`
    : `On schedule ${rule.trigger.schedule}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function RuleCard({ rule, runs }: RuleCardProps) {
  const [pending, setPending] = React.useState<Pending>(null);
  const { toast } = useToast();
  const busy = pending !== null;

  async function run<T>(kind: Exclude<Pending, null>, fn: () => Promise<ActionResult<T>>, success: string) {
    if (busy) return;
    setPending(kind);
    try {
      const result = await fn();
      if (isActionError(result)) {
        toast({ variant: "error", title: result.formError ?? "That didn't work." });
      } else {
        toast({ variant: "success", title: success });
      }
    } catch (error) {
      console.error("[automations] action failed:", error);
      toast({ variant: "error", title: "That didn't work. Please try again." });
    } finally {
      setPending(null);
    }
  }

  return (
    <article className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{rule.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{describeTrigger(rule)}</p>
          {rule.description && <p className="mt-1 text-xs text-slate-500">{rule.description}</p>}
        </div>
        <Badge variant={rule.enabled ? "success" : "neutral"}>
          {rule.enabled ? "Active" : "Off"}
        </Badge>
      </header>

      <dl className="mb-4 space-y-1 text-xs">
        {rule.conditions.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-600">When</dt>
            <dd className="min-w-0 text-slate-300">
              {rule.conditions.map((c) => `${c.field} ${c.op} ${JSON.stringify(c.value ?? "")}`).join(" and ")}
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-slate-600">Then</dt>
          <dd className="min-w-0 text-slate-300">
            {rule.actions.map((a) => a.action.replace(/_/g, " ")).join(", ")}
          </dd>
        </div>
      </dl>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={rule.enabled ? "secondary" : "primary"}
          disabled={busy}
          isLoading={pending === "toggle"}
          onClick={() =>
            run(
              "toggle",
              () => setEnabledAction(rule.id, !rule.enabled),
              rule.enabled ? "Rule turned off." : "Rule is now active.",
            )
          }
        >
          {rule.enabled ? <PowerOff className="size-3.5" aria-hidden /> : <Power className="size-3.5" aria-hidden />}
          {rule.enabled ? "Turn off" : "Turn on"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          isLoading={pending === "archive"}
          onClick={() => run("archive", () => archiveRuleAction(rule.id), "Rule archived.")}
        >
          <Archive className="size-3.5" aria-hidden />
          Archive
        </Button>
      </div>

      <section aria-label={`Recent runs for ${rule.name}`}>
        <h4 className="text-xs font-medium text-slate-500">Recent runs</h4>
        {runs.length === 0 ? (
          <p className="mt-1 text-xs text-slate-600">
            {rule.enabled ? "No runs yet." : "This rule is off, so it has not run."}
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {runs.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={runStatusBadgeVariant(entry.status)}>{runStatusLabel(entry.status)}</Badge>
                <span className="text-slate-500">{formatDateTime(entry.created_at)}</span>
                {entry.reason && <span className="text-slate-600">{entry.reason}</span>}
                {entry.action_results.length > 0 && (
                  <span className="text-slate-600">
                    {entry.action_results.map((r) => `${r.action}: ${r.status}`).join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
