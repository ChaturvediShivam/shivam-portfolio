import { Inbox } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "@/components/admin/ui";
import { listPushProviders } from "@/lib/career-intelligence/providers/registry";

export const metadata = { title: "Browser Inbox" };

/**
 * Landing zone for records pushed in by the future Chrome extension.
 *
 * Phase 1 has no ingestion, so the page reports the real state of the provider
 * registry rather than hardcoding "empty": once an ExtensionProvider is
 * registered in Phase 2, the connection line below reflects it without this
 * page changing.
 */
export default function BrowserInboxPage() {
  const pushProviders = listPushProviders();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Browser Inbox"
        description="Applications captured by the browser extension land here for review before they become opportunities."
        actions={<Badge variant="neutral">Coming in Phase 2</Badge>}
      />

      <EmptyState icon={<Inbox />} title="No imported browser data yet." />

      <p className="text-xs text-slate-500">
        {pushProviders.length === 0
          ? "No push-capable import provider is registered."
          : `${pushProviders.length} push-capable provider(s) registered: ${pushProviders
              .map((p) => p.displayName)
              .join(", ")}.`}
      </p>
    </div>
  );
}
