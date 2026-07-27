import Link from "next/link";
import { ListChecks } from "lucide-react";
import { EmptyState, buttonClasses } from "@/components/admin/ui";

export default function TaskNotFound() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <EmptyState
        icon={<ListChecks />}
        title="Task not found"
        description="This task doesn't exist or may have been deleted."
        action={
          <Link href="/admin/tasks" className={buttonClasses("secondary")}>
            Back to tasks
          </Link>
        }
      />
    </div>
  );
}
