import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";
import { TaskForm } from "@/components/admin/tasks/TaskForm";

export const metadata = { title: "New task" };

export default function NewTaskPage() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="New task"
        breadcrumb={
          <Link href="/admin/tasks" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="size-3.5" aria-hidden />
            Tasks
          </Link>
        }
      />
      <TaskForm mode="create" />
    </div>
  );
}
