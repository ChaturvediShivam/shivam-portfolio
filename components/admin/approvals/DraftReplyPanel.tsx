"use client";

import * as React from "react";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { Button, Textarea, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { draftReplyAction } from "@/app/admin/(dashboard)/approvals/actions";

/**
 * Draft-a-reply entry point (Phase 3 · M9).
 *
 * Deliberately asks for an instruction rather than offering a one-click
 * "draft a reply" button. The model writes in the operator's name, and the one
 * thing it cannot infer from the thread is what the operator actually wants to
 * say — a draft generated without that is a guess wearing their signature.
 *
 * Produces a proposal only. The success state links to the queue rather than
 * showing the draft here, because deciding on it belongs where every other
 * pending action lives.
 */

interface DraftReplyPanelProps {
  messageId: string;
  disabled?: boolean;
}

const MAX_INSTRUCTION_CHARS = 1_000;

export function DraftReplyPanel({ messageId, disabled }: DraftReplyPanelProps) {
  const [instruction, setInstruction] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [drafted, setDrafted] = React.useState(false);
  const { toast } = useToast();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !instruction.trim()) return;

    setBusy(true);
    try {
      const result = await draftReplyAction(messageId, instruction);
      if (isActionError(result)) {
        toast({ variant: "error", title: result.formError ?? "Could not draft a reply." });
      } else {
        setDrafted(true);
        setInstruction("");
        toast({ variant: "success", title: "Draft ready for review." });
      }
    } catch (error) {
      console.error("[draft reply] failed:", error);
      toast({ variant: "error", title: "Could not draft a reply. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="draft-reply-heading"
      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <h2 id="draft-reply-heading" className="text-sm font-semibold text-white">
        Draft a reply
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Say what the reply should cover. Nothing is sent until you approve it.
      </p>

      {drafted ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-300">Your draft is waiting for review.</p>
          <Link
            href="/admin/approvals"
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.1]"
          >
            Review it in Approvals
          </Link>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <label htmlFor="draft-instruction" className="sr-only">
            What should the reply say?
          </label>
          <Textarea
            id="draft-instruction"
            rows={3}
            maxLength={MAX_INSTRUCTION_CHARS}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="e.g. Confirm Thursday at 14:00 works, and ask who else will be on the call."
            disabled={disabled || busy}
          />
          <Button type="submit" variant="primary" size="sm" isLoading={busy} disabled={disabled || !instruction.trim()}>
            <PenLine className="size-3.5" aria-hidden />
            Draft reply
          </Button>
        </form>
      )}
    </section>
  );
}
