import Link from "next/link";
import { Badge, buttonClasses } from "@/components/admin/ui";
import { Field, Section, dash } from "@/components/admin/vbyb/Section";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { formatDateTime, formatHours } from "@/lib/vbyb/format";
import type { ValidationWorkspace } from "@/lib/vbyb/validations";
import { dueAt, isOverdue } from "@/lib/vbyb/workflow";
import {
  DECISION_LABELS,
  EVIDENCE_ORIGIN_LABELS,
  IDEA_FIELDS,
  VALIDATION_STATUS_LABELS,
  humanize,
  riskVariant,
  strengthVariant,
  validationStatusVariant,
} from "@/types/vbyb";

/**
 * Read-only view of one order's Validation File: the customer's submission,
 * the validation record, its assumptions and evidence, and delivery. Editing
 * happens in the validation workspace; this is for scanning an order at a glance.
 */
export function ValidationSummary({ workspace }: { workspace: ValidationWorkspace }) {
  const { validation: v, submission, assumptions, evidence } = workspace;
  const killer = assumptions.find((a) => a.id === v.killer_assumption_id) ?? null;
  const deliveryHours =
    v.delivered_at && v.submitted_at ? (Date.parse(v.delivered_at) - Date.parse(v.submitted_at)) / 3_600_000 : null;
  const due = dueAt(v.submitted_at);
  const workspaceHref = `${VBYB_BASE_PATH}/validations/${v.id}`;

  return (
    <>
      <Section
        title="Submission"
        description={
          submission
            ? `Received ${formatDateTime(submission.submitted_at)} · matched by ${submission.matched_by ?? "—"}`
            : "No submission linked yet. Payment and submission are separate — this order is waiting for the customer's idea."
        }
      >
        {submission ? (
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {IDEA_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <span className="whitespace-pre-wrap">{submission.fields?.[f.key] || "—"}</span>
              </Field>
            ))}
            {(submission.fields?.unmapped ?? []).map((u, i) => (
              <Field key={`unmapped-${i}`} label={`${u.label} (unmapped question)`}>
                <span className="whitespace-pre-wrap">{u.value}</span>
              </Field>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">Nothing to show yet.</p>
        )}
      </Section>

      <Section
        title="Validation"
        actions={
          <Link href={workspaceHref} className={buttonClasses("secondary", "sm")}>
            Open workspace
          </Link>
        }
      >
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Status">
            <Badge variant={validationStatusVariant(v.status)}>{VALIDATION_STATUS_LABELS[v.status]}</Badge>
          </Field>
          <Field label="Status changed">{formatDateTime(v.status_changed_at)}</Field>
          <Field label="Started">{formatDateTime(v.started_at)}</Field>
          <Field label="Decision">
            {v.decision ? <span className="font-semibold">{DECISION_LABELS[v.decision]}</span> : <span className="text-slate-400">Undecided</span>}
          </Field>
          <Field label="Decided">{formatDateTime(v.decided_at)}</Field>
          <Field label="Confidence">{v.decision_confidence ? humanize(v.decision_confidence) : dash}</Field>
        </dl>
        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-white/[0.06] pt-5 md:grid-cols-2">
          <Field label="Decision rationale">
            <span className="whitespace-pre-wrap">{v.decision_rationale || "—"}</span>
          </Field>
          <Field label="Assumption most likely to kill the idea">
            {killer ? (
              <span className="whitespace-pre-wrap">
                {killer.assumption} <Badge variant={riskVariant(killer.risk_level)}>{killer.risk_level.toUpperCase()}</Badge>
              </span>
            ) : (
              "Not chosen"
            )}
          </Field>
          <Field label="Key risk">
            <span className="whitespace-pre-wrap">{v.key_risk || "—"}</span>
          </Field>
          <Field label="Falsifier">
            <span className="whitespace-pre-wrap">{v.falsifier || "—"}</span>
          </Field>
          <Field label="Cheapest test">
            <span className="whitespace-pre-wrap">{v.test_description || "—"}</span>
          </Field>
          <Field label="Test status and thresholds">
            {humanize(v.test_status)}
            {v.test_success_threshold ? ` · success: ${v.test_success_threshold}` : ""}
            {v.test_kill_threshold ? ` · kill: ${v.test_kill_threshold}` : ""}
          </Field>
        </dl>
      </Section>

      <Section title={`Assumptions (${assumptions.length})`}>
        {assumptions.length === 0 ? (
          <p className="text-sm text-slate-500">No assumptions recorded.</p>
        ) : (
          <ul className="space-y-3">
            {assumptions.map((a) => (
              <li key={a.id} className="space-y-1 text-sm">
                <p className="text-slate-200">
                  <Badge variant={riskVariant(a.risk_level)}>{a.risk_level.toUpperCase()}</Badge> {a.assumption}
                </p>
                {a.falsifier && <p className="text-xs text-slate-500">Falsifier: {a.falsifier}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Evidence (${evidence.length})`}
        description="AI output is not evidence. Anything without a real source stays UNKNOWN."
      >
        {evidence.length === 0 ? (
          <p className="text-sm text-slate-500">
            No evidence recorded — every assumption is <span className="font-semibold">UNKNOWN</span>.
          </p>
        ) : (
          <ul className="space-y-3">
            {evidence.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-slate-200">{e.evidence_text}</p>
                  <p className="text-xs text-slate-500">
                    {e.source} · {EVIDENCE_ORIGIN_LABELS[e.origin]}
                    {e.provided_by_customer ? " · provided by customer" : ""}
                  </p>
                </div>
                <Badge variant={strengthVariant(e.strength)}>{e.strength.toUpperCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Delivery">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Delivery status">
            {v.delivered_at ? <Badge variant="success">Delivered</Badge> : <Badge variant="neutral">Not delivered</Badge>}
          </Field>
          <Field label="Delivered">{formatDateTime(v.delivered_at)}</Field>
          <Field label="Delivery time">{deliveryHours != null && deliveryHours >= 0 ? formatHours(deliveryHours) : dash}</Field>
          <Field label="Due">
            {due && !v.delivered_at && v.status !== "refunded" ? (
              isOverdue(v) ? (
                <Badge variant="danger">Overdue · {formatDateTime(due.toISOString())}</Badge>
              ) : (
                formatDateTime(due.toISOString())
              )
            ) : (
              dash
            )}
          </Field>
        </dl>
      </Section>
    </>
  );
}
