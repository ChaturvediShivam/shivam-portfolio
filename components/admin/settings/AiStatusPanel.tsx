import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUsageSnapshot } from "@/lib/ai/budget";
import { countRecentAiFailures } from "@/lib/ai/audit";
import { isAiProviderConfigured } from "@/lib/ai/providers";
import { Badge } from "@/components/admin/ui";
import { SettingRow } from "./SettingsControls";
import { AiSelfTestButton } from "./AiSelfTestButton";
import { BackfillSummariesButton } from "./BackfillSummariesButton";
import { featureEnabled } from "@/lib/featureFlags";

/**
 * Read-only AI status (Phase 3 · M6).
 *
 * Mirrors the M1 jobs-health panel: a server component reading through the
 * session-bound (RLS-scoped) client, degrading to an informational message when
 * the M6 migration has not been applied yet so Settings never errors.
 *
 * Nothing here reveals the provider key — only whether one is present.
 */
export async function AiStatusPanel() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const configured = isAiProviderConfigured();
  const usage = await getUsageSnapshot(supabase, user.id);
  const failures = await countRecentAiFailures(supabase, user.id);

  if (!usage) {
    return (
      <p className="text-xs text-slate-500">
        AI ledger not available yet — apply the M6 migration to enable it.
      </p>
    );
  }

  const budgetLabel =
    usage.limit === null
      ? `${usage.tokensUsed.toLocaleString()} (no daily limit set)`
      : `${usage.tokensUsed.toLocaleString()} / ${usage.limit.toLocaleString()}`;

  return (
    <>
      <dl className="divide-y divide-white/[0.06]">
        <SettingRow
          label="Provider"
          value={
            configured ? (
              <Badge variant="success" dot>
                Configured
              </Badge>
            ) : (
              <Badge variant="neutral">Not configured</Badge>
            )
          }
          hint="Set AI_PROVIDER_API_KEY to enable calls."
        />
        <SettingRow label="Tokens today" value={budgetLabel} hint="Reserved usage is reconciled after each call." />
        <SettingRow label="Requests today" value={String(usage.requestCount)} />
        <SettingRow
          label="Estimated cost today"
          value={`$${(usage.costMicros / 1_000_000).toFixed(4)}`}
          hint="Estimated from provider list pricing."
        />
        <SettingRow
          label="Failures (24h)"
          value={
            failures === null ? (
              "—"
            ) : failures > 0 ? (
              <Badge variant="danger">{failures}</Badge>
            ) : (
              <Badge variant="success" dot>
                0
              </Badge>
            )
          }
          hint={failures ? "Check the audit log for error codes." : "No failed AI calls."}
        />
      </dl>
      <AiSelfTestButton />
      {/* Backfill is part of the summaries feature, so it disappears with it. */}
      {featureEnabled("FEATURE_AI_SUMMARIES") && <BackfillSummariesButton />}
    </>
  );
}
