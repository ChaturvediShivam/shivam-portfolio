import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/admin/ui";
import { featureEnabled } from "@/lib/featureFlags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listApprovals } from "@/lib/approvals";
import { ApprovalCard } from "@/components/admin/approvals/ApprovalCard";

/**
 * Approvals queue (Phase 3 · M9).
 *
 * Every proposed external action, newest first, with the pending ones on top —
 * this page is the gate ADR-006 describes, so the work waiting on a human
 * decision must never be below the fold behind already-decided history.
 */

export const metadata = { title: "Approvals" };

/**
 * The flag is read per request, not at build time: flipping a flag is a
 * rollback, and a rollback cannot require a redeploy to take effect.
 */
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  if (!featureEnabled("FEATURE_EMAIL_DRAFTING")) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { rows } = await listApprovals(supabase, user.id, { pageSize: 50 });

  const undecided = rows.filter((row) => row.status !== "sent" && row.status !== "rejected");
  const history = rows.filter((row) => row.status === "sent" || row.status === "rejected");

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Approvals"
        description="AI-drafted replies wait here. Nothing is sent until you approve it."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Nothing waiting"
          description="Draft a reply from a message and it will appear here for review before anything is sent."
        />
      ) : (
        <>
          {undecided.length > 0 && (
            <section aria-labelledby="pending-heading" className="space-y-3">
              <h2 id="pending-heading" className="text-sm font-semibold text-white">
                Waiting on you
              </h2>
              {undecided.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </section>
          )}

          {history.length > 0 && (
            <section aria-labelledby="history-heading" className="space-y-3">
              <h2 id="history-heading" className="text-sm font-semibold text-white">
                Decided
              </h2>
              {history.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
