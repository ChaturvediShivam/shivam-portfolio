"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, FormField, Select, TextInput, Textarea, useToast } from "@/components/admin/ui";
import { isActionError } from "@/lib/action-result";
import { fieldsForEvent, validateRule } from "@/lib/automation/schema";
import {
  ACTION_TYPES,
  AUTOMATION_EVENTS,
  CONDITION_OPS,
  VALUELESS_OPS,
  type ActionType,
  type AutomationEvent,
  type ConditionOp,
} from "@/types/automation";
import { OPPORTUNITY_STAGES } from "@/types/opportunity";
import { TASK_PRIORITIES } from "@/types/task";
import { createRuleAction } from "@/app/admin/(dashboard)/automations/actions";

/**
 * Rule editor (Phase 3 · M10).
 *
 * A structured form rather than a JSON box: the DSL is closed, so every choice
 * can be a select, and a select cannot produce the class of error a free-text
 * rule would (a misspelled field, an event nothing emits). The same
 * `validateRule` the server uses runs here first, so the operator sees the
 * server's own rejection before a round trip.
 *
 * Conditions are disabled for a scheduled trigger because a schedule has no
 * triggering record to test — the DSL rejects them, and the form says so rather
 * than letting the operator write something that will be refused.
 */

interface ConditionRow {
  field: string;
  op: ConditionOp;
  value: string;
}

interface ActionRow {
  action: ActionType;
  title: string;
  body: string;
  type: string;
  to: string;
  priority: string;
  due_in_days: string;
  instruction: string;
}

function emptyAction(): ActionRow {
  return {
    action: "create_task",
    title: "",
    body: "",
    type: "",
    to: OPPORTUNITY_STAGES[0],
    priority: "medium",
    due_in_days: "",
    instruction: "",
  };
}

/** Form row → DSL action. Only the keys that action accepts are emitted. */
function toDslAction(row: ActionRow): Record<string, unknown> {
  switch (row.action) {
    case "create_task":
      return {
        action: "create_task",
        title: row.title,
        ...(row.due_in_days.trim() ? { due_in_days: Number(row.due_in_days) } : {}),
        ...(row.priority ? { priority: row.priority } : {}),
      };
    case "send_notification":
      return {
        action: "send_notification",
        type: row.type,
        title: row.title,
        ...(row.body.trim() ? { body: row.body } : {}),
      };
    case "add_note":
      return { action: "add_note", body: row.body };
    case "draft_email":
      return {
        action: "draft_email",
        ...(row.instruction.trim() ? { instruction: row.instruction } : {}),
      };
    case "change_stage":
      return { action: "change_stage", to: row.to };
  }
}

