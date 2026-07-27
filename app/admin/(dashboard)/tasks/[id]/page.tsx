import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTask } from "@/lib/tasks";
import { PageHeader, Badge } from "@/components/admin/ui";
import { TaskActions } from "@/components/admin/tasks/TaskActions";
import {
  isOverdue,
  priorityBadgeVariant,
  priorityLabel,
  statusBadgeVariant,
  statusLabel,
  type Task,
} from "@/types/task";

interface PageProps {
  params: Promise<{ id: string }>;
}

const dash = <span className="text-slate-600">—</span>;

function formatDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{children}</dd>
    </div>
  );
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const task = (await getTask(supabase, id)) as Task | null;
  if (!task) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const assignedToMe = !!task.assignee_id && task.assignee_id === user?.id;

  const isArchived = task.archived_at != null;
  const overdue = isOverdue(task);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={task.title}
        breadcrumb={
          <Link href="/admin/tasks" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="size-3.5" aria-hidden />
            Tasks
          </Link>
        }
        actions={<TaskActions task={task} />}
      />

      {isArchived && (
        <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-slate-400">
          <Badge variant="neutral">Archived</Badge>
          <span>This task is archived and hidden from the default list.</span>
        </div>
      )}

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant={statusBadgeVariant(task.status)}>{statusLabel(task.status)}</Badge>
          <Badge variant={priorityBadgeVariant(task.priority)}>{priorityLabel(task.priority)} priority</Badge>
          {overdue && <Badge variant="danger">Overdue</Badge>}
        </div>

        {task.description && <p className="mb-5 whitespace-pre-wrap text-sm text-slate-300">{task.description}</p>}

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Due date">
            <span className={overdue ? "text-red-400" : undefined}>{formatDate(task.due_at) ?? dash}</span>
          </Field>
          <Field label="Completed">{formatDate(task.completed_at) ?? dash}</Field>
          <Field label="Assignee">{assignedToMe ? "You" : <span className="text-slate-500">Unassigned</span>}</Field>
          <Field label="Opportunity">
            {task.opportunity ? (
              <Link href={`/admin/opportunities/${task.opportunity.id}`} className="text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2">
                {task.opportunity.title}
              </Link>
            ) : (
              dash
            )}
          </Field>
          <Field label="Contact">
            {task.contact ? (
              <Link href={`/admin/contacts/${task.contact.id}`} className="text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2">
                {task.contact.full_name}
              </Link>
            ) : (
              dash
            )}
          </Field>
          <Field label="Company">
            {task.company ? (
              <Link href={`/admin/companies/${task.company.id}`} className="text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2">
                {task.company.name}
              </Link>
            ) : (
              dash
            )}
          </Field>
        </dl>
      </div>

      <p className="text-xs text-slate-600">
        Added {formatDate(task.created_at)} · Updated {formatDate(task.updated_at)}
      </p>
    </div>
  );
}
