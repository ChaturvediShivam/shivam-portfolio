"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { isActionError } from "@/lib/action-result";
import { NotificationType, type NotificationPreferences } from "@/types/notification";
import { updateNotificationPreferencesAction } from "@/app/admin/(dashboard)/notifications/actions";

/**
 * Persisted notification preferences (Phase 3 · M5). Email master toggle + per-
 * type email opt-out. Saves via the Server Action (opt-out model: absent = on).
 */

const TYPE_ROWS: { type: string; label: string; description: string }[] = [
  { type: NotificationType.TASK_OVERDUE, label: "Task reminders", description: "Overdue tasks" },
  { type: NotificationType.MESSAGE_RECEIVED, label: "Message notifications", description: "New inbound mail" },
  { type: NotificationType.INTERVIEW_REMINDER, label: "Interview reminders", description: "Upcoming calendar events" },
];

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-emerald-500/70" : "bg-white/10",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className={cn("inline-block size-4 rounded-full bg-slate-100 transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}

export function NotificationPreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const [emailEnabled, setEmailEnabled] = React.useState(initial.emailEnabled);
  const [typePrefs, setTypePrefs] = React.useState<Record<string, boolean>>(initial.typePrefs);
  const [pending, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState<string | null>(null);

  function typeEnabled(type: string): boolean {
    return typePrefs[type] !== false;
  }

  function save(next: { emailEnabled: boolean; typePrefs: Record<string, boolean> }) {
    setStatus(null);
    startTransition(async () => {
      const result = await updateNotificationPreferencesAction(next);
      setStatus(isActionError(result) ? "Could not save preferences." : "Saved");
    });
  }

  function setEmail(v: boolean) {
    setEmailEnabled(v);
    save({ emailEnabled: v, typePrefs });
  }

  function setType(type: string, v: boolean) {
    const next = { ...typePrefs, [type]: v };
    setTypePrefs(next);
    save({ emailEnabled, typePrefs: next });
  }

  return (
    <div className="divide-y divide-white/[0.06]">
      <div className="flex items-center justify-between py-2.5">
        <div className="min-w-0">
          <p className="text-sm text-slate-300">Email notifications</p>
          <p className="text-xs text-slate-500">Send notifications to your account email</p>
        </div>
        <Toggle checked={emailEnabled} onChange={setEmail} label="Email notifications" />
      </div>

      {TYPE_ROWS.map((row) => (
        <div key={row.type} className="flex items-center justify-between py-2.5">
          <div className="min-w-0">
            <p className="text-sm text-slate-300">{row.label}</p>
            <p className="text-xs text-slate-500">{row.description}</p>
          </div>
          <Toggle
            checked={typeEnabled(row.type)}
            disabled={!emailEnabled}
            onChange={(v) => setType(row.type, v)}
            label={row.label}
          />
        </div>
      ))}

      {status && <p className="pt-2 text-xs text-slate-500">{pending ? "Saving…" : status}</p>}
    </div>
  );
}
