/**
 * Notification domain types (Phase 3 · M5).
 *
 * Refinements: `type` is an extensible string taxonomy (no DB enum — new types
 * need no migration); `priority` is a small ordered set stored as a smallint for
 * index-backed sorting; `payload` is flexible jsonb context (not over-normalized)
 * ready for future templates/localization/channels.
 */

export type NotificationPriority = "low" | "normal" | "high" | "critical";

const PRIORITY_ORDER: NotificationPriority[] = ["low", "normal", "high", "critical"];

export function priorityToInt(priority: NotificationPriority): number {
  const idx = PRIORITY_ORDER.indexOf(priority);
  return idx === -1 ? 1 : idx; // default NORMAL
}

export function priorityFromInt(value: number): NotificationPriority {
  return PRIORITY_ORDER[value] ?? "normal";
}

/** Known M5 taxonomy strings (extensible — the DB column is free text). */
export const NotificationType = {
  TASK_OVERDUE: "TASK_OVERDUE",
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  INTERVIEW_REMINDER: "INTERVIEW_REMINDER",
  SYSTEM: "SYSTEM",
} as const;

/** Flexible context. Deliberately not over-normalized. */
export interface NotificationPayload {
  entityType?: string;
  entityId?: string;
  opportunityId?: string;
  messageId?: string;
  calendarId?: string;
  actor?: string;
  variables?: Record<string, unknown>;
}

/** The DTO every producer (scan sources now, event bus later) feeds. */
export interface NotificationInput {
  type: string;
  priority: NotificationPriority;
  title: string;
  body?: string | null;
  dedupeKey: string;
  ownerId: string;
  payload: NotificationPayload;
}

/** UI-facing shape (priority decoded to its label). */
export interface NotificationView {
  id: string;
  type: string;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  /** Per-type email opt-out map; a type absent/true means enabled. */
  typePrefs: Record<string, boolean>;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailEnabled: true,
  typePrefs: {},
};

/** Types a preference row may reference. Anything else is dropped on save. */
export const KNOWN_NOTIFICATION_TYPES: string[] = [
  NotificationType.TASK_OVERDUE,
  NotificationType.MESSAGE_RECEIVED,
  NotificationType.INTERVIEW_REMINDER,
  NotificationType.SYSTEM,
];

/**
 * Coerce untrusted client input into storable preferences.
 *
 * `type_prefs` is a jsonb column written straight from a Server Action, so
 * without this an authenticated caller could persist arbitrary keys and an
 * unbounded payload. Only known types survive, and — because the model is
 * opt-OUT — only explicit `false` is stored, which also bounds the object to at
 * most one key per known type.
 */
export function sanitizeNotificationPreferences(input: unknown): NotificationPreferences {
  const source = (input ?? {}) as Partial<NotificationPreferences>;
  const typePrefs: Record<string, boolean> = {};
  const candidate = (source.typePrefs ?? {}) as Record<string, unknown>;

  for (const type of KNOWN_NOTIFICATION_TYPES) {
    if (candidate[type] === false) typePrefs[type] = false;
  }

  return { emailEnabled: source.emailEnabled !== false, typePrefs };
}

/** Stable dedupe key for idempotent creation (owner scoping is via the index). */
export function buildDedupeKey(type: string, entityType: string, entityId: string): string {
  return `${type}:${entityType}:${entityId}`;
}
