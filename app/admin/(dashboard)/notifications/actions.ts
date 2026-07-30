"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction, actionSuccess, type ActionResult } from "@/lib/actions";
import {
  markAllNotificationsRead,
  markNotificationRead,
  updatePreferences,
} from "@/lib/notifications";
import { CronNotificationScanTrigger } from "@/lib/notifications/trigger";
import type { NotificationPreferences } from "@/types/notification";

/**
 * Notification Server Actions (Phase 3 · M5). Session + RLS via withAdminAction.
 */

export async function markNotificationReadAction(id: string): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    await markNotificationRead(supabase, id);
    revalidatePath("/admin/notifications");
    return actionSuccess({ id });
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ ok: true }>> {
  return withAdminAction(async ({ supabase }) => {
    await markAllNotificationsRead(supabase);
    revalidatePath("/admin/notifications");
    return actionSuccess({ ok: true });
  });
}

export async function scanNotificationsAction(): Promise<ActionResult<{ enqueued: true }>> {
  return withAdminAction(async ({ supabase }) => {
    await new CronNotificationScanTrigger().requestScan(supabase);
    revalidatePath("/admin/notifications");
    return actionSuccess({ enqueued: true });
  });
}

export async function updateNotificationPreferencesAction(
  prefs: NotificationPreferences,
): Promise<ActionResult<{ ok: true }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    await updatePreferences(supabase, userId, prefs);
    revalidatePath("/admin/settings");
    return actionSuccess({ ok: true });
  });
}
