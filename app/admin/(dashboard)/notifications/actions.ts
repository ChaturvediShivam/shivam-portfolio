"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction, actionSuccess, actionError, type ActionResult } from "@/lib/actions";
import { featureEnabled } from "@/lib/featureFlags";
import {
  markAllNotificationsRead,
  markNotificationRead,
  updatePreferences,
} from "@/lib/notifications";
import { CronNotificationScanTrigger } from "@/lib/notifications/trigger";
import { sanitizeNotificationPreferences, type NotificationPreferences } from "@/types/notification";

/**
 * Notification Server Actions (Phase 3 · M5). Session + RLS via withAdminAction.
 *
 * Server Actions are POST endpoints addressable by action id, so they remain
 * callable when the feature is off and the UI that invokes them is not rendered
 * (a stale browser tab is the realistic case — exactly during a rollback).
 * Actions with side effects therefore re-check the flag themselves.
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
    if (!featureEnabled("FEATURE_NOTIFICATIONS")) {
      return actionError({ formError: "Notifications are not enabled." });
    }
    await new CronNotificationScanTrigger().requestScan(supabase);
    revalidatePath("/admin/notifications");
    return actionSuccess({ enqueued: true });
  });
}

export async function updateNotificationPreferencesAction(
  prefs: NotificationPreferences,
): Promise<ActionResult<{ ok: true }>> {
  return withAdminAction(async ({ supabase, userId }) => {
    // Client input is never trusted into a jsonb column: unknown keys and
    // unbounded payloads are dropped before persistence.
    await updatePreferences(supabase, userId, sanitizeNotificationPreferences(prefs));
    revalidatePath("/admin/settings");
    return actionSuccess({ ok: true });
  });
}
