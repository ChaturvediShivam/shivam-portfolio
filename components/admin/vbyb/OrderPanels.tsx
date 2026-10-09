"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, FormField, Select, TextInput, Textarea, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { currencyMinorDigits, formatDate, formatMoney } from "@/lib/vbyb/format";
import { CUSTOMER_RELATIONSHIPS, humanize, type VbybCustomer, type VbybOrder } from "@/types/vbyb";
import {
  recordRefundAction,
  requestRefundAction,
  resyncGumroadOrderAction,
  updateCustomerAction,
  updateOrderNotesAction,
} from "@/app/admin/(dashboard)/validate-before-you-build/actions";

const today = () => new Date().toISOString().slice(0, 10);

export function CopyLinkButton({ value }: { value: string }) {
  const { toast } = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast({ variant: "success", title: "Link copied" });
        } catch {
          toast({ variant: "error", title: "Couldn't copy", description: "Select the link and copy it manually." });
        }
      }}
    >
      Copy link
    </Button>
  );
}

export function ResyncButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      isLoading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resyncGumroadOrderAction(orderId);
          if (isActionError(result)) {
            toast({ variant: "error", title: "Re-sync failed", description: result.formError });
            return;
          }
          const { refundedNow } = (result as { data: { refundedNow: boolean } }).data;
          toast({ variant: "success", title: refundedNow ? "Refund applied from Gumroad" : "Order matches Gumroad" });
          router.refresh();
        })
      }
    >
      Re-sync from Gumroad
    </Button>
  );
}

export function OrderNotesForm({ orderId, notes }: { orderId: string; notes: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = React.useState(notes ?? "");
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateOrderNotesAction(orderId, value);
          if (isActionError(result)) {
            setError(result.fieldErrors?.notes);
            toast({ variant: "error", title: "Notes not saved", description: result.formError });
            return;
          }
          setError(undefined);
          toast({ variant: "success", title: "Notes saved" });
          router.refresh();
        });
      }}
    >
      <FormField label="Order notes" htmlFor="order-notes" error={error}>
        <Textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} />
      </FormField>
      <Button type="submit" size="sm" isLoading={pending}>
        Save notes
      </Button>
    </form>
  );
}

type RefundOrder = Pick<
  VbybOrder,
  | "id"
  | "payment_status"
  | "refund_status"
  | "refund_requested_at"
  | "refunded_at"
  | "refund_amount_cents"
  | "refund_reason"
  | "amount_cents"
  | "currency"
  | "provider"
>;

export function RefundPanel({ order }: { order: RefundOrder }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const digits = currencyMinorDigits(order.currency);

  const [requestedOn, setRequestedOn] = React.useState(today());
  const [requestReason, setRequestReason] = React.useState("");
  const [amount, setAmount] = React.useState((order.amount_cents / 10 ** digits).toFixed(digits));
  const [refundedOn, setRefundedOn] = React.useState(today());
  const [refundReason, setRefundReason] = React.useState(order.refund_reason ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirming, setConfirming] = React.useState(false);

  if (order.payment_status === "refunded") {
    return (
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Refunded on</dt>
          <dd className="mt-0.5 text-sm text-slate-200">{formatDate(order.refunded_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Amount</dt>
          <dd className="mt-0.5 text-sm text-slate-200">{formatMoney(order.refund_amount_cents, order.currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Reason</dt>
          <dd className="mt-0.5 text-sm text-slate-200">{order.refund_reason ?? "—"}</dd>
        </div>
      </dl>
    );
  }

  function requestRefund(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await requestRefundAction(order.id, { requested_on: requestedOn, reason: requestReason });
      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        toast({ variant: "error", title: "Refund request not saved", description: result.formError });
        return;
      }
      setErrors({});
      toast({ variant: "success", title: "Refund request recorded" });
      router.refresh();
    });
  }

  function recordRefund() {
    startTransition(async () => {
      const result = await recordRefundAction(order.id, { amount, refunded_on: refundedOn, reason: refundReason });
      setConfirming(false);
      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        toast({ variant: "error", title: "Refund not recorded", description: result.formError });
        return;
      }
      setErrors({});
      toast({ variant: "success", title: "Refund recorded", description: "The founding slot is free again." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {order.refund_status === "requested" ? (
        <p className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Refund requested on {formatDate(order.refund_requested_at)}
          {order.refund_reason ? ` — ${order.refund_reason}` : ""}. Issue it in Gumroad, then record it below.
        </p>
      ) : (
        <form onSubmit={requestRefund} className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Log a refund request</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Requested on" htmlFor="refund-requested-on" error={errors.requested_on}>
              <TextInput type="date" value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} />
            </FormField>
            <FormField label="Reason (optional)" htmlFor="refund-request-reason" error={errors.reason} className="sm:col-span-2">
              <TextInput value={requestReason} onChange={(e) => setRequestReason(e.target.value)} />
            </FormField>
          </div>
          <Button type="submit" size="sm" isLoading={pending}>
            Log request
          </Button>
        </form>
      )}

      <div className="space-y-3 border-t border-white/[0.06] pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Record an issued refund</p>
        <p className="text-xs text-slate-500">
          This records a refund that has already been issued. It does not move money.
          {order.provider === "gumroad" ? " With webhooks connected, Gumroad refunds are recorded automatically." : ""}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label={`Amount (${order.currency})`} htmlFor="refund-amount" error={errors.amount}>
            <TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Refunded on" htmlFor="refund-date" error={errors.refunded_on}>
            <TextInput type="date" value={refundedOn} onChange={(e) => setRefundedOn(e.target.value)} />
          </FormField>
          <FormField label="Reason" htmlFor="refund-reason" error={errors.reason}>
            <TextInput value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
          </FormField>
        </div>
        <Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={pending}>
          Record refund
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Record this refund?"
        description="The order and validation are marked refunded and the founding slot is freed. The records are kept."
        confirmLabel="Record refund"
        destructive
        isPending={pending}
        onConfirm={recordRefund}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

export function CustomerForm({ customer }: { customer: Pick<VbybCustomer, "id" | "name" | "relationship" | "notes"> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState(customer.name ?? "");
  const [relationship, setRelationship] = React.useState<string>(customer.relationship);
  const [notes, setNotes] = React.useState(customer.notes ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateCustomerAction(customer.id, { name, relationship, notes });
          if (isActionError(result)) {
            setErrors(result.fieldErrors ?? {});
            toast({ variant: "error", title: "Customer not saved", description: result.formError });
            return;
          }
          setErrors({});
          toast({ variant: "success", title: "Customer saved" });
          router.refresh();
        });
      }}
    >
      <FormField label="Name" htmlFor="customer-name" error={errors.name}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField
        label="Relationship"
        htmlFor="customer-relationship"
        hint="The primary metric counts paid pre-orders from strangers. Only you can classify this."
        error={errors.relationship}
      >
        <Select
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          options={CUSTOMER_RELATIONSHIPS.map((r) => ({ value: r, label: humanize(r) }))}
        />
      </FormField>
      <FormField label="Customer notes" htmlFor="customer-notes" error={errors.notes}>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
      <Button type="submit" size="sm" isLoading={pending}>
        Save customer
      </Button>
    </form>
  );
}
