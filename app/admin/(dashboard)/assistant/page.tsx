import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/ui";
import { featureEnabled } from "@/lib/featureFlags";
import { AssistantChat } from "@/components/admin/assistant/AssistantChat";

/**
 * Assistant page (Phase 3 · M8).
 *
 * Flag-gated to a 404 rather than a disabled view: with the flag off the route
 * should be indistinguishable from one that was never built, matching the
 * hidden nav item and the 404 from `POST /api/ai/chat`.
 */

export const metadata = { title: "Assistant" };

/**
 * The flag must be read per request, not at build time.
 *
 * This page reaches for no dynamic data of its own, so Next would happily
 * prerender it and bake in whatever `FEATURE_ASSISTANT` said during the build —
 * which would break the flag contract in `lib/featureFlags.ts`: flipping a flag
 * is a rollback, and a rollback cannot require a redeploy to take effect.
 */
export const dynamic = "force-dynamic";

export default function AssistantPage() {
  if (!featureEnabled("FEATURE_ASSISTANT")) notFound();

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-6 md:p-10 max-w-4xl mx-auto">
      <PageHeader
        title="Assistant"
        description="Ask questions about your job search. Answers are grounded in your CRM records."
      />
      <div className="mt-2 min-h-0 flex-1">
        <AssistantChat />
      </div>
    </div>
  );
}
