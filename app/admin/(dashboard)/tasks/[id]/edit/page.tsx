import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTask } from "@/lib/tasks";
import { PageHeader } from "@/components/admin/ui";
import { TaskForm } from "@/components/admin/tasks/TaskForm";
import type { Task } from "@/types/task";

export const metadata = { title: "Edit task" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTaskPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const task = (await getTask(supabase, id)) as Task | null;
  if (!task) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const assignedToMe = !!task.assignee_id && task.assignee_id === user?.id;

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={`Edit ${task.title}`}
        breadcrumb={
          <Link href={`/admin/tasks/${task.id}`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="size-3.5" aria-hidden />
            {task.title}
          </Link>
        }
      />
      <TaskForm mode="edit" task={task} assignedToMe={assignedToMe} />
    </div>
  );
}
