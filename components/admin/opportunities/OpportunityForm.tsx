"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextInput,
  Select,
  Button,
  buttonClasses,
  EntityPicker,
  useToast,
  type EntityOption,
} from "@/components/admin/ui";
import {
  EMPLOYMENT_TYPES,
  LOCATION_TYPES,
  OPPORTUNITY_STAGES,
  humanize,
  type Opportunity,
  type OpportunityInput,
} from "@/types/opportunity";
import { isActionError } from "@/lib/action-result";
import {
  createOpportunityAction,
  updateOpportunityAction,
  searchCompaniesAction,
  searchContactsAction,
} from "@/app/admin/(dashboard)/opportunities/actions";

type TextField =
  | "title"
  | "stage"
  | "source"
  | "job_url"
  | "location"
  | "location_type"
  | "employment_type"
  | "seniority"
  | "work_authorization"
  | "application_method"
  | "salary_min"
  | "salary_max"
  | "salary_currency"
  | "applied_at"
  | "next_action_at";

type Values = Record<TextField, string>;

const EMPTY: Values = {
  title: "",
  stage: "lead",
  source: "",
  job_url: "",
  location: "",
  location_type: "",
  employment_type: "",
  seniority: "",
  work_authorization: "",
  application_method: "",
  salary_min: "",
  salary_max: "",
  salary_currency: "USD",
  applied_at: "",
  next_action_at: "",
};

const dateOnly = (v: string | null) => (v ? v.slice(0, 10) : "");

function fromOpportunity(o: Opportunity): Values {
  return {
    title: o.title ?? "",
    stage: o.stage ?? "lead",
    source: o.source ?? "",
    job_url: o.job_url ?? "",
    location: o.location ?? "",
    location_type: o.location_type ?? "",
    employment_type: o.employment_type ?? "",
    seniority: o.seniority ?? "",
    work_authorization: o.work_authorization ?? "",
    application_method: o.application_method ?? "",
    salary_min: o.salary_min != null ? String(o.salary_min) : "",
    salary_max: o.salary_max != null ? String(o.salary_max) : "",
    salary_currency: o.salary_currency ?? "USD",
    applied_at: dateOnly(o.applied_at),
    next_action_at: dateOnly(o.next_action_at),
  };
}

export interface OpportunityFormProps {
  mode: "create" | "edit";
  opportunity?: Opportunity;
}

