import "server-only";
import type { NotificationSource } from "./source";
import { OverdueTaskSource } from "./overdue-tasks";
import { NewMessageSource } from "./new-messages";
import { UpcomingInterviewSource } from "./upcoming-interviews";

/**
 * Notification source registry (Phase 3 · M5). The scan runs each source per
 * owner. Add a source here — the scan loop is untouched.
 */
export function getNotificationSources(): NotificationSource[] {
  return [new OverdueTaskSource(), new NewMessageSource(), new UpcomingInterviewSource()];
}

export type { NotificationSource } from "./source";
