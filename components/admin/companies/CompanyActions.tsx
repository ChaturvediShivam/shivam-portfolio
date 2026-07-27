"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Archive, ArchiveRestore } from "lucide-react";
import { Button, buttonClasses, ConfirmDialog, useToast } from "@/components/admin/ui";
import type { Company } from "@/types/company";
import { isActionError } from "@/lib/action-result";
import { archiveCompanyAction, restoreCompanyAction } from "@/app/admin/(dashboard)/companies/actions";

export function CompanyActions({ company }: { company: Company }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const isArchived = company.archived_at != null;

  function archive() {
    startTransition(async () => {
      const result = await archiveCompanyAction(company.id);
      setConfirmOpen(false);
      if (isActionError(result)) {
        toast({ variant: "error", title: "Couldn't archive", description: result.formError });
        return;
      }
      toast({ variant: "success", title: "Company archived" });
      router.refresh();
    });
  }

  function restore() {
    startTransition(async () => {
      const result = await restoreCompanyAction(company.id);
      if (isActionError(result)) {
        toast({ variant: "error", title: "Couldn't restore", description: result.formError });
        return;
      }
      toast({ variant: "success", title: "Company restored" });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={`/admin/companies/${company.id}/edit`} className={buttonClasses("secondary", "md")}>
        <Pencil className="size-4" aria-hidden />
        Edit
      </Link>

      {isArchived ? (
        <Button variant="secondary" onClick={restore} isLoading={pending}>
          <ArchiveRestore className="size-4" aria-hidden />
          Restore
        </Button>
      ) : (
        <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={pending}>
          <Archive className="size-4" aria-hidden />
          Archive
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Archive ${company.name}?`}
        description="It will be hidden from the default list. You can restore it anytime."
        confirmLabel="Archive"
        destructive
        isPending={pending}
        onConfirm={archive}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
