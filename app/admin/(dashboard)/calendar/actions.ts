"use server";

import { revalidatePath } from "next/cache";
import {
  withAdminAction,
  actionSuccess,
  actionError,
  getAdminActionContext,
  type ActionResult,
} from "@/lib/actions";
import { validate, required, maxLength } from "@/lib/validation";
import { getGoogleOAuthConfig } from "@/lib/integrations/google/oauth";
import { getFreshAccessToken } from "@/lib/integrations/google/tokens";
import { GoogleCalendarProvider } from "@/lib/sync/calendar/google-provider";
import { CronCalendarSyncTrigger } from "@/lib/sync/calendar/trigger";
import { createInterview, getGoogleSyncAccount } from "@/lib/calendar-events";
import { searchActiveOpportunities } from "@/lib/tasks";

/**
 * Calendar Server Actions (Phase 3 · M4). Session + RLS via withAdminAction.
 */

export interface CreateInterviewInput {
  title: string;
  startsAt: string; // datetime-local / ISO
  endsAt: string;
  location?: string;
  attendees?: string; // comma-separated
  opportunityId?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAttendees(value?: string): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => EMAIL_RE.test(s)),
    ),
  );
}

export async function createInterviewAction(
  input: CreateInterviewInput,
): Promise<ActionResult<{ id: string }>> {
  return withAdminAction(async ({ supabase }) => {
    const v = validate(input, {
      title: [required("Title is required"), maxLength(300)],
      startsAt: [required("Start time is required")],
      endsAt: [required("End time is required")],
    });
    if (!v.ok) return actionError({ fieldErrors: v.fieldErrors as Record<string, string> });

    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return actionError({ fieldErrors: { startsAt: "Enter valid start and end times." } });
    }
    if (end <= start) {
      return actionError({ fieldErrors: { endsAt: "End must be after the start time." } });
    }

    const account = await getGoogleSyncAccount(supabase);
    if (!account || account.status !== "connected") {
      return actionError({ formError: "Connect a Google account first." });
    }
    const config = getGoogleOAuthConfig();
    if (!config) return actionError({ formError: "Google is not configured." });

    const accessToken = await getFreshAccessToken(supabase, account, config);
    const provider = new GoogleCalendarProvider(accessToken);

    const id = await createInterview(
      supabase,
      account,
      {
        title: input.title.trim(),
        description: null,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        location: input.location?.trim() || null,
        attendees: parseAttendees(input.attendees),
        opportunityId: input.opportunityId ?? null,
      },
      provider,
    );

    revalidatePath("/admin/calendar");
    return actionSuccess({ id });
  });
}

export async function syncCalendarNowAction(): Promise<ActionResult<{ enqueued: boolean }>> {
  return withAdminAction(async ({ supabase }) => {
    const account = await getGoogleSyncAccount(supabase);
    if (!account || account.status !== "connected") {
      return actionError({ formError: "Connect a Google account first." });
    }
    await new CronCalendarSyncTrigger().requestSync(supabase, account.id);
    revalidatePath("/admin/calendar");
    return actionSuccess({ enqueued: true });
  });
}

export async function searchOpportunitiesAction(
  query: string,
): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const { context } = await getAdminActionContext();
  if (!context) return [];
  return searchActiveOpportunities(context.supabase, query);
}
