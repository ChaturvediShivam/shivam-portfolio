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
import { INTEGRATION_PROVIDERS, type Contact, type ContactInput } from "@/types/contact";
import { isActionError } from "@/lib/action-result";
import {
  createContactAction,
  updateContactAction,
  searchCompaniesAction,
} from "@/app/admin/(dashboard)/contacts/actions";

type TextField =
  | "full_name"
  | "email"
  | "phone"
  | "title"
  | "department"
  | "linkedin_url"
  | "location"
  | "timezone"
  | "source";

type Values = Record<TextField, string>;

const EMPTY: Values = {
  full_name: "",
  email: "",
  phone: "",
  title: "",
  department: "",
  linkedin_url: "",
  location: "",
  timezone: "",
  source: "",
};

function fromContact(c: Contact): Values {
  return {
    full_name: c.full_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    title: c.title ?? "",
    department: c.department ?? "",
    linkedin_url: c.linkedin_url ?? "",
    location: c.location ?? "",
    timezone: c.timezone ?? "",
    source: c.source ?? "",
  };
}

function providerLabel(p: string): string {
  if (p === "linkedin") return "LinkedIn";
  return p.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}

export interface ContactFormProps {
  mode: "create" | "edit";
  contact?: Contact;
}

export function ContactForm({ mode, contact }: ContactFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [values, setValues] = React.useState<Values>(contact ? fromContact(contact) : EMPTY);
  const [company, setCompany] = React.useState<EntityOption | null>(
    contact?.company ? { value: contact.company.id, label: contact.company.name } : null,
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const cancelHref = contact ? `/admin/contacts/${contact.id}` : "/admin/contacts";

  const loadCompanies = React.useCallback((q: string) => searchCompaniesAction(q), []);

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

    const input: ContactInput = { ...values, company_id: company?.value ?? null };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createContactAction(input)
          : await updateContactAction(contact!.id, input);

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

      toast({ variant: "success", title: mode === "create" ? "Contact created" : "Contact updated" });
      router.push(`/admin/contacts/${result.data.id}`);
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
        <FormField label="Full name" htmlFor="full_name" required error={errors.full_name} className="sm:col-span-2">
          <TextInput
            name="full_name"
            value={values.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            placeholder="Jane Doe"
            autoFocus
          />
        </FormField>

        <FormField label="Email" htmlFor="email" hint="Used to detect duplicates" error={errors.email}>
          <TextInput
            name="email"
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="jane@acme.com"
          />
        </FormField>

        <FormField label="Phone" htmlFor="phone" error={errors.phone}>
          <TextInput name="phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 010 0000" />
        </FormField>

        <FormField label="Title" htmlFor="title" error={errors.title}>
          <TextInput name="title" value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Engineering Manager" />
        </FormField>

        <FormField label="Department" htmlFor="department" error={errors.department}>
          <TextInput
            name="department"
            value={values.department}
            onChange={(e) => set("department", e.target.value)}
            placeholder="Engineering"
          />
        </FormField>

        <FormField label="Company" htmlFor="company" error={errors.company_id} className="sm:col-span-2">
          <EntityPicker
            loadOptions={loadCompanies}
            value={company}
            onChange={(v) => setCompany((v as EntityOption | null) ?? null)}
            placeholder="Search active companies…"
            emptyMessage="No active companies found"
          />
        </FormField>

        <FormField label="LinkedIn URL" htmlFor="linkedin_url" error={errors.linkedin_url}>
          <TextInput
            name="linkedin_url"
            type="url"
            value={values.linkedin_url}
            onChange={(e) => set("linkedin_url", e.target.value)}
            placeholder="https://linkedin.com/in/janedoe"
          />
        </FormField>

        <FormField label="Source" htmlFor="source" error={errors.source}>
          <Select
            name="source"
            value={values.source}
            onChange={(e) => set("source", e.target.value)}
            placeholder="Where from?"
            options={INTEGRATION_PROVIDERS.map((p) => ({ value: p, label: providerLabel(p) }))}
          />
        </FormField>

        <FormField label="Location" htmlFor="location" error={errors.location}>
          <TextInput name="location" value={values.location} onChange={(e) => set("location", e.target.value)} placeholder="San Francisco, CA" />
        </FormField>

        <FormField label="Timezone" htmlFor="timezone" hint="e.g. America/New_York" error={errors.timezone}>
          <TextInput name="timezone" value={values.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="America/Los_Angeles" />
        </FormField>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-5">
        <Link href={cancelHref} className={buttonClasses("ghost", "md")}>
          Cancel
        </Link>
        <Button type="submit" variant="primary" isLoading={pending}>
          {mode === "create" ? "Create contact" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
