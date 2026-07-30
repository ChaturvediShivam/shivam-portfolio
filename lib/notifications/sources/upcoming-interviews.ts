import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NotificationType, buildDedupeKey, type NotificationInput } from "@/types/notification";
import type { NotificationSource } from "./source";

/**
 * UpcomingInterviewSource — calendar events starting soon. *WHY:* reminds the
 * operator of imminent interviews; reads the already-synced `calendar_events`
 * (M4) — no Calendar API call, no sync duplication.
 */

const WINDOW_HOURS_AHEAD = 24;
const LIMIT = 50;

export interface UpcomingEventRow {
  id: string;
  title: string | null;
  starts_at: string | null;
  calendar_id: string | null;
  opportunity_id: string | null;
}

/** Pure row → NotificationInput mapping (exported for tests). */
export function upcomingInterviewToInput(event: UpcomingEventRow, ownerId: string): NotificationInput {
  return {
    type: NotificationType.INTERVIEW_REMINDER,
    priority: "high",
    title: `Upcoming: ${event.title ?? "calendar event"}`,
    body: null,
    dedupeKey: buildDedupeKey(NotificationType.INTERVIEW_REMINDER, "calendar_event", event.id),
    ownerId,
    payload: {
      entityType: "calendar_event",
      entityId: event.id,
      calendarId: event.calendar_id ?? undefined,
      opportunityId: event.opportunity_id ?? undefined,
      variables: { startsAt: event.starts_at },
    },
  };
}

export class UpcomingInterviewSource implements NotificationSource {
  readonly name = "upcoming_interviews";

  async detect(client: SupabaseClient, ownerId: string): Promise<NotificationInput[]> {
    const now = new Date();
    const until = new Date(now.getTime() + WINDOW_HOURS_AHEAD * 60 * 60 * 1000).toISOString();
    const { data } = await client
      .from("calendar_events")
      .select("id, title, starts_at, calendar_id, opportunity_id")
      .eq("owner_id", ownerId)
      .is("archived_at", null)
      .gte("starts_at", now.toISOString())
      .lte("starts_at", until)
      .limit(LIMIT);
    return (data ?? []).map((e) => upcomingInterviewToInput(e as UpcomingEventRow, ownerId));
  }
}
