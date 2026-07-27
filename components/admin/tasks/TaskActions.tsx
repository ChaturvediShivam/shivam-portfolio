"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Archive, ArchiveRestore, Check } from "lucide-react";
import { Button, buttonClasses, ConfirmDialog, useToast } from "@/components/admin/ui";
import type { Task } from "@/types/task";
import { isActionError, type ActionResult } from "@/lib/action-result";
import { StatusSelect } from "./StatusSelect";
import { archiveTaskAction, restoreTaskAction, changeStatusAction } from "@/app/admin/(dashboard)/tasks/actions";

export function TaskActions({ task }: { task: Task }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const isArchived = task.archived_at != null;
  const isDone = task.status === "done";

  function run(fn: () => Promise<ActionResult<unknown>>, successTitle: string, errorTitle: string) {
    startTransition(async () => {
      const result = await fn();
      if (isActionError(result)) {
        toast({ variant: "error", title: errorTitle, description: result.formError });
        return;
      }
      toast({ variant: "success", title: successTitle });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isArchived && <StatusSelect taskId={task.id} status={task.status} />}

      {!isArchived && !isDone && (
        <Button
          variant="secondary"
          onClick={() => run(() => changeStatusAction(task.id, "done"), "Task completed", "Couldn't complete")}
          isLoading={pending}
        >
          <Check className="size-4" aria-hidden />
          Mark done
        </Button>
      )}

      <Link href={`/admin/tasks/${task.id}/edit`} className={buttonClasses("secondary", "md")}>
        <Pencil className="size-4" aria-hidden />
        Edit
      </Link>

      {isArchived ? (
        <Button
          variant="secondary"
          onClick={() => run(() => restoreTaskAction(task.id), "Task restored", "Couldn't restore")}
          isLoading={pending}
        >
          <ArchiveRestore className="size-4" aria-hidden />
          Restore
        </Button>
      ) : (
        <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={pending}>
          <Archive className="size-4" aria-hidden />
          Archive
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Archive “${task.title}”?`}
        description="It will be hidden from the default list and board. You can restore it anytime."
        confirmLabel="Archive"
        destructive
        isPending={pending}
        onConfirm={() => {
          setConfirmOpen(false);
          run(() => archiveTaskAction(task.id), "Task archived", "Couldn't archive");
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
