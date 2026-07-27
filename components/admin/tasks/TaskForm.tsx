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
  EntityPicker,
  useToast,
  type EntityOption,
} from "@/components/admin/ui";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  humanize,
  type Task,
  type TaskInput,
} from "@/types/task";
import { isActionError } from "@/lib/action-result";
import {
  createTaskAction,
  updateTaskAction,
  searchOpportunitiesAction,
  searchContactsAction,
  searchCompaniesAction,
} from "@/app/admin/(dashboard)/tasks/actions";

type TextField = "title" | "description" | "status" | "priority" | "due_at";
type Values = Record<TextField, string>;

const EMPTY: Values = { title: "", description: "", status: "todo", priority: "medium", due_at: "" };
const dateOnly = (v: string | null) => (v ? v.slice(0, 10) : "");

function fromTask(t: Task): Values {
  return {
    title: t.title ?? "",
    description: t.description ?? "",
    status: t.status ?? "todo",
    priority: t.priority ?? "medium",
    due_at: dateOnly(t.due_at),
  };
}

export interface TaskFormProps {
  mode: "create" | "edit";
  task?: Task;
  assignedToMe?: boolean;
}

export function TaskForm({ mode, task, assignedToMe = false }: TaskFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [values, setValues] = React.useState<Values>(task ? fromTask(task) : EMPTY);
  const [opportunity, setOpportunity] = React.useState<EntityOption | null>(
    task?.opportunity ? { value: task.opportunity.id, label: task.opportunity.title } : null,
  );
  const [contact, setContact] = React.useState<EntityOption | null>(
    task?.contact ? { value: task.contact.id, label: task.contact.full_name } : null,
  );
  const [company, setCompany] = React.useState<EntityOption | null>(
    task?.company ? { value: task.company.id, label: task.company.name } : null,
  );
  const [assign, setAssign] = React.useState(assignedToMe);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const cancelHref = task ? `/admin/tasks/${task.id}` : "/admin/tasks";
  const loadOpportunities = React.useCallback((q: string) => searchOpportunitiesAction(q), []);
  const loadContacts = React.useCallback((q: string) => searchContactsAction(q), []);
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

    const input: TaskInput = {
      title: values.title,
      description: values.description,
      status: mode === "create" ? values.status : undefined,
      priority: values.priority,
      due_at: values.due_at,
      opportunity_id: opportunity?.value ?? null,
      contact_id: contact?.value ?? null,
      company_id: company?.value ?? null,
      assign_to_me: assign,
    };

    startTransition(async () => {
      const result = mode === "create" ? await createTaskAction(input) : await updateTaskAction(task!.id, input);
      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        toast({ variant: "error", title: "Couldn't save", description: result.formError ?? "Please fix the highlighted fields." });
        return;
      }
      toast({ variant: "success", title: mode === "create" ? "Task created" : "Task updated" });
      router.push(`/admin/tasks/${result.data.id}`);
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
          <TextInput name="title" value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Follow up with recruiter" autoFocus />
        </FormField>

        <FormField label="Description" htmlFor="description" error={errors.description} className="sm:col-span-2">
          <Textarea name="description" rows={3} value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="Details…" />
        </FormField>

        {mode === "create" && (
          <FormField label="Status" htmlFor="status" error={errors.status}>
            <Select name="status" value={values.status} onChange={(e) => set("status", e.target.value)} options={TASK_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
          </FormField>
        )}

        <FormField label="Priority" htmlFor="priority" error={errors.priority}>
          <Select name="priority" value={values.priority} onChange={(e) => set("priority", e.target.value)} options={TASK_PRIORITIES.map((p) => ({ value: p, label: humanize(p) }))} />
        </FormField>

        <FormField label="Due date" htmlFor="due_at" error={errors.due_at}>
          <TextInput name="due_at" type="date" value={values.due_at} onChange={(e) => set("due_at", e.target.value)} />
        </FormField>

        <FormField label="Opportunity" htmlFor="opportunity" className="sm:col-span-2">
          <EntityPicker loadOptions={loadOpportunities} value={opportunity} onChange={(v) => setOpportunity((v as EntityOption | null) ?? null)} placeholder="Link an opportunity…" emptyMessage="No active opportunities" />
        </FormField>

        <FormField label="Contact" htmlFor="contact">
          <EntityPicker loadOptions={loadContacts} value={contact} onChange={(v) => setContact((v as EntityOption | null) ?? null)} placeholder="Link a contact…" emptyMessage="No active contacts" />
        </FormField>

        <FormField label="Company" htmlFor="company">
          <EntityPicker loadOptions={loadCompanies} value={company} onChange={(v) => setCompany((v as EntityOption | null) ?? null)} placeholder="Link a company…" emptyMessage="No active companies" />
        </FormField>

        <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
          <input
            type="checkbox"
            checked={assign}
            onChange={(e) => setAssign(e.target.checked)}
            className="size-4 rounded border-white/20 bg-white/[0.03] accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          />
          Assign to me
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-5">
        <Link href={cancelHref} className={buttonClasses("ghost", "md")}>
          Cancel
        </Link>
        <Button type="submit" variant="primary" isLoading={pending}>
          {mode === "create" ? "Create task" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
