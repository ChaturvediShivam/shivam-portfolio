import { ComingSoon } from "@/components/admin/ComingSoon";
import { featureEnabled } from "@/lib/featureFlags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listUpcomingCalendarEvents } from "@/lib/calendar-events";
import { getGmailAccount } from "@/lib/integrations";
import { PageHeader } from "@/components/admin/ui";
import { CalendarAgenda } from "@/components/admin/calendar/CalendarAgenda";
import { CalendarToolbar } from "@/components/admin/calendar/CalendarToolbar";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  // Fully inert when the flag is off.
  if (!featureEnabled("FEATURE_CALENDAR")) return <ComingSoon title="Calendar" />;

  const supabase = await createServerSupabaseClient();
  const [events, account] = await Promise.all([
    listUpcomingCalendarEvents(supabase),
    getGmailAccount(supabase),
  ]);
  const connected = account?.status === "connected";

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Calendar"
        description="Synced Google Calendar events and scheduled interviews."
        actions={<CalendarToolbar connected={connected} />}
      />
      <CalendarAgenda events={events} />
    </div>
  );
}
