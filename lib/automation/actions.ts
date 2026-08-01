import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTask } from "@/lib/tasks";
import { addNote } from "@/lib/opportunities";
import { createNotification } from "@/lib/notifications";
import { createApproval, DuplicateApprovalError } from "@/lib/approvals";
import type {
  ActionResultEntry,
  AutomationEventEnvelope,
  RuleAction,
  TriggerType,
} from "@/types/automation";
import { TASK_PRIORITIES } from "@/types/task";

/**
 * Automation action executors (Phase 3 · M10).
 *
 * Every action runs through the SAME `lib/*` function the UI calls, so
 * validation, RLS-shaped owner scoping, and the timeline events those layers
 * already emit apply identically whether a human or a rule did it. Nothing here
 * writes a domain table directly.
 *
 * Two classes, and the difference is the whole safety story:
 *
 *   • DIRECT (`create_task`, `send_notification`, `add_note`) — internal,
 *     reversible, visible only to the operator. These execute.
 *   • APPROVAL-GATED (`draft_email`, `change_stage`) — externally visible or
 *     hard to undo. These NEVER execute here. They write an `ai_approvals` row
 *     and stop, so the human gate M9 built is what stands between a rule and an
 *     irreversible effect (ADR-006). An automation may propose; only a person
 *     may send.
 */

/** The subject an action operates on, derived from the triggering event. */
export interface ActionContext {
  client: SupabaseClient;
  ownerId: string;
  envelope: AutomationEventEnvelope | null;
  triggerType: TriggerType;
  ruleId: string;
}

/**
 * The opportunity an action targets.
 *
 * An explicit `opportunity_id` on the action wins; otherwise the triggering
 * entity supplies it. Returning null is a legitimate outcome — a rule on
 * `message.received` for unlinked mail has no opportunity — and the caller
 * reports it as a skipped action rather than an error.
 */
function resolveOpportunityId(
  action: { opportunity_id?: string },
  envelope: AutomationEventEnvelope | null,
): string | null {
  if (action.opportunity_id) return action.opportunity_id;
  if (!envelope) return null;

  const entity = envelope.entity as Record<string, Record<string, unknown> | undefined>;
  const direct = entity.opportunity?.id;
  if (typeof direct === "string") return direct;

  // A task or message that is linked to an opportunity carries its id.
  for (const key of ["task", "message"]) {
    const linked = entity[key]?.opportunity_id;
    if (typeof linked === "string") return linked;
  }

  return null;
}

/** Stable key so a redelivered run cannot create a second proposal. */
function approvalKey(ruleId: string, envelope: AutomationEventEnvelope | null, kind: string): string {
  return `automation:${kind}:${ruleId}:${envelope?.idempotencyKey ?? "schedule"}`;
}

async function runCreateTask(
  action: Extract<RuleAction, { action: "create_task" }>,
  ctx: ActionContext,
): Promise<ActionResultEntry> {
  const dueAt =
    typeof action.due_in_days === "number"
      ? new Date(Date.now() + action.due_in_days * 86_400_000).toISOString()
      : null;

  const priority = TASK_PRIORITIES.includes(action.priority as never) ? action.priority : "medium";

  await createTask(
    ctx.client,
    ctx.ownerId,
    {
      title: action.title,
      priority,
      due_at: dueAt,
      opportunity_id: resolveOpportunityId(action, ctx.envelope),
    },
    // Unassigned: a rule has no standing to assign work to a particular person,
    // and the single-operator model makes the owner the implicit assignee.
    null,
  );

  return { action: "create_task", status: "executed", detail: action.title };
}

async function runSendNotification(
  action: Extract<RuleAction, { action: "send_notification" }>,
  ctx: ActionContext,
): Promise<ActionResultEntry> {
  // Deduped on the triggering event, so a redelivered job does not re-notify.
  const dedupeKey = `automation:${ctx.ruleId}:${ctx.envelope?.idempotencyKey ?? Date.now()}`;

  const { created } = await createNotification(ctx.client, {
    type: action.type,
    priority: "normal",
    title: action.title,
    body: action.body ?? null,
    dedupeKey,
    ownerId: ctx.ownerId,
    payload: {
      // The declared `NotificationPayload` keys. An earlier draft wrote
      // snake_case behind a cast, which typechecked and would have shipped a
      // payload the bell could not read.
      ...(ctx.envelope ? { entityType: ctx.envelope.entityType, entityId: ctx.envelope.entityId } : {}),
      actor: "automation",
      variables: { ruleId: ctx.ruleId },
    },
  });

  return {
    action: "send_notification",
    status: created ? "executed" : "skipped",
    detail: created ? action.title : "Already notified for this event.",
  };
}

