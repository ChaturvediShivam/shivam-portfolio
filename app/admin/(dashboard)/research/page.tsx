import { notFound } from "next/navigation";
import { Telescope } from "lucide-react";
import { PageHeader, Badge } from "@/components/admin/ui";
import { featureEnabled } from "@/lib/featureFlags";
import { listProviderStatus } from "@/lib/research/registry";
import { ResearchWorkspace } from "@/components/admin/research/ResearchWorkspace";

/**
 * Research — the multi-provider intelligence surface.
 *
 * Jobs, companies, news and macro indicators from every configured source, in
 * one place. This is the UI the `lib/research` layer was built for.
 *
 * Deliberately SEPARATE from the Job Feed rather than replacing it. Job Feed is
 * the AI Dev Jobs + AI-matching surface: `JobMatchPanel` sends a job id and the
 * action re-fetches that posting from the Phase 1 client to guarantee the model
 * sees a posting the operator can actually see. Pointing that page at a
 * multi-provider result set would break that guarantee and Phase 2 with it.
 * Consolidating the two is a deliberate decision for a later phase, not a side
 * effect of adding providers.
 *
 * Reachable only behind FEATURE_RESEARCH — the page itself, on top of each
 * provider's own flag, so the whole surface can be withdrawn in one switch.
 */

export const metadata = { title: "Research" };

/** Flags and credentials are read per request: flipping one is a rollback. */
export const dynamic = "force-dynamic";

export default function ResearchPage() {
  if (!featureEnabled("FEATURE_RESEARCH")) notFound();

  // Read on the server: `listProviderStatus` reads env vars and feature flags,
  // neither of which may travel to the browser. The client receives the
  // computed answer, never the inputs.
  const status = listProviderStatus();
  const available = status.filter((row) => row.available);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Research"
        description="Jobs, companies, news and macro indicators from every configured source."
        count={available.length}
        countLabel={`of ${status.length} providers available`}
      />

      <section aria-label="Provider status" className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center gap-2">
          <Telescope size={14} aria-hidden="true" className="text-slate-500" />
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Providers
          </h2>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {status.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-white/[0.01] px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-300">{row.displayName}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-600">{row.kind}</p>
              </div>
              {/* Three distinct states, never collapsed into one. */}
              {row.available ? (
                <Badge variant="success">ready</Badge>
              ) : !row.enabled ? (
                <Badge variant="neutral">off</Badge>
              ) : (
                <Badge variant="progress">no key</Badge>
              )}
            </li>
          ))}
        </ul>

        {/* Naming the exact variable turns a dead end into a setup step. */}
        {status.some((row) => row.enabled && !row.configured) ? (
          <p className="mt-3 text-[11px] text-slate-500">
            Missing credentials:{" "}
            {status
              .filter((row) => row.enabled && !row.configured && row.requiredEnv)
              .map((row) => `${row.displayName} (${row.requiredEnv})`)
              .join(", ")}
          </p>
        ) : null}
      </section>

      <ResearchWorkspace />
    </div>
  );
}
