"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { OPPORTUNITY_STAGES, stageLabel } from "@/types/opportunity";
import { changeStageAction } from "@/app/admin/(dashboard)/opportunities/actions";

/** Keyboard-accessible stage changer used on the detail page. */
export function StageSelect({ opportunityId, stage }: { opportunityId: string; stage: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [value, setValue] = React.useState(stage);

  React.useEffect(() => setValue(stage), [stage]);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await changeStageAction(opportunityId, next);
      if (isActionError(result)) {
        setValue(prev);
        toast({ variant: "error", title: "Couldn't change stage", description: result.formError });
        return;
      }
      toast({ variant: "success", title: `Moved to ${stageLabel(next)}` });
      router.refresh();
    });
  }

  return (
    <select
      value={value}
      onChange={onChange}
      disabled={pending}
      aria-label="Stage"
      className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-50 [&>option]:bg-[#0B0E14]"
    >
      {OPPORTUNITY_STAGES.map((s) => (
        <option key={s} value={s}>
          {stageLabel(s)}
        </option>
      ))}
    </select>
  );
}
