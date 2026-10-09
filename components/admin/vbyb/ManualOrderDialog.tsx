"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, FormField, TextInput, Textarea, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { createManualOrderAction } from "@/app/admin/(dashboard)/validate-before-you-build/actions";

type Values = { email: string; name: string; amount: string; currency: string; purchased_on: string; notes: string };

/** Records a purchase made outside Gumroad (or a test order) through the same capacity-safe function. */
export function ManualOrderDialog({ defaultAmount, defaultCurrency }: { defaultAmount: string; defaultCurrency: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const blank = React.useCallback(
    (): Values => ({
      email: "",
      name: "",
      amount: defaultAmount,
      currency: defaultCurrency,
      purchased_on: new Date().toISOString().slice(0, 10),
      notes: "",
    }),
    [defaultAmount, defaultCurrency],
  );

  const [values, setValues] = React.useState<Values>(blank);
  const [isTest, setIsTest] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function close() {
    setOpen(false);
    setErrors({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createManualOrderAction({ ...values, is_test: isTest });
      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        toast({ variant: "error", title: "Order not recorded", description: result.formError });
        return;
      }
      const data = (result as { data: { orderId: string; capacityStatus: string } }).data;
      toast({
        variant: data.capacityStatus === "over_capacity" ? "info" : "success",
        title: "Order recorded",
        description:
          data.capacityStatus === "over_capacity" ? "Founding capacity is full — this order did not get a slot." : undefined,
      });
      setValues(blank());
      setIsTest(false);
      close();
      router.push(`${VBYB_BASE_PATH}/orders/${data.orderId}`);
    });
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        Record manual order
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Record a manual order"
        description="For a purchase made outside Gumroad, or a test. Gumroad purchases are recorded automatically by the webhook."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" form="vbyb-manual-order" isLoading={pending}>
              Record order
            </Button>
          </>
        }
      >
        <form id="vbyb-manual-order" onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Customer email" htmlFor="mo-email" required error={errors.email}>
            <TextInput type="email" value={values.email} onChange={set("email")} autoComplete="off" />
          </FormField>
          <FormField label="Customer name" htmlFor="mo-name" error={errors.name}>
            <TextInput value={values.name} onChange={set("name")} autoComplete="off" />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Amount" htmlFor="mo-amount" required error={errors.amount}>
              <TextInput inputMode="decimal" value={values.amount} onChange={set("amount")} />
            </FormField>
            <FormField label="Currency" htmlFor="mo-currency" required error={errors.currency}>
              <TextInput value={values.currency} onChange={set("currency")} maxLength={3} />
            </FormField>
            <FormField label="Purchased on" htmlFor="mo-date" error={errors.purchased_on}>
              <TextInput type="date" value={values.purchased_on} onChange={set("purchased_on")} />
            </FormField>
          </div>
          <FormField label="Notes" htmlFor="mo-notes" error={errors.notes}>
            <Textarea rows={3} value={values.notes} onChange={set("notes")} />
          </FormField>
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isTest}
              onChange={(e) => setIsTest(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent"
            />
            <span>
              Test order
              <span className="block text-xs text-slate-500">Excluded from revenue and metrics, and never takes a founding slot.</span>
            </span>
          </label>
        </form>
      </Dialog>
    </>
  );
}
