"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, MailOpen, Archive, ArchiveRestore } from "lucide-react";
import { Button, useToast } from "@/components/admin/ui";
import { isActionError, type ActionResult } from "@/lib/action-result";
import type { Message } from "@/types/message";
import { markReadAction, archiveMessageAction, restoreMessageAction } from "@/app/admin/(dashboard)/messages/actions";

export function MessageActions({ message }: { message: Message }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const isArchived = message.archived_at != null;

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
      <Button
        variant="secondary"
        onClick={() =>
          run(
            () => markReadAction(message.id, !message.is_read),
            message.is_read ? "Marked unread" : "Marked read",
            "Couldn't update",
          )
        }
        isLoading={pending}
      >
        {message.is_read ? <Mail className="size-4" aria-hidden /> : <MailOpen className="size-4" aria-hidden />}
        {message.is_read ? "Mark unread" : "Mark read"}
      </Button>

      {isArchived ? (
        <Button variant="secondary" onClick={() => run(() => restoreMessageAction(message.id), "Message restored", "Couldn't restore")} isLoading={pending}>
          <ArchiveRestore className="size-4" aria-hidden />
          Restore
        </Button>
      ) : (
        <Button variant="danger" onClick={() => run(() => archiveMessageAction(message.id), "Message archived", "Couldn't archive")} isLoading={pending}>
          <Archive className="size-4" aria-hidden />
          Archive
        </Button>
      )}
    </div>
  );
}
