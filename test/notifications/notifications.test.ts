import { describe, it, expect } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  KNOWN_NOTIFICATION_TYPES,
  NotificationType,
  buildDedupeKey,
  priorityFromInt,
  priorityToInt,
  sanitizeNotificationPreferences,
  type NotificationView,
} from "@/types/notification";
import { emailAllowed } from "@/lib/notifications";
import { escapeHtml } from "@/lib/notifications/channels/channel";
import { renderNotificationHtml } from "@/lib/notifications/channels/email-channel";
import { overdueTaskToInput } from "@/lib/notifications/sources/overdue-tasks";
import { newMessageToInput } from "@/lib/notifications/sources/new-messages";
import { upcomingInterviewToInput } from "@/lib/notifications/sources/upcoming-interviews";

describe("notification priority", () => {
  it("maps to/from the ordered int, defaulting to NORMAL", () => {
    expect(priorityToInt("low")).toBe(0);
    expect(priorityToInt("normal")).toBe(1);
    expect(priorityToInt("high")).toBe(2);
    expect(priorityToInt("critical")).toBe(3);
    expect(priorityFromInt(3)).toBe("critical");
    expect(priorityFromInt(1)).toBe("normal");
    expect(priorityFromInt(99)).toBe("normal");
    // @ts-expect-error unknown priority falls back to NORMAL
    expect(priorityToInt("bogus")).toBe(1);
  });

  it("orders critical > high > normal > low", () => {
    const order = (["low", "normal", "high", "critical"] as const).map(priorityToInt);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("dedupe key", () => {
  it("is stable and entity-scoped", () => {
    expect(buildDedupeKey("TASK_OVERDUE", "task", "t1")).toBe("TASK_OVERDUE:task:t1");
    expect(buildDedupeKey("TASK_OVERDUE", "task", "t1")).toBe(buildDedupeKey("TASK_OVERDUE", "task", "t1"));
    expect(buildDedupeKey("TASK_OVERDUE", "task", "t2")).not.toBe(buildDedupeKey("TASK_OVERDUE", "task", "t1"));
  });
});

describe("preference gating (opt-out model)", () => {
  it("defaults to enabled and respects master + per-type opt-out", () => {
    expect(emailAllowed(DEFAULT_NOTIFICATION_PREFERENCES, "TASK_OVERDUE")).toBe(true);
    expect(emailAllowed({ emailEnabled: false, typePrefs: {} }, "TASK_OVERDUE")).toBe(false);
    expect(emailAllowed({ emailEnabled: true, typePrefs: { TASK_OVERDUE: false } }, "TASK_OVERDUE")).toBe(false);
    expect(emailAllowed({ emailEnabled: true, typePrefs: { TASK_OVERDUE: false } }, "MESSAGE_RECEIVED")).toBe(true);
  });
});

describe("preference sanitization (untrusted client input)", () => {
  it("keeps a valid opt-out for a known type", () => {
    expect(
      sanitizeNotificationPreferences({ emailEnabled: true, typePrefs: { TASK_OVERDUE: false } }),
    ).toEqual({ emailEnabled: true, typePrefs: { TASK_OVERDUE: false } });
  });

  it("drops unknown types, so the jsonb column cannot be used as free storage", () => {
    const result = sanitizeNotificationPreferences({
      emailEnabled: true,
      typePrefs: { TASK_OVERDUE: false, NOT_A_REAL_TYPE: false, injected: "payload" },
    });
    expect(result.typePrefs).toEqual({ TASK_OVERDUE: false });
  });

  it("bounds the stored object to the known types regardless of input size", () => {
    const hostile: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i += 1) hostile[`key-${i}`] = false;
    const result = sanitizeNotificationPreferences({ emailEnabled: true, typePrefs: hostile });
    expect(Object.keys(result.typePrefs).length).toBeLessThanOrEqual(KNOWN_NOTIFICATION_TYPES.length);
  });

  it("stores only explicit false (opt-out model), never redundant true", () => {
    const result = sanitizeNotificationPreferences({
      emailEnabled: true,
      typePrefs: { TASK_OVERDUE: true, MESSAGE_RECEIVED: false },
    });
    expect(result.typePrefs).toEqual({ MESSAGE_RECEIVED: false });
  });

  it("coerces a non-boolean emailEnabled to the safe default (enabled)", () => {
    expect(sanitizeNotificationPreferences({ emailEnabled: "yes" as never, typePrefs: {} }).emailEnabled).toBe(true);
    expect(sanitizeNotificationPreferences({ emailEnabled: false, typePrefs: {} }).emailEnabled).toBe(false);
  });

  it("survives null/undefined/garbage input", () => {
    expect(sanitizeNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(sanitizeNotificationPreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(sanitizeNotificationPreferences({ typePrefs: "not-an-object" })).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
  });
});

describe("email rendering", () => {
  it("escapes HTML to prevent injection/XSS in the email body", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("renders escaped title + body", () => {
    const n: NotificationView = {
      id: "1",
      type: "SYSTEM",
      priority: "normal",
      title: "New message from <b>Recruiter</b>",
      body: "Re: <offer>",
      payload: {},
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    const html = renderNotificationHtml(n);
    expect(html).toContain("&lt;b&gt;Recruiter&lt;/b&gt;");
    expect(html).toContain("&lt;offer&gt;");
    expect(html).not.toContain("<b>Recruiter</b>");
  });
});

describe("source row → NotificationInput mappers", () => {
  it("overdue task", () => {
    const input = overdueTaskToInput({ id: "t1", title: "Send prep", due_at: "2026-08-01T00:00:00Z", opportunity_id: "o1" }, "owner1");
    expect(input.type).toBe(NotificationType.TASK_OVERDUE);
    expect(input.priority).toBe("high");
    expect(input.dedupeKey).toBe("TASK_OVERDUE:task:t1");
    expect(input.ownerId).toBe("owner1");
    expect(input.payload).toMatchObject({ entityType: "task", entityId: "t1", opportunityId: "o1" });
    expect(input.payload.variables).toEqual({ dueAt: "2026-08-01T00:00:00Z" });
  });

  it("new message", () => {
    const input = newMessageToInput(
      { id: "m1", subject: "Interview", from_address: "rex@corp.com", from_name: "Rex", opportunity_id: null, received_at: null },
      "owner1",
    );
    expect(input.type).toBe(NotificationType.MESSAGE_RECEIVED);
    expect(input.priority).toBe("normal");
    expect(input.title).toBe("New message from Rex");
    expect(input.body).toBe("Interview");
    expect(input.dedupeKey).toBe("MESSAGE_RECEIVED:message:m1");
    expect(input.payload).toMatchObject({ messageId: "m1", actor: "rex@corp.com" });
  });

  it("upcoming interview", () => {
    const input = upcomingInterviewToInput(
      { id: "e1", title: "Panel", starts_at: "2026-08-01T14:00:00Z", calendar_id: "primary", opportunity_id: "o2" },
      "owner1",
    );
    expect(input.type).toBe(NotificationType.INTERVIEW_REMINDER);
    expect(input.priority).toBe("high");
    expect(input.dedupeKey).toBe("INTERVIEW_REMINDER:calendar_event:e1");
    expect(input.payload).toMatchObject({ calendarId: "primary", opportunityId: "o2" });
  });
});
