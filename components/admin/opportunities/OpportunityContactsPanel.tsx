"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { Button, TextInput, EntityPicker, useToast, type EntityOption } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import type { OpportunityContactLink } from "@/types/opportunity";
import {
  addOpportunityContactAction,
  removeOpportunityContactAction,
  searchContactsAction,
} from "@/app/admin/(dashboard)/opportunities/actions";

export function OpportunityContactsPanel({
  opportunityId,
  links,
}: {
  opportunityId: string;
  links: OpportunityContactLink[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [contact, setContact] = React.useState<EntityOption | null>(null);
  const [role, setRole] = React.useState("");

  const loadContacts = React.useCallback((q: string) => searchContactsAction(q), []);

  function add() {
    if (!contact) return;
    startTransition(async () => {
      const result = await addOpportunityContactAction(opportunityId, contact.value, role || null);
      if (isActionError(result)) {
        toast({ variant: "error", title: "Couldn't link contact", description: result.formError });
        return;
      }
      setContact(null);
      setRole("");
      toast({ variant: "success", title: "Contact linked" });
      router.refresh();
    });
  }

  function remove(contactId: string) {
    startTransition(async () => {
      const result = await removeOpportunityContactAction(opportunityId, contactId);
      if (isActionError(result)) {
        toast({ variant: "error", title: "Couldn't unlink", description: result.formError });
        return;
      }
      toast({ variant: "success", title: "Contact unlinked" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <h2 className="text-sm font-semibold text-white">Contacts</h2>

      <ul className="mt-3 space-y-2">
        {links.length === 0 && <li className="text-xs text-slate-500">No contacts linked yet.</li>}
        {links.map((link) => (
          <li key={link.id} className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] px-3 py-2">
            <div className="min-w-0">
              {link.contact ? (
                <Link href={`/admin/contacts/${link.contact.id}`} className="text-sm text-slate-200 hover:text-white">
                  {link.contact.full_name}
                </Link>
              ) : (
                <span className="text-sm text-slate-400">Unknown contact</span>
              )}
              {link.role && <span className="ml-2 text-xs text-slate-500">{link.role}</span>}
            </div>
            <button
              type="button"
              onClick={() => remove(link.contact_id)}
              disabled={pending}
              aria-label={`Unlink ${link.contact?.full_name ?? "contact"}`}
              className="rounded p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-50"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <EntityPicker
            loadOptions={loadContacts}
            value={contact}
            onChange={(v) => setContact((v as EntityOption | null) ?? null)}
            placeholder="Search active contacts…"
            emptyMessage="No active contacts found"
          />
        </div>
        <TextInput
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (e.g. recruiter)"
          className="sm:w-44"
          aria-label="Role"
        />
        <Button type="button" variant="secondary" onClick={add} isLoading={pending} disabled={!contact}>
          <Plus className="size-4" aria-hidden />
          Link
        </Button>
      </div>
    </div>
  );
}
