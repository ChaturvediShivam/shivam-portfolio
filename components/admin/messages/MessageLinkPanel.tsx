"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FormField, EntityPicker, Button, useToast, type EntityOption } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import type { Message } from "@/types/message";
import {
  linkMessageAction,
  searchOpportunitiesAction,
  searchContactsAction,
  searchCompaniesAction,
} from "@/app/admin/(dashboard)/messages/actions";

export function MessageLinkPanel({ message }: { message: Message }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [opportunity, setOpportunity] = React.useState<EntityOption | null>(
    message.opportunity ? { value: message.opportunity.id, label: message.opportunity.title } : null,
  );
  const [contact, setContact] = React.useState<EntityOption | null>(
    message.contact ? { value: message.contact.id, label: message.contact.full_name } : null,
  );
  const [company, setCompany] = React.useState<EntityOption | null>(
    message.company ? { value: message.company.id, label: message.company.name } : null,
  );

  const loadOpportunities = React.useCallback((q: string) => searchOpportunitiesAction(q), []);
  const loadContacts = React.useCallback((q: string) => searchContactsAction(q), []);
  const loadCompanies = React.useCallback((q: string) => searchCompaniesAction(q), []);

  function save() {
    startTransition(async () => {
      const result = await linkMessageAction(message.id, {
        opportunity_id: opportunity?.value ?? null,
        contact_id: contact?.value ?? null,
        company_id: company?.value ?? null,
      });
      if (isActionError(result)) {
        toast({ variant: "error", title: "Couldn't save links", description: result.formError });
        return;
      }
      toast({ variant: "success", title: "Links saved" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <h2 className="text-sm font-semibold text-white">Linked to</h2>
      <div className="mt-3 space-y-3">
        <FormField label="Opportunity" htmlFor="link-opportunity">
          <EntityPicker loadOptions={loadOpportunities} value={opportunity} onChange={(v) => setOpportunity((v as EntityOption | null) ?? null)} placeholder="Link an opportunity…" emptyMessage="No active opportunities" />
        </FormField>
        <FormField label="Contact" htmlFor="link-contact">
          <EntityPicker loadOptions={loadContacts} value={contact} onChange={(v) => setContact((v as EntityOption | null) ?? null)} placeholder="Link a contact…" emptyMessage="No active contacts" />
        </FormField>
        <FormField label="Company" htmlFor="link-company">
          <EntityPicker loadOptions={loadCompanies} value={company} onChange={(v) => setCompany((v as EntityOption | null) ?? null)} placeholder="Link a company…" emptyMessage="No active companies" />
        </FormField>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={save} isLoading={pending}>
          Save links
        </Button>
      </div>
    </div>
  );
}
