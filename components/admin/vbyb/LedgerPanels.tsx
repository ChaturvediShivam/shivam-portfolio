"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, ConfirmDialog, Dialog, FormField, Select, TextInput, Textarea, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { formatDate } from "@/lib/vbyb/format";
import {
  ASSUMPTION_STATUSES,
  CONFIDENCE_LEVELS,
  EVIDENCE_ORIGINS,
  EVIDENCE_ORIGIN_LABELS,
  EVIDENCE_STRENGTHS,
  RISK_LEVELS,
  humanize,
  riskVariant,
  strengthVariant,
  type EvidenceStrength,
  type VbybAssumption,
  type VbybEvidence,
} from "@/types/vbyb";
import {
  deleteAssumptionAction,
  deleteEvidenceAction,
  saveAssumptionAction,
  saveEvidenceAction,
  setKillerAssumptionAction,
} from "@/app/admin/(dashboard)/validate-before-you-build/actions";

const STRENGTH_RANK: Record<EvidenceStrength, number> = { unknown: 0, weak: 1, moderate: 2, strong: 3 };

function StrengthBadge({ strength }: { strength: EvidenceStrength }) {
  return <Badge variant={strengthVariant(strength)}>{strength.toUpperCase()}</Badge>;
}

function useActionRunner() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const run = React.useCallback(
    (
      action: () => Promise<{ ok: boolean; formError?: string; fieldErrors?: Record<string, string> }>,
      messages: { success: string; failure: string },
      onDone?: (fieldErrors: Record<string, string> | null) => void,
    ) => {
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          toast({ variant: "error", title: messages.failure, description: result.formError });
          onDone?.(result.fieldErrors ?? {});
          return;
        }
        toast({ variant: "success", title: messages.success });
        onDone?.(null);
        router.refresh();
      });
    },
    [router, toast],
  );

  return { pending, run };
}

// ---------------------------------------------------------------------------
// Evidence ledger
// ---------------------------------------------------------------------------

type EvidenceForm = {
  evidence_text: string;
  source: string;
  source_url: string;
  evidence_date: string;
  strength: string;
  origin: string;
  provided_by_customer: boolean;
  assumption_id: string;
  notes: string;
};

const EMPTY_EVIDENCE: EvidenceForm = {
  evidence_text: "",
  source: "",
  source_url: "",
  evidence_date: "",
  strength: "unknown",
  origin: "",
  provided_by_customer: false,
  assumption_id: "",
  notes: "",
};

function evidenceToForm(e: VbybEvidence): EvidenceForm {
  return {
    evidence_text: e.evidence_text,
    source: e.source,
    source_url: e.source_url ?? "",
    evidence_date: e.evidence_date ?? "",
    strength: e.strength,
    origin: e.origin,
    provided_by_customer: e.provided_by_customer,
    assumption_id: e.assumption_id ?? "",
    notes: e.notes ?? "",
  };
}

