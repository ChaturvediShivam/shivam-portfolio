"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, FormField, TextInput, Textarea, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { currencyMinorDigits } from "@/lib/vbyb/format";
import type { VbybLaunch } from "@/types/vbyb";
import { updateLaunchAction } from "@/app/admin/(dashboard)/validate-before-you-build/actions";

function toForm(launch: VbybLaunch): Record<string, string> {
  const digits = currencyMinorDigits(launch.currency);
  return {
    name: launch.name,
    price: (launch.price_cents / 10 ** digits).toFixed(digits),
    currency: launch.currency,
    capacity: String(launch.capacity),
    gumroad_product_id: launch.gumroad_product_id ?? "",
    primary_metric: launch.primary_metric ?? "",
    criteria_min_preorders: launch.criteria_min_preorders == null ? "" : String(launch.criteria_min_preorders),
    criteria_strong_preorders: launch.criteria_strong_preorders == null ? "" : String(launch.criteria_strong_preorders),
    started_on: launch.started_at?.slice(0, 10) ?? "",
    ended_on: launch.ended_at?.slice(0, 10) ?? "",
    expected: launch.expected ?? "",
    what_happened: launch.what_happened ?? "",
    objections: launch.objections ?? "",
    what_changed: launch.what_changed ?? "",
    learnings: launch.learnings ?? "",
    customer_feedback: launch.customer_feedback ?? "",
  };
}

const NOTE_FIELDS: { name: string; label: string; hint?: string }[] = [
  { name: "expected", label: "What we expected" },
  { name: "what_happened", label: "What happened" },
  { name: "objections", label: "Objections that appeared", hint: "Repeated objections are a signal — note how often each came up." },
  { name: "what_changed", label: "What changed" },
  { name: "customer_feedback", label: "Customer feedback" },
  { name: "learnings", label: "What we learned" },
];

/** Launch configuration and experiment notes. */
export function LaunchSettingsForm({ launch }: { launch: VbybLaunch }) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState<Record<string, string>>(() => toForm(launch));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  const set = (name: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateLaunchAction(values);
      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        toast({ variant: "error", title: "Settings not saved", description: result.formError });
        return;
      }
      setErrors({});
      toast({ variant: "success", title: "Settings saved" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <FormField label="Launch name" htmlFor="launch-name" required error={errors.name} className="md:col-span-2">
          <TextInput value={values.name} onChange={set("name")} />
        </FormField>
        <FormField label="Price" htmlFor="launch-price" required error={errors.price}>
          <TextInput inputMode="decimal" value={values.price} onChange={set("price")} />
        </FormField>
        <FormField label="Currency" htmlFor="launch-currency" required error={errors.currency}>
          <TextInput value={values.currency} onChange={set("currency")} maxLength={3} />
        </FormField>
        <FormField
          label="Founding capacity"
          htmlFor="launch-capacity"
          required
          hint="Changing this does not reclassify existing orders."
          error={errors.capacity}
        >
          <TextInput inputMode="numeric" value={values.capacity} onChange={set("capacity")} />
        </FormField>
        <FormField label="Gumroad product id" htmlFor="launch-product" hint="Reference only; the webhook uses GUMROAD_PRODUCT_ID." error={errors.gumroad_product_id} className="md:col-span-3">
          <TextInput value={values.gumroad_product_id} onChange={set("gumroad_product_id")} />
        </FormField>
        <FormField label="Primary metric" htmlFor="launch-metric" error={errors.primary_metric} className="md:col-span-2">
          <TextInput value={values.primary_metric} onChange={set("primary_metric")} />
        </FormField>
        <FormField label="Started on" htmlFor="launch-started" error={errors.started_on}>
          <TextInput type="date" value={values.started_on} onChange={set("started_on")} />
        </FormField>
        <FormField label="Ended on" htmlFor="launch-ended" error={errors.ended_on}>
          <TextInput type="date" value={values.ended_on} onChange={set("ended_on")} />
        </FormField>
      </div>

      <div className="rounded-md border border-white/[0.06] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Internal experiment criteria</p>
        <p className="mt-1 text-xs text-slate-500">
          Thresholds you set for this experiment. They are internal decision criteria, not industry benchmarks.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Minimum paid pre-orders from strangers" htmlFor="launch-min" error={errors.criteria_min_preorders}>
            <TextInput inputMode="numeric" value={values.criteria_min_preorders} onChange={set("criteria_min_preorders")} />
          </FormField>
          <FormField label="Strong signal: paid pre-orders from strangers" htmlFor="launch-strong" error={errors.criteria_strong_preorders}>
            <TextInput inputMode="numeric" value={values.criteria_strong_preorders} onChange={set("criteria_strong_preorders")} />
          </FormField>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {NOTE_FIELDS.map((field) => (
          <FormField key={field.name} label={field.label} htmlFor={`launch-${field.name}`} hint={field.hint} error={errors[field.name]}>
            <Textarea rows={4} value={values[field.name]} onChange={set(field.name)} />
          </FormField>
        ))}
      </div>

      <Button type="submit" variant="primary" size="sm" isLoading={pending}>
        Save settings
      </Button>
    </form>
  );
}
