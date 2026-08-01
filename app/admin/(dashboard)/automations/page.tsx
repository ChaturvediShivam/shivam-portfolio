import { notFound } from "next/navigation";
import { Workflow } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/admin/ui";
import { featureEnabled } from "@/lib/featureFlags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRules, listRuns } from "@/lib/automation/rules";
import { RuleCard } from "@/components/admin/automations/RuleCard";
import { RuleForm } from "@/components/admin/automations/RuleForm";

/**
 * Automations (Phase 3 · M10).
 *
 * Rules and their recent runs on one page. The runs are not a detail view
 * because a rule that is not firing and a rule that is firing and matching
 * nothing look identical from the outside — the run log is what tells them
 * apart, so it sits next to the rule it explains.
 */

export const metadata = { title: "Automations" };

/** Flag read per request: flipping it is a rollback, not a redeploy. */
export const dynamic = "force-dynamic";

/** Runs shown under each rule. Enough to see a pattern, not a history. */
const RUNS_PER_RULE = 5;

export default async function AutomationsPage() {
  if (!featureEnabled("FEATURE_AUTOMATION")) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const rules = await listRules(supabase, user.id);
  // One query for the whole page rather than one per rule.
  const runs = await listRuns(supabase, user.id, { limit: 200 });

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Automations"
        description="Rules that react to what happens in your job search. Anything irreversible still needs your approval."
      />

      {rules.length === 0 ? (
        <EmptyState
          icon={<Workflow />}
          title="No rules yet"
          description="Create a rule below. New rules start turned off so you can read them back before they act."
        />
      ) : (
        <section aria-label="Rules" className="space-y-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              runs={runs.filter((run) => run.rule_id === rule.id).slice(0, RUNS_PER_RULE)}
            />
          ))}
        </section>
      )}

      <RuleForm />
    </div>
  );
}
