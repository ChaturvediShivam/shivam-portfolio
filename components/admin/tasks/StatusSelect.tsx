"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { TASK_STATUSES, statusLabel } from "@/types/task";
import { changeStatusAction } from "@/app/admin/(dashboard)/tasks/actions";

/** Keyboard-accessible status changer used on the detail page. */
export function StatusSelect({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [value, setValue] = React.useState(status);

  React.useEffect(() => setValue(status), [status]);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await changeStatusAction(taskId, next);
      if (isActionError(result)) {
        setValue(prev);
        toast({ variant: "error", title: "Couldn't change status", description: result.formError });
        return;
      }
      toast({ variant: "success", title: `Status: ${statusLabel(next)}` });
      router.refresh();
    });
  }

  return (
    <select
      value={value}
      onChange={onChange}
      disabled={pending}
      aria-label="Status"
      className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-50 [&>option]:bg-[#0B0E14]"
    >
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {statusLabel(s)}
        </option>
      ))}
    </select>
  );
}
