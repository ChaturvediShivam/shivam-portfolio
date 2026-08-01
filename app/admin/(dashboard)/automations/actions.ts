"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction, actionSuccess, actionError, type ActionResult } from "@/lib/actions";
import { featureEnabled } from "@/lib/featureFlags";
import { validateRule, type DslIssue } from "@/lib/automation/schema";
import { archiveRule, createRule, getRule, setRuleEnabled, updateRule } from "@/lib/automation/rules";
import { dryRun } from "@/lib/automation/engine";
import type { AutomationEventEnvelope } from "@/types/automation";

/**
 * Automation rule actions (Phase 3 · M10).
 *
 * Server Actions are POST endpoints addressable by action id, so they remain
 * callable when the feature is off and the buttons are not rendered — a stale
 * tab during a rollback. Each action re-checks the flag.
 *
 * Disabling and archiving are deliberately NOT flag-gated: both only ever
 * reduce what a rule can do, and an operator disabling a misbehaving rule
 * mid-rollback must not be blocked by the rollback itself.
 */

function revalidate(): void {
  revalidatePath("/admin/automations");
}

/** DSL issues → the field-error shape the forms already render. */
function toFieldErrors(issues: DslIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    if (!fieldErrors[issue.path]) fieldErrors[issue.path] = issue.message;
  }
  return fieldErrors;
}

export interface RuleFormInput {
  name?: unknown;
  description?: unknown;
  trigger?: unknown;
  conditions?: unknown;
  actions?: unknown;
}

export async function createRuleAction(input: RuleFormInput): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_AUTOMATION")) {
      return actionError({ formError: "Automation is not enabled." });
    }

    const parsed = validateRule(input);
    if (parsed.ok === false) {
      return actionError({
        formError: "Fix the highlighted problems.",
        fieldErrors: toFieldErrors(parsed.issues),
      });
    }

    // Created disabled — see `createRule`. The operator arms it after reading
    // it back.
    const rule = await createRule(supabase, parsed.value, userId);
    revalidate();
    return actionSuccess({ id: rule.id });
  });
}

export async function updateRuleAction(
  id: string,
  input: RuleFormInput,
): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (!featureEnabled("FEATURE_AUTOMATION")) {
      return actionError({ formError: "Automation is not enabled." });
    }

    const parsed = validateRule(input);
    if (parsed.ok === false) {
      return actionError({
        formError: "Fix the highlighted problems.",
        fieldErrors: toFieldErrors(parsed.issues),
      });
    }

    const rule = await updateRule(supabase, id, userId, parsed.value);
    if (!rule) return actionError({ formError: "That rule no longer exists." });

    revalidate();
    return actionSuccess({ id: rule.id });
  });
}

/**
 * Arm or disarm a rule.
 *
 * Enabling is flag-gated; disabling is not. `enabled=false` is the documented
 * kill switch for this milestone, and a kill switch that could itself be
 * disabled would not be one.
 */
export async function setEnabledAction(
  id: string,
  enabled: boolean,
): Promise<ActionResult<{ enabled: boolean }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    if (enabled && !featureEnabled("FEATURE_AUTOMATION")) {
      return actionError({ formError: "Automation is not enabled." });
    }

    const rule = await setRuleEnabled(supabase, id, userId, enabled);
    if (!rule) return actionError({ formError: "That rule no longer exists." });

    revalidate();
    return actionSuccess({ enabled: rule.enabled });
  });
}

export async function archiveRuleAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const rule = await archiveRule(supabase, id, userId);
    if (!rule) return actionError({ formError: "That rule no longer exists." });

    revalidate();
    return actionSuccess({ id: rule.id });
  });
}

/**
 * Evaluate a rule against a sample record without executing anything.
 *
 * The reason `enabled` defaults to false: a rule can be checked before it is
 * allowed to act. `dryRun` is pure — it touches no data layer.
 */
export async function testRuleAction(
  id: string,
  sampleEntity: Record<string, unknown>,
): Promise<ActionResult<{ matched: boolean; wouldRun: string[] }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    const rule = await getRule(supabase, id, userId);
    if (!rule) return actionError({ formError: "That rule no longer exists." });

    if (rule.trigger.type !== "event") {
      return actionError({ formError: "Scheduled rules have no record to test against." });
    }

    const envelope: AutomationEventEnvelope = {
      type: rule.trigger.event,
      ownerId: userId,
      entityType: "sample",
      entityId: "00000000-0000-0000-0000-000000000000",
      entity: sampleEntity,
      idempotencyKey: "dry-run",
      occurredAt: new Date().toISOString(),
    };

    return actionSuccess(dryRun(rule, envelope));
  });
}
