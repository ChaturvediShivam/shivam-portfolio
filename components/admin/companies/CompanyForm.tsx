"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextInput,
  Textarea,
  Select,
  Button,
  buttonClasses,
  useToast,
} from "@/components/admin/ui";
import { COMPANY_EMPLOYEE_RANGES, type Company, type CompanyInput } from "@/types/company";
import { isActionError } from "@/lib/action-result";
import { createCompanyAction, updateCompanyAction } from "@/app/admin/(dashboard)/companies/actions";

type Values = Record<keyof CompanyInput, string>;

const EMPTY: Values = {
  name: "",
  domain: "",
  website: "",
  linkedin_url: "",
  careers_url: "",
  industry: "",
  employee_range: "",
  headquarters: "",
  country: "",
  description: "",
};

function fromCompany(c: Company): Values {
  return {
    name: c.name ?? "",
    domain: c.domain ?? "",
    website: c.website ?? "",
    linkedin_url: c.linkedin_url ?? "",
    careers_url: c.careers_url ?? "",
    industry: c.industry ?? "",
    employee_range: c.employee_range ?? "",
    headquarters: c.headquarters ?? "",
    country: c.country ?? "",
    description: c.description ?? "",
  };
}

export interface CompanyFormProps {
  mode: "create" | "edit";
  company?: Company;
}

export function CompanyForm({ mode, company }: CompanyFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [values, setValues] = React.useState<Values>(company ? fromCompany(company) : EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const cancelHref = company ? `/admin/companies/${company.id}` : "/admin/companies";

  function set(field: keyof Values, value: string) {
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

    const input = values as unknown as CompanyInput;

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCompanyAction(input)
          : await updateCompanyAction(company!.id, input);

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

      toast({ variant: "success", title: mode === "create" ? "Company created" : "Company updated" });
      router.push(`/admin/companies/${result.data.id}`);
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
        <FormField label="Name" htmlFor="name" required error={errors.name} className="sm:col-span-2">
          <TextInput
            name="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Acme Inc."
            autoFocus
          />
        </FormField>

        <FormField label="Domain" htmlFor="domain" hint="Used to detect duplicates (e.g. acme.com)" error={errors.domain}>
          <TextInput
            name="domain"
            value={values.domain}
            onChange={(e) => set("domain", e.target.value)}
            placeholder="acme.com"
          />
        </FormField>

        <FormField label="Website" htmlFor="website" error={errors.website}>
          <TextInput
            name="website"
            type="url"
            value={values.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://acme.com"
          />
        </FormField>

        <FormField label="LinkedIn URL" htmlFor="linkedin_url" error={errors.linkedin_url}>
          <TextInput
            name="linkedin_url"
            type="url"
            value={values.linkedin_url}
            onChange={(e) => set("linkedin_url", e.target.value)}
            placeholder="https://linkedin.com/company/acme"
          />
        </FormField>

        <FormField label="Careers URL" htmlFor="careers_url" error={errors.careers_url}>
          <TextInput
            name="careers_url"
            type="url"
            value={values.careers_url}
            onChange={(e) => set("careers_url", e.target.value)}
            placeholder="https://acme.com/careers"
          />
        </FormField>

        <FormField label="Industry" htmlFor="industry" error={errors.industry}>
          <TextInput
            name="industry"
            value={values.industry}
            onChange={(e) => set("industry", e.target.value)}
            placeholder="Software"
          />
        </FormField>

        <FormField label="Employee range" htmlFor="employee_range" error={errors.employee_range}>
          <Select
            name="employee_range"
            value={values.employee_range}
            onChange={(e) => set("employee_range", e.target.value)}
            placeholder="Select a range"
            options={COMPANY_EMPLOYEE_RANGES.map((r) => ({ value: r, label: r }))}
          />
        </FormField>

        <FormField label="Headquarters" htmlFor="headquarters" error={errors.headquarters}>
          <TextInput
            name="headquarters"
            value={values.headquarters}
            onChange={(e) => set("headquarters", e.target.value)}
            placeholder="San Francisco, CA"
          />
        </FormField>

        <FormField label="Country" htmlFor="country" error={errors.country}>
          <TextInput
            name="country"
            value={values.country}
            onChange={(e) => set("country", e.target.value)}
            placeholder="United States"
          />
        </FormField>

        <FormField label="Description" htmlFor="description" error={errors.description} className="sm:col-span-2">
          <Textarea
            name="description"
            rows={4}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What does this company do?"
          />
        </FormField>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-5">
        <Link href={cancelHref} className={buttonClasses("ghost", "md")}>
          Cancel
        </Link>
        <Button type="submit" variant="primary" isLoading={pending}>
          {mode === "create" ? "Create company" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
