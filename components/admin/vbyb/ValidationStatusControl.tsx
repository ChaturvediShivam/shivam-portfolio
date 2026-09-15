"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { MANUAL_TRANSITIONS } from "@/lib/vbyb/workflow";
import { VALIDATION_STATUS_LABELS, type ValidationStatus } from "@/types/vbyb";
import { changeValidationStatusAction } from "@/app/admin/(dashboard)/validate-before-you-build/actions";

const ACTION_LABELS: Partial<Record<`${ValidationStatus}->${ValidationStatus}`, string>> = {
  "paid->submitted": "Mark submitted",
  "submitted->in_progress": "Start validation",
  "in_progress->submitted": "Back to submitted",
  "in_progress->delivered": "Mark delivered",
  "delivered->in_progress": "Reopen",
};

/** Moves a validation along PAID → SUBMITTED → IN PROGRESS → DELIVERED. */
export function ValidationStatusControl({
  validationId,
  status,
  missingForDelivery,
}: {
  validationId: string;
  status: ValidationStatus;
  missingForDelivery: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmDeliver, setConfirmDeliver] = React.useState(false);

  if (status === "refunded") {
    return <p className="text-xs text-slate-500">Refunded — the status is locked and the record is kept.</p>;
  }

  const next = MANUAL_TRANSITIONS[status];
  const canDeliver = next.includes("delivered");

  function move(to: ValidationStatus) {
    startTransition(async () => {
      const result = await changeValidationStatusAction(validationId, to);
      setConfirmDeliver(false);
      if (isActionError(result)) {
        toast({ variant: "error", title: "Status not changed", description: result.formError });
        return;
      }
      toast({ variant: "success", title: VALIDATION_STATUS_LABELS[to] });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {next.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={to === "delivered" ? "primary" : "secondary"}
            disabled={pending || (to === "delivered" && missingForDelivery.length > 0)}
            onClick={() => (to === "delivered" ? setConfirmDeliver(true) : move(to))}
          >
            {ACTION_LABELS[`${status}->${to}`] ?? VALIDATION_STATUS_LABELS[to]}
          </Button>
        ))}
      </div>
      {canDeliver && missingForDelivery.length > 0 && (
        <p className="text-xs text-amber-400">Before delivery, record the {missingForDelivery.join(", ")}.</p>
      )}
      <ConfirmDialog
        open={confirmDeliver}
        title="Mark this validation delivered?"
        description="Confirm the Validation File has been sent to the customer. The delivery time is recorded now."
        confirmLabel="Mark delivered"
        isPending={pending}
        onConfirm={() => move("delivered")}
        onCancel={() => setConfirmDeliver(false)}
      />
    </div>
  );
}