export function EvidencePanel({
  validationId,
  evidence,
  assumptions,
}: {
  validationId: string;
  evidence: VbybEvidence[];
  assumptions: Pick<VbybAssumption, "id" | "assumption">[];
}) {
  const { pending, run } = useActionRunner();
  const [editing, setEditing] = React.useState<{ id: string | null; form: EvidenceForm } | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const assumptionLabel = (id: string | null) => assumptions.find((a) => a.id === id)?.assumption ?? null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    run(
      () => saveEvidenceAction(validationId, editing.id, editing.form),
      { success: "Evidence saved", failure: "Evidence not saved" },
      (fieldErrors) => {
        if (fieldErrors) setErrors(fieldErrors);
        else {
          setErrors({});
          setEditing(null);
        }
      },
    );
  }

  const set = <K extends keyof EvidenceForm>(key: K, value: EvidenceForm[K]) =>
    setEditing((current) => (current ? { ...current, form: { ...current.form, [key]: value } } : current));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing({ id: null, form: EMPTY_EVIDENCE })}>
          Add evidence
        </Button>
      </div>

      {evidence.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
          No evidence recorded. Until something is sourced, every assumption is <span className="font-semibold">UNKNOWN</span>.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {evidence.map((item) => {
            const linked = assumptionLabel(item.assumption_id);
            return (
              <li key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <p className="whitespace-pre-wrap text-sm text-slate-200">{item.evidence_text}</p>
                  <p className="text-xs text-slate-500">
                    {item.source_url ? (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
                        {item.source}
                      </a>
                    ) : (
                      item.source
                    )}
                    {item.evidence_date ? ` · ${formatDate(item.evidence_date)}` : ""} · {EVIDENCE_ORIGIN_LABELS[item.origin]}
                    {item.provided_by_customer ? " · provided by customer" : ""}
                  </p>
                  {linked && <p className="text-xs text-slate-500">Supports: {linked}</p>}
                  {item.notes && <p className="whitespace-pre-wrap text-xs text-slate-500">{item.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StrengthBadge strength={item.strength} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: item.id, form: evidenceToForm(item) })}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(item.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={editing != null}
        onClose={() => {
          setEditing(null);
          setErrors({});
        }}
        title={editing?.id ? "Edit evidence" : "Add evidence"}
        description="Record what was observed and where it came from. AI output is not evidence — if a claim has no real source, leave its strength UNKNOWN."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" form="vbyb-evidence-form" isLoading={pending}>
              Save evidence
            </Button>
          </>
        }
      >
        {editing && (
          <form id="vbyb-evidence-form" onSubmit={save} className="space-y-4" noValidate>
            <FormField label="Evidence" htmlFor="ev-text" required error={errors.evidence_text}>
              <Textarea rows={3} value={editing.form.evidence_text} onChange={(e) => set("evidence_text", e.target.value)} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Source" htmlFor="ev-source" required error={errors.source}>
                <TextInput value={editing.form.source} onChange={(e) => set("source", e.target.value)} />
              </FormField>
              <FormField label="Source URL" htmlFor="ev-url" error={errors.source_url}>
                <TextInput type="url" value={editing.form.source_url} onChange={(e) => set("source_url", e.target.value)} />
              </FormField>
              <FormField label="Origin" htmlFor="ev-origin" required error={errors.origin}>
                <Select
                  value={editing.form.origin}
                  onChange={(e) => set("origin", e.target.value)}
                  placeholder="Where did this come from?"
                  options={EVIDENCE_ORIGINS.map((o) => ({ value: o, label: EVIDENCE_ORIGIN_LABELS[o] }))}
                />
              </FormField>
              <FormField label="Strength" htmlFor="ev-strength" error={errors.strength}>
                <Select
                  value={editing.form.strength}
                  onChange={(e) => set("strength", e.target.value)}
                  options={EVIDENCE_STRENGTHS.map((s) => ({ value: s, label: s.toUpperCase() }))}
                />
              </FormField>
              <FormField label="Date observed" htmlFor="ev-date" error={errors.evidence_date}>
                <TextInput type="date" value={editing.form.evidence_date} onChange={(e) => set("evidence_date", e.target.value)} />
              </FormField>
              <FormField label="Supports assumption" htmlFor="ev-assumption" error={errors.assumption_id}>
                <Select
                  value={editing.form.assumption_id}
                  onChange={(e) => set("assumption_id", e.target.value)}
                  placeholder="Not linked"
                  options={assumptions.map((a) => ({ value: a.id, label: a.assumption.slice(0, 80) }))}
                />
              </FormField>
            </div>
            <FormField label="Notes" htmlFor="ev-notes" error={errors.notes}>
              <Textarea rows={2} value={editing.form.notes} onChange={(e) => set("notes", e.target.value)} />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={editing.form.provided_by_customer}
                onChange={(e) => set("provided_by_customer", e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-transparent"
              />
              Provided by the customer
            </label>
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting != null}
        title="Delete this evidence?"
        description="The entry is removed from the ledger. This cannot be undone."
        confirmLabel="Delete"
        destructive
        isPending={pending}
        onConfirm={() =>
          deleting &&
          run(() => deleteEvidenceAction(deleting), { success: "Evidence deleted", failure: "Evidence not deleted" }, () =>
            setDeleting(null),
          )
        }
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

type AssumptionForm = {
  assumption: string;
  why_it_matters: string;
  confidence: string;
  risk_level: string;
  falsifier: string;
  test_required: string;
  status: string;
};

const EMPTY_ASSUMPTION: AssumptionForm = {
  assumption: "",
  why_it_matters: "",
  confidence: "",
  risk_level: "",
  falsifier: "",
  test_required: "",
  status: "untested",
};

export function AssumptionsPanel({
  validationId,
  assumptions,
  evidence,
  killerAssumptionId,
}: {
  validationId: string;
  assumptions: VbybAssumption[];
  evidence: Pick<VbybEvidence, "assumption_id" | "strength">[];
  killerAssumptionId: string | null;
}) {
  const { pending, run } = useActionRunner();
  const [editing, setEditing] = React.useState<{ id: string | null; form: AssumptionForm } | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [deleting, setDeleting] = React.useState<string | null>(null);

  function support(assumptionId: string): { count: number; strongest: EvidenceStrength } {
    const linked = evidence.filter((e) => e.assumption_id === assumptionId);
    const strongest = linked.reduce<EvidenceStrength>(
      (best, e) => (STRENGTH_RANK[e.strength] > STRENGTH_RANK[best] ? e.strength : best),
      "unknown",
    );
    return { count: linked.length, strongest };
  }

  const set = <K extends keyof AssumptionForm>(key: K, value: string) =>
    setEditing((current) => (current ? { ...current, form: { ...current.form, [key]: value } } : current));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    run(
      () => saveAssumptionAction(validationId, editing.id, editing.form),
      { success: "Assumption saved", failure: "Assumption not saved" },
      (fieldErrors) => {
        if (fieldErrors) setErrors(fieldErrors);
        else {
          setErrors({});
          setEditing(null);
        }
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing({ id: null, form: EMPTY_ASSUMPTION })}>
          Add assumption
        </Button>
      </div>

      {assumptions.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
          No assumptions yet. Start with what must be true for this idea to work.
        </p>
      ) : (
        <ul className="space-y-3">
          {assumptions.map((a) => {
            const isKiller = a.id === killerAssumptionId;
            const { count, strongest } = support(a.id);
            return (
              <li
                key={a.id}
                className={
                  isKiller
                    ? "rounded-lg border border-red-500/30 bg-red-500/[0.05] p-4"
                    : "rounded-lg border border-white/[0.06] p-4"
                }
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isKiller && <Badge variant="danger">Most likely to kill this idea</Badge>}
                      <Badge variant={riskVariant(a.risk_level)}>{a.risk_level.toUpperCase()} risk</Badge>
                      <Badge variant="neutral">{humanize(a.status)}</Badge>
                      {a.confidence && <Badge variant="neutral">{humanize(a.confidence)} confidence</Badge>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm font-medium text-slate-100">{a.assumption}</p>
                    {a.why_it_matters && <p className="text-xs text-slate-400">Why it matters: {a.why_it_matters}</p>}
                    {a.falsifier && <p className="text-xs text-slate-400">Falsifier: {a.falsifier}</p>}
                    {a.test_required && <p className="text-xs text-slate-400">Test required: {a.test_required}</p>}
                    <p className="text-xs text-slate-500">
                      Evidence:{" "}
                      {count === 0 ? (
                        <span className="font-semibold text-slate-400">UNKNOWN — none linked</span>
                      ) : (
                        <>
                          {count} linked, strongest <StrengthBadge strength={strongest} />
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isKiller ? "ghost" : "secondary"}
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setKillerAssumptionAction(validationId, isKiller ? null : a.id),
                          { success: isKiller ? "Cleared" : "Marked as most likely to kill", failure: "Not updated" },
                        )
                      }
                    >
                      {isKiller ? "Clear" : "Most likely to kill"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          id: a.id,
                          form: {
                            assumption: a.assumption,
                            why_it_matters: a.why_it_matters ?? "",
                            confidence: a.confidence ?? "",
                            risk_level: a.risk_level,
                            falsifier: a.falsifier ?? "",
                            test_required: a.test_required ?? "",
                            status: a.status,
                          },
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(a.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={editing != null}
        onClose={() => {
          setEditing(null);
          setErrors({});
        }}
        title={editing?.id ? "Edit assumption" : "Add assumption"}
        description="What must be true for this idea to work?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" form="vbyb-assumption-form" isLoading={pending}>
              Save assumption
            </Button>
          </>
        }
      >
        {editing && (
          <form id="vbyb-assumption-form" onSubmit={save} className="space-y-4" noValidate>
            <FormField label="Assumption" htmlFor="as-text" required error={errors.assumption}>
              <Textarea rows={2} value={editing.form.assumption} onChange={(e) => set("assumption", e.target.value)} />
            </FormField>
            <FormField label="Why it matters" htmlFor="as-why" error={errors.why_it_matters}>
              <Textarea rows={2} value={editing.form.why_it_matters} onChange={(e) => set("why_it_matters", e.target.value)} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="Risk level" htmlFor="as-risk" required error={errors.risk_level}>
                <Select
                  value={editing.form.risk_level}
                  onChange={(e) => set("risk_level", e.target.value)}
                  placeholder="Choose…"
                  options={RISK_LEVELS.map((r) => ({ value: r, label: r.toUpperCase() }))}
                />
              </FormField>
              <FormField label="Confidence" htmlFor="as-confidence" error={errors.confidence}>
                <Select
                  value={editing.form.confidence}
                  onChange={(e) => set("confidence", e.target.value)}
                  placeholder="Not set"
                  options={CONFIDENCE_LEVELS.map((c) => ({ value: c, label: humanize(c) }))}
                />
              </FormField>
              <FormField label="Status" htmlFor="as-status" error={errors.status}>
                <Select
                  value={editing.form.status}
                  onChange={(e) => set("status", e.target.value)}
                  options={ASSUMPTION_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
                />
              </FormField>
            </div>
            <FormField label="Falsifier" htmlFor="as-falsifier" hint="What evidence would make us stop?" error={errors.falsifier}>
              <Textarea rows={2} value={editing.form.falsifier} onChange={(e) => set("falsifier", e.target.value)} />
            </FormField>
            <FormField label="Test required" htmlFor="as-test" error={errors.test_required}>
              <Textarea rows={2} value={editing.form.test_required} onChange={(e) => set("test_required", e.target.value)} />
            </FormField>
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting != null}
        title="Delete this assumption?"
        description="Evidence linked to it is kept but unlinked."
        confirmLabel="Delete"
        destructive
        isPending={pending}
        onConfirm={() =>
          deleting &&
          run(() => deleteAssumptionAction(deleting), { success: "Assumption deleted", failure: "Assumption not deleted" }, () =>
            setDeleting(null),
          )
        }
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