async function runAddNote(
  action: Extract<RuleAction, { action: "add_note" }>,
  ctx: ActionContext,
): Promise<ActionResultEntry> {
  const opportunityId = resolveOpportunityId(action, ctx.envelope);
  if (!opportunityId) {
    return { action: "add_note", status: "skipped", detail: "No opportunity to attach the note to." };
  }

  await addNote(ctx.client, opportunityId, action.body, ctx.ownerId);
  return { action: "add_note", status: "executed" };
}

/**
 * Propose a stage change. Never performs one.
 *
 * `changeStage` exists in `lib/opportunities.ts` and is deliberately NOT called:
 * a stage change rewrites the operator's pipeline and emits a timeline event
 * attributed to them, so ADR-006 puts it behind the human gate.
 */
async function proposeStageChange(
  action: Extract<RuleAction, { action: "change_stage" }>,
  ctx: ActionContext,
): Promise<ActionResultEntry> {
  const opportunityId = resolveOpportunityId(action, ctx.envelope);
  if (!opportunityId) {
    return { action: "change_stage", status: "skipped", detail: "No opportunity to change." };
  }

  try {
    await createApproval(ctx.client, {
      agent: "automation",
      actionType: "change_stage",
      entityType: "opportunity",
      entityId: opportunityId,
      proposedPayload: { opportunityId, to: action.to },
      rationale: `Proposed by automation rule ${ctx.ruleId}.`,
      idempotencyKey: approvalKey(ctx.ruleId, ctx.envelope, "change_stage"),
      ownerId: ctx.ownerId,
    });
    return { action: "change_stage", status: "queued_for_approval", detail: `to ${action.to}` };
  } catch (error) {
    if (error instanceof DuplicateApprovalError) {
      return { action: "change_stage", status: "skipped", detail: "Already proposed." };
    }
    throw error;
  }
}

/**
 * Propose an email draft.
 *
 * Writes the approval directly rather than calling `draftReply`: generating the
 * text costs a provider call, and spending it inside an automation that the
 * operator may then reject inverts M9's "propose cheaply, decide deliberately".
 * The proposal records what to draft; drafting happens when a human asks.
 */
async function proposeEmailDraft(
  action: Extract<RuleAction, { action: "draft_email" }>,
  ctx: ActionContext,
): Promise<ActionResultEntry> {
  const entity = ctx.envelope?.entity as Record<string, Record<string, unknown> | undefined> | undefined;
  const messageId = entity?.message?.id;

  if (typeof messageId !== "string") {
    return { action: "draft_email", status: "skipped", detail: "No message to reply to." };
  }

  try {
    await createApproval(ctx.client, {
      agent: "automation",
      actionType: "draft_email_request",
      entityType: "message",
      entityId: messageId,
      proposedPayload: {
        messageId,
        instruction: action.instruction ?? "Reply appropriately to this message.",
      },
      rationale: `Proposed by automation rule ${ctx.ruleId}.`,
      idempotencyKey: approvalKey(ctx.ruleId, ctx.envelope, "draft_email"),
      ownerId: ctx.ownerId,
    });
    return { action: "draft_email", status: "queued_for_approval" };
  } catch (error) {
    if (error instanceof DuplicateApprovalError) {
      return { action: "draft_email", status: "skipped", detail: "Already proposed." };
    }
    throw error;
  }
}

/**
 * Execute one action.
 *
 * A thrown error is caught by the engine and recorded against this action, so
 * one failing action does not discard the ones that already succeeded.
 */
export async function executeAction(
  action: RuleAction,
  ctx: ActionContext,
): Promise<ActionResultEntry> {
  switch (action.action) {
    case "create_task":
      return runCreateTask(action, ctx);
    case "send_notification":
      return runSendNotification(action, ctx);
    case "add_note":
      return runAddNote(action, ctx);
    case "change_stage":
      return proposeStageChange(action, ctx);
    case "draft_email":
      return proposeEmailDraft(action, ctx);
  }
}
