"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import type { OpportunityNote } from "@/types/opportunity";
import { addNoteAction } from "@/app/admin/(dashboard)/opportunities/actions";

function formatDateTime(v: string) {
  return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function OpportunityNotesPanel({
  opportunityId,
  notes,
}: {
  opportunityId: string;
  notes: OpportunityNote[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError("Note can't be empty");
      return;
    }
    startTransition(async () => {
      const result = await addNoteAction(opportunityId, body);
      if (isActionError(result)) {
        setError(result.fieldErrors?.body ?? result.formError ?? "Couldn't add note");
        toast({ variant: "error", title: "Couldn't add note" });
        return;
      }
      setBody("");
      toast({ variant: "success", title: "Note added" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <h2 className="text-sm font-semibold text-white">Notes</h2>

      <form onSubmit={add} className="mt-3 space-y-2" noValidate>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a note…"
          aria-label="New note"
          invalid={!!error}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" size="sm" isLoading={pending}>
            Add note
          </Button>
        </div>
      </form>

      <ul className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
        {notes.length === 0 && <li className="text-xs text-slate-500">No notes yet.</li>}
        {notes.map((note) => (
          <li key={note.id} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <p className="whitespace-pre-wrap text-sm text-slate-200">{note.body}</p>
            <p className="mt-1 text-xs text-slate-600">{formatDateTime(note.created_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
