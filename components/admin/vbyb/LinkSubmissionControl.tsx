"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, Select, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { linkSubmissionAction } from "@/app/admin/(dashboard)/validate-before-you-build/actions";

/**
 * Manually links an unmatched submission to an order.
 *
 * Linking is not reversible from the admin (there is no unlink function), so it
 * always goes through a confirmation that names the order and warns when the
 * submission's email differs from the order's customer.
 */
export function LinkSubmissionControl({
  submissionId,
  submissionEmail,
  orders,
}: {
  submissionId: string;
  submissionEmail: string | null;
  orders: { id: string; label: string; email: string | null; hasSubmission: boolean }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [orderId, setOrderId] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (orders.length === 0) {
    return <p className="text-xs text-slate-500">No orders to link yet. It will match by email when the order arrives.</p>;
  }

  const selected = orders.find((o) => o.id === orderId) ?? null;
  const emailMismatch = Boolean(selected && submissionEmail && selected.email && selected.email !== submissionEmail);

  const description = selected
    ? [
        `Attach this submission${submissionEmail ? ` from ${submissionEmail}` : ""} to: ${selected.label}.`,
        emailMismatch ? `The emails differ (${selected.email}). Confirm this is the same customer.` : null,
        selected.hasSubmission ? "That order already has a submission; this one will be kept as additional." : null,
        "This cannot be undone from the admin.",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  function link() {
    startTransition(async () => {
      const result = await linkSubmissionAction(submissionId, orderId);
      setConfirming(false);
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
    });
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
      <Button size="sm" disabled={!orderId || pending} onClick={() => setConfirming(true)}>
        Link…
      </Button>
      <ConfirmDialog
        open={confirming}
        title={emailMismatch ? "Link to a customer with a different email?" : "Link this submission?"}
        description={description}
        confirmLabel="Link submission"
        destructive={emailMismatch}
        isPending={pending}
        onConfirm={link}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
