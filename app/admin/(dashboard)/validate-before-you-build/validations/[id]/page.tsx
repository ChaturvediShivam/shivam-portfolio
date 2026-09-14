import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, PageHeader } from "@/components/admin/ui";
import { ActivityFeed } from "@/components/admin/vbyb/ActivityFeed";
import { AssumptionsPanel, EvidencePanel } from "@/components/admin/vbyb/LedgerPanels";
import { SectionForm, type SectionFieldDef } from "@/components/admin/vbyb/SectionForm";
import { Field, Section, dash } from "@/components/admin/vbyb/Section";
import { ValidationStatusControl } from "@/components/admin/vbyb/ValidationStatusControl";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { formatDate, formatDateTime, formatMoney } from "@/lib/vbyb/format";
import { getValidationWorkspace } from "@/lib/vbyb/validations";
import { dueAt, isOverdue, missingForDelivery } from "@/lib/vbyb/workflow";
import {
  CONFIDENCE_LEVELS,
  DECISIONS,
  DECISION_LABELS,
  IDEA_FIELDS,
  TEST_STATUSES,
  VALIDATION_STATUS_LABELS,
  humanize,
  riskVariant,
  validationStatusVariant,
} from "@/types/vbyb";

export const metadata = { title: "Validation File · Validate Before You Build" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const IDEA_FORM: SectionFieldDef[] = IDEA_FIELDS.map((f) => ({ name: f.key, label: f.label, kind: "textarea", rows: 3 }));

const TEST_FORM: SectionFieldDef[] = [
  { name: "key_risk", label: "Key risk", kind: "textarea", rows: 2 },
  {
    name: "falsifier",
    label: "Falsifier",
    kind: "textarea",
    rows: 2,
    hint: "What evidence would make us stop?",
  },
  {
    name: "test_description",
    label: "Cheapest test",
    kind: "textarea",
    rows: 2,
    hint: "What is the cheapest test that can answer this?",
  },
  { name: "test_hypothesis", label: "Hypothesis", kind: "textarea", rows: 2 },
  { name: "test_success_threshold", label: "Success threshold", kind: "text" },
  { name: "test_kill_threshold", label: "Kill threshold", kind: "text" },
  { name: "test_deadline", label: "Deadline", kind: "date" },
  {
    name: "test_status",
    label: "Test status",
    kind: "select",
    options: TEST_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
  },
  { name: "test_result", label: "Result", kind: "textarea", rows: 3 },
  { name: "test_notes", label: "Test notes", kind: "textarea", rows: 2 },
];

const DECISION_FORM: SectionFieldDef[] = [
  {
    name: "decision",
    label: "Decision",
    kind: "select",
    placeholder: "No decision yet",
    options: DECISIONS.map((d) => ({ value: d, label: DECISION_LABELS[d] })),
    required: true,
  },
  { name: "decided_on", label: "Decision date", kind: "date", hint: "Defaults to today when a decision is recorded.", required: true },
  {
    name: "decision_confidence",
    label: "Confidence",
    kind: "select",
    placeholder: "Not set",
    options: CONFIDENCE_LEVELS.map((c) => ({ value: c, label: humanize(c) })),
  },
  {
    name: "decision_rationale",
    label: "Decision rationale",
    kind: "textarea",
    rows: 4,
    required: true,
    hint: "Grounded in the evidence ledger. Unsupported claims stay UNKNOWN.",
  },
  { name: "evidence_summary", label: "Evidence summary", kind: "textarea", rows: 3 },
];

const NOTES_FORM: SectionFieldDef[] = [{ name: "internal_notes", label: "Internal notes", kind: "textarea", rows: 6 }];

function pick(source: Record<string, unknown>, names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, source[n] == null ? "" : String(source[n])]));
}

