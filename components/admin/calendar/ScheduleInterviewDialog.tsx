"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, FormField, TextInput, EntityPicker, Button, type EntityOption } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import {
  createInterviewAction,
  searchOpportunitiesAction,
  type CreateInterviewInput,
} from "@/app/admin/(dashboard)/calendar/actions";

/**
 * Schedule-interview dialog (Phase 3 · M4). Creates a Google Calendar event
 * (optionally linked to an opportunity) via the Server Action.
 */
export function ScheduleInterviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [opportunity, setOpportunity] = React.useState<EntityOption | null>(null);

  function submit(formData: FormData) {
    setErrors({});
    setFormError(null);
    const input: CreateInterviewInput = {
      title: String(formData.get("title") ?? ""),
      startsAt: String(formData.get("startsAt") ?? ""),
      endsAt: String(formData.get("endsAt") ?? ""),
      location: String(formData.get("location") ?? ""),
      attendees: String(formData.get("attendees") ?? ""),
      opportunityId: opportunity?.value ?? null,
    };
    startTransition(async () => {
      const result = await createInterviewAction(input);
      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        return;
      }
      setOpportunity(null);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Schedule interview">
      <form action={submit} className="space-y-4">
        {formError && <p className="text-sm text-red-400">{formError}</p>}

        <FormField label="Title" htmlFor="title" required error={errors.title}>
          <TextInput id="title" name="title" placeholder="Interview — Backend Engineer" />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Starts" htmlFor="startsAt" required error={errors.startsAt}>
            <TextInput id="startsAt" name="startsAt" type="datetime-local" />
          </FormField>
          <FormField label="Ends" htmlFor="endsAt" required error={errors.endsAt}>
            <TextInput id="endsAt" name="endsAt" type="datetime-local" />
          </FormField>
        </div>

        <FormField label="Location" htmlFor="location" error={errors.location}>
          <TextInput id="location" name="location" placeholder="Zoom / office / phone" />
        </FormField>

        <FormField label="Attendees" htmlFor="attendees" hint="Comma-separated emails" error={errors.attendees}>
          <TextInput id="attendees" name="attendees" placeholder="recruiter@corp.com, hm@corp.com" />
        </FormField>

        <FormField label="Opportunity" htmlFor="opportunity" hint="Optional — links the event + timeline">
          <EntityPicker
            loadOptions={searchOpportunitiesAction}
            value={opportunity}
            onChange={(v) => setOpportunity((Array.isArray(v) ? v[0] : v) ?? null)}
            placeholder="Search opportunities…"
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
