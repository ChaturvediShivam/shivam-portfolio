"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { disconnectGoogleAction } from "@/app/admin/(dashboard)/settings/actions";
import type { GoogleAccountSummary } from "@/types/integration";

/**
 * Gmail connect / disconnect card (Phase 3 · M2).
 *
 * Connect is a full-page navigation to the server-side OAuth start route (no
 * client secrets). Disconnect calls the Server Action (revoke + soft-delete)
 * and refreshes. Rendered only when FEATURE_GOOGLE_OAUTH is on.
 */
export function IntegrationConnectCard({ account }: { account: GoogleAccountSummary | null }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const connected = account?.status === "connected";

  function handleDisconnect() {
    if (!account) return;
    setError(null);
    startTransition(async () => {
      const result = await disconnectGoogleAction(account.id);
      if (isActionError(result)) {
        setError(result.formError ?? "Could not disconnect. Please try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-200">Gmail</p>
          {connected ? (
            <Badge variant="success" dot>
              Connected
            </Badge>
          ) : account?.status === "error" ? (
            <Badge variant="danger">Reconnect</Badge>
          ) : (
            <Badge variant="neutral">Not connected</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {connected && account?.email ? account.email : "Connect your Google account to sync email into the CRM."}
        </p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      <div className="mt-4">
        {connected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={pending}
            className={cn(
              "w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.06]",
              pending && "cursor-not-allowed opacity-50",
            )}
          >
            {pending ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : (
          <a
            href="/api/integrations/google/connect"
            className="block w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-center text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            {account?.status === "error" ? "Reconnect" : "Connect"}
          </a>
        )}
      </div>
    </div>
  );
}
