"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Archive, ArchiveRestore } from "lucide-react";
import { Button, buttonClasses, ConfirmDialog, useToast } from "@/components/admin/ui";
import type { Opportunity } from "@/types/opportunity";
import { isActionError } from "@/lib/action-result";
import { StageSelect } from "./StageSelect";
import { archiveOpportunityAction, restoreOpportunityAction } from "@/app/admin/(dashboard)/opportunities/actions";

export function OpportunityActions({ opportunity }: { opportunity: Opportunity }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const isArchived = opportunity.archived_at != null;

  function archive() {
    startTransition(async () => {
      const result = await archiveOpportunityAction(opportunity.id);
      setConfirmOpen(false);
      if (isActionError(result)) {
        toast({ variant: "error", title: "Couldn't archive", description: result.formError });
        return;
      }
      toast({ variant: "success", title: "Opportunity archived" });
      router.refresh();
    });
  }

  function restore() {
    startTransition(async () => {
      const result = await restoreOpportunityAction(opportunity.id);
      if (isActionError(result)) {
        toast({ variant: "error", title: "Couldn't restore", description: result.formError });
        return;
      }
      toast({ variant: "success", title: "Opportunity restored" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isArchived && <StageSelect opportunityId={opportunity.id} stage={opportunity.stage} />}

      <Link href={`/admin/opportunities/${opportunity.id}/edit`} className={buttonClasses("secondary", "md")}>
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
        title={`Archive “${opportunity.title}”?`}
        description="It will be hidden from the pipeline and default list. You can restore it anytime."
        confirmLabel="Archive"
        destructive
        isPending={pending}
        onConfirm={archive}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
