import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NotificationType, buildDedupeKey, type NotificationInput } from "@/types/notification";
import type { NotificationSource } from "./source";

/**
 * OverdueTaskSource — recently-overdue open tasks. *WHY:* the canonical
 * operational reminder; reads the existing `tasks` table (no task-module change).
 */

const WINDOW_DAYS = 7;
const LIMIT = 50;
const OPEN_STATUSES = ["todo", "in_progress", "blocked"];

export interface OverdueTaskRow {
  id: string;
  title: string | null;
  due_at: string | null;
  opportunity_id: string | null;
}

/** Pure row → NotificationInput mapping (exported for tests). */
export function overdueTaskToInput(task: OverdueTaskRow, ownerId: string): NotificationInput {
  return {
    type: NotificationType.TASK_OVERDUE,
    priority: "high",
    title: `Task overdue: ${task.title ?? "(untitled task)"}`,
    body: null,
    dedupeKey: buildDedupeKey(NotificationType.TASK_OVERDUE, "task", task.id),
    ownerId,
    payload: {
      entityType: "task",
      entityId: task.id,
      opportunityId: task.opportunity_id ?? undefined,
      variables: { dueAt: task.due_at },
    },
  };
}

export class OverdueTaskSource implements NotificationSource {
  readonly name = "overdue_tasks";

  async detect(client: SupabaseClient, ownerId: string): Promise<NotificationInput[]> {
    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await client
      .from("tasks")
      .select("id, title, due_at, opportunity_id")
      .eq("owner_id", ownerId)
      .is("archived_at", null)
      .in("status", OPEN_STATUSES)
      .lt("due_at", now.toISOString())
      .gte("due_at", since)
      .limit(LIMIT);
    return (data ?? []).map((t) => overdueTaskToInput(t as OverdueTaskRow, ownerId));
  }
}
