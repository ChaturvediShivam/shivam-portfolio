import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getJobsHealth } from "@/lib/jobs/queue";
import { Badge } from "@/components/admin/ui";
import { SettingRow } from "./SettingsControls";

/**
 * Read-only background-job queue health (Phase 3 · M1).
 *
 * A server component that reads aggregate counts through the session-bound
 * (RLS-scoped) client. Rendered only when `FEATURE_JOBS` is enabled, and it
 * degrades gracefully to an informational message when the queue table is not
 * available yet (migration not applied), so Settings never errors.
 */
export async function JobsHealthPanel() {
  const supabase = await createServerSupabaseClient();
  const health = await getJobsHealth(supabase);

  if (!health) {
    return (
      <p className="text-xs text-slate-500">
        Job queue not available yet — apply the M1 migration to enable it.
      </p>
    );
  }

  return (
    <dl className="divide-y divide-white/[0.06]">
      <SettingRow label="Pending" value={String(health.pending)} hint="Waiting to run." />
      <SettingRow label="Running" value={String(health.running)} hint="Currently leased by a worker." />
      <SettingRow label="Completed" value={String(health.done)} />
      <SettingRow
        label="Dead-letter"
        value={
          health.failed > 0 ? (
            <Badge variant="danger">{health.failed}</Badge>
          ) : (
            <Badge variant="success" dot>
              0
            </Badge>
          )
        }
        hint={health.failed > 0 ? "Jobs that exhausted their retries — investigate." : "No failed jobs."}
      />
    </dl>
  );
}
