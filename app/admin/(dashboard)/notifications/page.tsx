import { ComingSoon } from "@/components/admin/ComingSoon";
import { featureEnabled } from "@/lib/featureFlags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listNotifications } from "@/lib/notifications";
import { PageHeader } from "@/components/admin/ui";
import { NotificationList } from "@/components/admin/notifications/NotificationList";
import { NotificationsToolbar } from "@/components/admin/notifications/NotificationsToolbar";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  if (!featureEnabled("FEATURE_NOTIFICATIONS")) return <ComingSoon title="Notifications" />;

  const supabase = await createServerSupabaseClient();
  const notifications = await listNotifications(supabase);
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Notifications"
        description="Task reminders, new mail, and upcoming interviews."
        actions={<NotificationsToolbar hasUnread={hasUnread} />}
      />
      <NotificationList notifications={notifications} />
    </div>
  );
}
