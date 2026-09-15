"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, FormField, Select, TextInput, Textarea, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { updateValidationSectionAction } from "@/app/admin/(dashboard)/validate-before-you-build/actions";

export interface SectionFieldDef {
  name: string;
  label: string;
  kind: "textarea" | "text" | "date" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  rows?: number;
  required?: boolean;
  wide?: boolean;
}

/** Edits one whitelisted section of a validation (idea, test, decision or notes). */
export function SectionForm({
  validationId,
  section,
  fields,
  initial,
  submitLabel = "Save",
}: {
  validationId: string;
  section: "idea" | "test" | "decision" | "notes";
  fields: SectionFieldDef[];
  initial: Record<string, string>;
  submitLabel?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  const dirty = fields.some((f) => (values[f.name] ?? "") !== (initial[f.name] ?? ""));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateValidationSectionAction(validationId, section, values);
      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        toast({ variant: "error", title: "Not saved", description: result.formError });
        return;
      }
      setErrors({});
      toast({ variant: "success", title: "Saved" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map((field) => {
          const id = `${section}-${field.name}`;
          const value = values[field.name] ?? "";
          const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
            setValues((v) => ({ ...v, [field.name]: e.target.value }));
          const wide = field.wide ?? field.kind === "textarea";

          return (
            <FormField
              key={field.name}
              label={field.label}
              htmlFor={id}
              hint={field.hint}
              required={field.required}
              error={errors[field.name]}
              className={cn(wide && "md:col-span-2")}
            >
              {field.kind === "textarea" ? (
                <Textarea rows={field.rows ?? 3} value={value} onChange={onChange} placeholder={field.placeholder} />
              ) : field.kind === "select" ? (
                <Select value={value} onChange={onChange} options={field.options ?? []} placeholder={field.placeholder} />
              ) : (
                <TextInput type={field.kind === "date" ? "date" : "text"} value={value} onChange={onChange} placeholder={field.placeholder} />
              )}
            </FormField>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="primary" isLoading={pending} disabled={!dirty && !pending}>
          {submitLabel}
        </Button>
        {dirty && !pending && <span className="text-xs text-slate-500">Unsaved changes</span>}
      </div>
    </form>
  );
}
