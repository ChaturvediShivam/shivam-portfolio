"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Select, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { linkSubmissionAction } from "@/app/admin/(dashboard)/validate-before-you-build/actions";

/** Manually links an unmatched submission to an order. */
export function LinkSubmissionControl({
  submissionId,
  orders,
}: {
  submissionId: string;
  orders: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [orderId, setOrderId] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  if (orders.length === 0) {
    return <p className="text-xs text-slate-500">No orders to link yet. It will match by email when the order arrives.</p>;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        aria-label="Order to link"
        value={orderId}
        onChange={(e) => setOrderId(e.target.value)}
        placeholder="Choose an order…"
        options={orders.map((o) => ({ value: o.id, label: o.label }))}
        className="sm:min-w-[18rem]"
      />
      <Button
        size="sm"
        disabled={!orderId}
        isLoading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await linkSubmissionAction(submissionId, orderId);
            if (isActionError(result)) {
              toast({ variant: "error", title: "Couldn't link submission", description: result.formError });
              return;
            }
            const outcome = (result as { data: { result: string } }).data.result;
            toast({
              variant: "success",
              title: "Submission linked",
              description:
                outcome === "linked_additional" ? "The order already had a submission; this one is kept as additional." : undefined,
            });
            router.refresh();
          })
        }
      >
        Link
      </Button>
    </div>
  );
}