export default async function VbybValidationWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  const { db } = await requireVbybAdminPage();
  const workspace = await getValidationWorkspace(db, id);
  if (!workspace) notFound();

  const { validation: v, customer, order, submission, additionalSubmissions, assumptions, evidence, events } = workspace;
  const record = v as unknown as Record<string, unknown>;
  const killer = assumptions.find((a) => a.id === v.killer_assumption_id) ?? null;
  const missing = missingForDelivery(v);
  const overdue = isOverdue(v);
  const due = dueAt(v.submitted_at);

  const decisionInitial = {
    ...pick(record, ["decision", "decision_confidence", "decision_rationale", "evidence_summary"]),
    decided_on: v.decided_at ? v.decided_at.slice(0, 10) : "",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer?.name || customer?.email || "Validation File"}
        description={v.idea_what ? v.idea_what.slice(0, 180) : "No idea submitted yet."}
        breadcrumb={
          <Link
            href={`${VBYB_BASE_PATH}/validations`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft size={12} aria-hidden="true" /> Validations
          </Link>
        }
        actions={<ValidationStatusControl validationId={v.id} status={v.status} missingForDelivery={missing} />}
      />

      <Section title="Summary">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Status">
            <Badge variant={validationStatusVariant(v.status)}>{VALIDATION_STATUS_LABELS[v.status]}</Badge>
          </Field>
          <Field label="Decision">{v.decision ? <span className="font-semibold">{DECISION_LABELS[v.decision]}</span> : dash}</Field>
          <Field label="Submitted">{formatDateTime(v.submitted_at)}</Field>
          <Field label="Due">
            {due && v.status !== "delivered" && v.status !== "refunded" ? (
              overdue ? (
                <Badge variant="danger">Overdue · {formatDateTime(due.toISOString())}</Badge>
              ) : (
                formatDateTime(due.toISOString())
              )
            ) : (
              dash
            )}
          </Field>
          <Field label="Customer">{customer?.email ?? dash}</Field>
          <Field label="Order">
            {order ? (
              <Link href={`${VBYB_BASE_PATH}/orders/${order.id}`} className="hover:underline">
                {formatMoney(order.amount_cents, order.currency)} · {formatDate(order.purchased_at)}
              </Link>
            ) : (
              dash
            )}
          </Field>
          <Field label="Delivered">{formatDateTime(v.delivered_at)}</Field>
          <Field label="Flags">
            <span className="flex flex-wrap gap-1">
              {order?.is_test && <Badge variant="special">Test</Badge>}
              {order?.payment_status === "refunded" && <Badge variant="danger">Refunded</Badge>}
              {!order?.is_test && order?.payment_status !== "refunded" && dash}
            </span>
          </Field>
        </dl>
      </Section>

      <Section
        title="Assumption most likely to kill this idea"
        className={killer ? "border-red-500/30" : undefined}
      >
        {killer ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={riskVariant(killer.risk_level)}>{killer.risk_level.toUpperCase()} risk</Badge>
              <Badge variant="neutral">{humanize(killer.status)}</Badge>
            </div>
            <p className="text-base font-medium text-white">{killer.assumption}</p>
            {killer.falsifier && <p className="text-sm text-slate-400">Falsifier: {killer.falsifier}</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {assumptions.length === 0
              ? "No assumptions yet. Map what must be true, then mark the one most likely to kill the idea."
              : "Not chosen yet. Mark one in the assumptions list below."}
          </p>
        )}
      </Section>

      <Section
        title="Idea"
        description="Working copy seeded from the customer's submission. The original stays untouched below."
      >
        <SectionForm
          validationId={v.id}
          section="idea"
          fields={IDEA_FORM}
          initial={pick(record, IDEA_FIELDS.map((f) => f.key))}
          submitLabel="Save idea"
        />
        <details className="mt-6 border-t border-white/[0.06] pt-4">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
            Original submission{submission ? ` · ${formatDateTime(submission.submitted_at)}` : " · none linked"}
          </summary>
          {submission ? (
            <div className="mt-4 space-y-4">
              <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {IDEA_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <span className="whitespace-pre-wrap">{submission.fields?.[f.key] || "—"}</span>
                  </Field>
                ))}
                {(submission.fields?.unmapped ?? []).map((u, i) => (
                  <Field key={`unmapped-${i}`} label={`${u.label} (unmapped)`}>
                    <span className="whitespace-pre-wrap">{u.value}</span>
                  </Field>
                ))}
              </dl>
              <details>
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Raw payload</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-black/30 p-3 text-xs text-slate-300">
                  {JSON.stringify(submission.raw_payload, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No submission is linked to this order yet.</p>
          )}
          {additionalSubmissions.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {additionalSubmissions.length} additional submission{additionalSubmissions.length === 1 ? "" : "s"} received for
              this order.
            </p>
          )}
        </details>
      </Section>

      <Section
        title="Evidence ledger"
        description="What is actually known, and where it came from. AI output is not evidence: anything without a real source stays UNKNOWN."
      >
        <EvidencePanel
          validationId={v.id}
          evidence={evidence}
          assumptions={assumptions.map((a) => ({ id: a.id, assumption: a.assumption }))}
        />
      </Section>

      <Section title="Assumptions" description="What must be true for this idea to work, and how dangerous each one is.">
        <AssumptionsPanel
          validationId={v.id}
          assumptions={assumptions}
          evidence={evidence.map((e) => ({ assumption_id: e.assumption_id, strength: e.strength }))}
          killerAssumptionId={v.killer_assumption_id}
        />
      </Section>

      <Section title="Falsifier and cheapest test">
        <SectionForm
          validationId={v.id}
          section="test"
          fields={TEST_FORM}
          initial={pick(record, TEST_FORM.map((f) => f.name))}
          submitLabel="Save test"
        />
      </Section>

      <Section
        title="Decision"
        description="BUILD, TEST MORE, PARK or KILL — a conclusion drawn from the evidence ledger above, not evidence itself. A decision, its date and a rationale are required before delivery."
      >
        <SectionForm
          validationId={v.id}
          section="decision"
          fields={DECISION_FORM}
          initial={decisionInitial}
          submitLabel="Record decision"
        />
      </Section>

      <Section title="Internal notes">
        <SectionForm
          validationId={v.id}
          section="notes"
          fields={NOTES_FORM}
          initial={pick(record, ["internal_notes"])}
          submitLabel="Save notes"
        />
      </Section>

      <Section title="Activity">
        <ActivityFeed events={events} />
      </Section>
    </div>
  );
}