export function OpportunityForm({ mode, opportunity }: OpportunityFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [values, setValues] = React.useState<Values>(opportunity ? fromOpportunity(opportunity) : EMPTY);
  const [company, setCompany] = React.useState<EntityOption | null>(
    opportunity?.company ? { value: opportunity.company.id, label: opportunity.company.name } : null,
  );
  const [primaryContact, setPrimaryContact] = React.useState<EntityOption | null>(
    opportunity?.primary_contact
      ? { value: opportunity.primary_contact.id, label: opportunity.primary_contact.full_name }
      : null,
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const cancelHref = opportunity ? `/admin/opportunities/${opportunity.id}` : "/admin/opportunities";
  const loadCompanies = React.useCallback((q: string) => searchCompaniesAction(q), []);
  const loadContacts = React.useCallback((q: string) => searchContactsAction(q), []);

  function set(field: TextField, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    const input: OpportunityInput = {
      ...values,
      stage: mode === "create" ? values.stage : undefined,
      company_id: company?.value ?? null,
      primary_contact_id: primaryContact?.value ?? null,
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createOpportunityAction(input)
          : await updateOpportunityAction(opportunity!.id, input);

      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        toast({
          variant: "error",
          title: "Couldn't save",
          description: result.formError ?? "Please fix the highlighted fields.",
        });
        return;
      }

      toast({ variant: "success", title: mode === "create" ? "Opportunity created" : "Opportunity updated" });
      router.push(`/admin/opportunities/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {formError && (
        <div role="alert" className="rounded-md border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-300">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField label="Title" htmlFor="title" required error={errors.title} className="sm:col-span-2">
          <TextInput name="title" value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Senior Frontend Engineer" autoFocus />
        </FormField>

        {mode === "create" && (
          <FormField label="Stage" htmlFor="stage" error={errors.stage}>
            <Select
              name="stage"
              value={values.stage}
              onChange={(e) => set("stage", e.target.value)}
              options={OPPORTUNITY_STAGES.map((s) => ({ value: s, label: humanize(s) }))}
            />
          </FormField>
        )}

        <FormField label="Company" htmlFor="company" className={mode === "create" ? "" : "sm:col-span-1"}>
          <EntityPicker
            loadOptions={loadCompanies}
            value={company}
            onChange={(v) => setCompany((v as EntityOption | null) ?? null)}
            placeholder="Search active companies…"
            emptyMessage="No active companies found"
          />
        </FormField>

        <FormField label="Primary contact" htmlFor="primary_contact">
          <EntityPicker
            loadOptions={loadContacts}
            value={primaryContact}
            onChange={(v) => setPrimaryContact((v as EntityOption | null) ?? null)}
            placeholder="Search active contacts…"
            emptyMessage="No active contacts found"
          />
        </FormField>

        <FormField label="Location" htmlFor="location" error={errors.location}>
          <TextInput name="location" value={values.location} onChange={(e) => set("location", e.target.value)} placeholder="Remote — US" />
        </FormField>

        <FormField label="Location type" htmlFor="location_type" error={errors.location_type}>
          <Select
            name="location_type"
            value={values.location_type}
            onChange={(e) => set("location_type", e.target.value)}
            placeholder="—"
            options={LOCATION_TYPES.map((t) => ({ value: t, label: humanize(t) }))}
          />
        </FormField>

        <FormField label="Employment type" htmlFor="employment_type" error={errors.employment_type}>
          <Select
            name="employment_type"
            value={values.employment_type}
            onChange={(e) => set("employment_type", e.target.value)}
            placeholder="—"
            options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: humanize(t) }))}
          />
        </FormField>

        <FormField label="Seniority" htmlFor="seniority" error={errors.seniority}>
          <TextInput name="seniority" value={values.seniority} onChange={(e) => set("seniority", e.target.value)} placeholder="Senior" />
        </FormField>

        <FormField label="Job URL" htmlFor="job_url" error={errors.job_url} className="sm:col-span-2">
          <TextInput name="job_url" type="url" value={values.job_url} onChange={(e) => set("job_url", e.target.value)} placeholder="https://…" />
        </FormField>

        <FormField label="Salary min" htmlFor="salary_min" error={errors.salary_min}>
          <TextInput name="salary_min" inputMode="numeric" value={values.salary_min} onChange={(e) => set("salary_min", e.target.value)} placeholder="120000" />
        </FormField>

        <FormField label="Salary max" htmlFor="salary_max" error={errors.salary_max}>
          <TextInput name="salary_max" inputMode="numeric" value={values.salary_max} onChange={(e) => set("salary_max", e.target.value)} placeholder="160000" />
        </FormField>

        <FormField label="Currency" htmlFor="salary_currency" error={errors.salary_currency}>
          <TextInput name="salary_currency" value={values.salary_currency} onChange={(e) => set("salary_currency", e.target.value)} placeholder="USD" />
        </FormField>

        <FormField label="Source" htmlFor="source" error={errors.source}>
          <TextInput name="source" value={values.source} onChange={(e) => set("source", e.target.value)} placeholder="linkedin" />
        </FormField>

        <FormField label="Application method" htmlFor="application_method" error={errors.application_method}>
          <TextInput name="application_method" value={values.application_method} onChange={(e) => set("application_method", e.target.value)} placeholder="referral" />
        </FormField>

        <FormField label="Work authorization" htmlFor="work_authorization" error={errors.work_authorization}>
          <TextInput name="work_authorization" value={values.work_authorization} onChange={(e) => set("work_authorization", e.target.value)} placeholder="US citizen" />
        </FormField>

        <FormField label="Applied on" htmlFor="applied_at" error={errors.applied_at}>
          <TextInput name="applied_at" type="date" value={values.applied_at} onChange={(e) => set("applied_at", e.target.value)} />
        </FormField>

        <FormField label="Next action" htmlFor="next_action_at" error={errors.next_action_at}>
          <TextInput name="next_action_at" type="date" value={values.next_action_at} onChange={(e) => set("next_action_at", e.target.value)} />
        </FormField>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-5">
        <Link href={cancelHref} className={buttonClasses("ghost", "md")}>
          Cancel
        </Link>
        <Button type="submit" variant="primary" isLoading={pending}>
          {mode === "create" ? "Create opportunity" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