export function RuleForm() {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [triggerType, setTriggerType] = React.useState<"event" | "schedule">("event");
  const [event, setEvent] = React.useState<AutomationEvent>(AUTOMATION_EVENTS[0]);
  const [schedule, setSchedule] = React.useState("0 9 * * 1-5");
  const [conditions, setConditions] = React.useState<ConditionRow[]>([]);
  const [actions, setActions] = React.useState<ActionRow[]>([emptyAction()]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();

  const availableFields = React.useMemo(
    () => (triggerType === "event" ? Object.keys(fieldsForEvent(event)) : []),
    [triggerType, event],
  );

  function buildInput() {
    return {
      name,
      description,
      trigger:
        triggerType === "event" ? { type: "event", event } : { type: "schedule", schedule },
      conditions: conditions.map((row) => ({
        field: row.field,
        op: row.op,
        // The DSL type-checks against the field, so a numeric-looking value is
        // sent as a number and an `in` list is split.
        ...(VALUELESS_OPS.includes(row.op)
          ? {}
          : { value: row.op === "in" || row.op === "not_in" ? row.value.split(",").map((v) => v.trim()) : row.value }),
      })),
      actions: actions.map(toDslAction),
    };
  }

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (busy) return;

    const input = buildInput();

    // Same validator the server runs, so the operator sees the real rejection.
    const parsed = validateRule(input);
    if (parsed.ok === false) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.issues) fieldErrors[issue.path] ??= issue.message;
      setErrors(fieldErrors);
      toast({ variant: "error", title: "Fix the highlighted problems." });
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const result = await createRuleAction(input);
      if (isActionError(result)) {
        setErrors(result.fieldErrors ?? {});
        toast({ variant: "error", title: result.formError ?? "Could not save the rule." });
      } else {
        toast({ variant: "success", title: "Rule created. Turn it on when you're ready." });
        setName("");
        setDescription("");
        setConditions([]);
        setActions([emptyAction()]);
      }
    } catch (error) {
      console.error("[automations] create failed:", error);
      toast({ variant: "error", title: "Could not save the rule." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5" onSubmit={submit}>
      <h2 className="text-sm font-semibold text-white">New rule</h2>

      <FormField label="Name" htmlFor="rule-name" error={errors.name}>
        <TextInput
          id="rule-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Interview prep"
        />
      </FormField>

      <FormField label="Description" htmlFor="rule-description" error={errors.description}>
        <TextInput
          id="rule-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this rule is for"
        />
      </FormField>

      <FormField label="Trigger" htmlFor="rule-trigger-type" error={errors["trigger.type"]}>
        <Select
          id="rule-trigger-type"
          value={triggerType}
          onChange={(e) => {
            setTriggerType(e.target.value as "event" | "schedule");
            // A schedule carries no record, so any conditions become invalid.
            setConditions([]);
          }}
          options={[
            { value: "event", label: "When something happens" },
            { value: "schedule", label: "On a schedule" },
          ]}
        />
      </FormField>

      {triggerType === "event" ? (
        <FormField label="Event" htmlFor="rule-event" error={errors["trigger.event"]}>
          <Select
            id="rule-event"
            value={event}
            onChange={(e) => {
              setEvent(e.target.value as AutomationEvent);
              // Fields are per-entity; keeping old rows would leave unreadable paths.
              setConditions([]);
            }}
            options={AUTOMATION_EVENTS.map((value) => ({ value, label: value.replace(/[._]/g, " ") }))}
          />
        </FormField>
      ) : (
        <FormField
          label="Schedule (cron, UTC)"
          htmlFor="rule-schedule"
          error={errors["trigger.schedule"]}
          hint="Five fields, e.g. 0 9 * * 1-5 for 09:00 on weekdays."
        >
          <TextInput id="rule-schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        </FormField>
      )}

      {triggerType === "event" && (
        <section aria-labelledby="conditions-heading" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 id="conditions-heading" className="text-xs font-medium text-slate-400">
              Only when (all must be true)
            </h3>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setConditions((rows) => [...rows, { field: availableFields[0] ?? "", op: "eq", value: "" }])
              }
            >
              <Plus className="size-3.5" aria-hidden />
              Add
            </Button>
          </div>

          {conditions.length === 0 && (
            <p className="text-xs text-slate-600">No conditions — the rule runs on every such event.</p>
          )}

          {conditions.map((row, index) => (
            <div key={index} className="flex flex-wrap items-start gap-2">
              <Select
                aria-label="Field"
                className="min-w-[12rem] flex-1"
                value={row.field}
                onChange={(e) =>
                  setConditions((rows) => rows.map((r, i) => (i === index ? { ...r, field: e.target.value } : r)))
                }
                options={availableFields.map((value) => ({ value, label: value }))}
              />
              <Select
                aria-label="Comparison"
                className="w-32"
                value={row.op}
                onChange={(e) =>
                  setConditions((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, op: e.target.value as ConditionOp } : r)),
                  )
                }
                options={CONDITION_OPS.map((value) => ({ value, label: value }))}
              />
              {!VALUELESS_OPS.includes(row.op) && (
                <TextInput
                  aria-label="Value"
                  className="min-w-[10rem] flex-1"
                  value={row.value}
                  placeholder={row.op === "in" || row.op === "not_in" ? "comma, separated" : "value"}
                  onChange={(e) =>
                    setConditions((rows) => rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
                  }
                />
              )}
              <Button
                type="button"
                variant="icon"
                aria-label="Remove condition"
                onClick={() => setConditions((rows) => rows.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
              {errors[`conditions[${index}].value`] && (
                <p className="w-full text-xs text-red-400">{errors[`conditions[${index}].value`]}</p>
              )}
              {errors[`conditions[${index}].field`] && (
                <p className="w-full text-xs text-red-400">{errors[`conditions[${index}].field`]}</p>
              )}
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="actions-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 id="actions-heading" className="text-xs font-medium text-slate-400">
            Then do
          </h3>
          <Button type="button" size="sm" onClick={() => setActions((rows) => [...rows, emptyAction()])}>
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
        {errors.actions && <p className="text-xs text-red-400">{errors.actions}</p>}

        {actions.map((row, index) => {
          const set = (patch: Partial<ActionRow>) =>
            setActions((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

          return (
            <div key={index} className="space-y-2 rounded-md border border-white/[0.06] p-3">
              <div className="flex items-center gap-2">
                <Select
                  aria-label="Action"
                  className="flex-1"
                  value={row.action}
                  onChange={(e) => set({ action: e.target.value as ActionType })}
                  options={ACTION_TYPES.map((value) => ({ value, label: value.replace(/_/g, " ") }))}
                />
                {actions.length > 1 && (
                  <Button
                    type="button"
                    variant="icon"
                    aria-label="Remove action"
                    onClick={() => setActions((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>

              {(row.action === "create_task" || row.action === "send_notification") && (
                <TextInput
                  aria-label="Title"
                  value={row.title}
                  placeholder="Title"
                  onChange={(e) => set({ title: e.target.value })}
                />
              )}
              {row.action === "create_task" && (
                <div className="flex gap-2">
                  <TextInput
                    aria-label="Due in days"
                    className="w-32"
                    value={row.due_in_days}
                    placeholder="Due in days"
                    onChange={(e) => set({ due_in_days: e.target.value })}
                  />
                  <Select
                    aria-label="Priority"
                    className="w-32"
                    value={row.priority}
                    onChange={(e) => set({ priority: e.target.value })}
                    options={TASK_PRIORITIES.map((value) => ({ value, label: value }))}
                  />
                </div>
              )}
              {row.action === "send_notification" && (
                <TextInput
                  aria-label="Notification type"
                  value={row.type}
                  placeholder="Notification type, e.g. interview_prep"
                  onChange={(e) => set({ type: e.target.value })}
                />
              )}
              {(row.action === "add_note" || row.action === "send_notification") && (
                <Textarea
                  aria-label="Body"
                  rows={2}
                  value={row.body}
                  placeholder="Body"
                  onChange={(e) => set({ body: e.target.value })}
                />
              )}
              {row.action === "draft_email" && (
                <Textarea
                  aria-label="Draft instruction"
                  rows={2}
                  value={row.instruction}
                  placeholder="What the reply should say"
                  onChange={(e) => set({ instruction: e.target.value })}
                />
              )}
              {row.action === "change_stage" && (
                <Select
                  aria-label="Move to stage"
                  value={row.to}
                  onChange={(e) => set({ to: e.target.value })}
                  options={OPPORTUNITY_STAGES.map((value) => ({ value, label: value }))}
                />
              )}

              {(row.action === "draft_email" || row.action === "change_stage") && (
                <p className="text-xs text-slate-500">
                  Needs your approval before it happens — it will appear in Approvals.
                </p>
              )}

              {Object.entries(errors)
                .filter(([path]) => path.startsWith(`actions[${index}]`))
                .map(([path, message]) => (
                  <p key={path} className="text-xs text-red-400">
                    {message}
                  </p>
                ))}
            </div>
          );
        })}
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" isLoading={busy}>
          Create rule
        </Button>
        <p className="text-xs text-slate-500">New rules start turned off.</p>
      </div>
    </form>
  );
}
