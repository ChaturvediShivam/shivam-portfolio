"use client";

import * as React from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { Badge, Button, useToast } from "@/components/admin/ui";
import { isActionError, type ActionResult } from "@/lib/action-result";
import { approvalStatusBadgeVariant, approvalStatusLabel } from "@/types/approval";
import type { Approval, EmailReplyPayload } from "@/types/approval";
import {
  approveAction,
  dismissAction,
  rejectAction,
  sendAction,
} from "@/app/admin/(dashboard)/approvals/actions";

/**
 * One proposed reply awaiting a decision (Phase 3 · M9).
 *
 * Shows the complete outbound message — every recipient, the exact subject and
 * the exact body — because approving means approving precisely this. A card
 * that summarised the payload would be asking the operator to authorise
 * something they had not read.
 *
 * Approve and Send are separate presses. The extra click is the point: it is
 * the last reversible moment before mail leaves.
 */

interface ApprovalCardProps {
  approval: Approval;
}

type Pending = "approve" | "reject" | "send" | "dismiss" | null;

function isEmailPayload(payload: unknown): payload is EmailReplyPayload {
  return Boolean(payload && typeof payload === "object" && "bodyText" in payload);
}

function formatDateTime(value: string | null): string {
  return value
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

export function ApprovalCard({ approval }: ApprovalCardProps) {
  const [pending, setPending] = React.useState<Pending>(null);
  const { toast } = useToast();

  const payload = isEmailPayload(approval.proposed_payload) ? approval.proposed_payload : null;
  const busy = pending !== null;

  async function run<T>(
    kind: Exclude<Pending, null>,
    fn: () => Promise<ActionResult<T>>,
    success: string,
  ) {
    if (busy) return;
    setPending(kind);
    try {
      const result = await fn();
      if (isActionError(result)) {
        toast({ variant: "error", title: result.formError ?? "That didn't work." });
      } else {
        toast({ variant: "success", title: success });
      }
    } catch (error) {
      console.error("[approvals] action failed:", error);
      toast({ variant: "error", title: "That didn't work. Please try again." });
    } finally {
      setPending(null);
    }
  }

  const decided = approval.status === "rejected" || approval.status === "sent";

  return (
    <article className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">
            {payload?.subject ?? approval.action_type}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Drafted {formatDateTime(approval.created_at)}
            {approval.ai_model && ` · ${approval.ai_model}`}
            {typeof approval.ai_confidence === "number" &&
              ` · confidence ${approval.ai_confidence.toFixed(2)}`}
          </p>
        </div>
        <Badge variant={approvalStatusBadgeVariant(approval.status)}>
          {approvalStatusLabel(approval.status)}
        </Badge>
      </header>

      {payload && (
        <dl className="mb-3 space-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-slate-600">To</dt>
            <dd className="min-w-0 break-words text-slate-300">{payload.to.join(", ")}</dd>
          </div>
          {payload.cc.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-10 shrink-0 text-slate-600">Cc</dt>
              <dd className="min-w-0 break-words text-slate-300">{payload.cc.join(", ")}</dd>
            </div>
          )}
        </dl>
      )}

      {/* The exact bytes that will be sent, not a preview of them. */}
      {payload && (
        <pre className="mb-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/[0.06] bg-black/20 p-3 font-sans text-sm text-slate-300">
          {payload.bodyText}
        </pre>
      )}

      {approval.rationale && (
        <p className="mb-3 text-xs text-slate-500">
          <span className="text-slate-600">Why: </span>
          {approval.rationale}
        </p>
      )}

      {approval.last_error && (
        <p className="mb-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {approval.last_error}
        </p>
      )}

      {!decided && (
        <div className="flex flex-wrap gap-2">
          {approval.status === "pending" || approval.status === "failed" ? (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                isLoading={pending === "approve"}
                onClick={() => run("approve", () => approveAction(approval.id), "Approved.")}
              >
                <Check className="size-3.5" aria-hidden />
                Approve
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                isLoading={pending === "reject"}
                onClick={() => run("reject", () => rejectAction(approval.id), "Rejected.")}
              >
                <X className="size-3.5" aria-hidden />
                Reject
              </Button>
            </>
          ) : null}

          {approval.status === "approved" && (
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              isLoading={pending === "send"}
              onClick={() => run("send", () => sendAction(approval.id), "Reply sent.")}
            >
              <Send className="size-3.5" aria-hidden />
              Send now
            </Button>
          )}

          {approval.status === "sending" && (
            <div className="space-y-2">
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Sending…
              </span>
              {/*
                A request that died mid-send leaves this state permanently, and
                after a crash nobody can say whether the mail went out. The
                escape hatch is honest about that rather than offering a retry
                that might duplicate a delivered email.
              */}
              <p className="text-xs text-slate-500">
                Stuck here? The send may or may not have completed — check your sent mail before
                drafting another reply.
              </p>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                isLoading={pending === "dismiss"}
                onClick={() => run("dismiss", () => dismissAction(approval.id), "Set aside.")}
              >
                Set aside
              </Button>
            </div>
          )}
        </div>
      )}

      {approval.status === "sent" && (
        <p className="text-xs text-slate-500">Sent {formatDateTime(approval.executed_at)}.</p>
      )}
    </article>
  );
}
