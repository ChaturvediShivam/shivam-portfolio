import { Sidebar } from "@/components/admin/Sidebar";
import { featureEnabled } from "@/lib/featureFlags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUnreadCount, listRecentNotifications } from "@/lib/notifications";
import { NotificationBell } from "@/components/admin/notifications/NotificationBell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Notification bell: only mounted when the feature is enabled (inert otherwise).
  let bell: React.ReactNode = null;
  if (featureEnabled("FEATURE_NOTIFICATIONS")) {
    const supabase = await createServerSupabaseClient();
    const [unreadCount, recent] = await Promise.all([
      getUnreadCount(supabase),
      listRecentNotifications(supabase, 8),
    ]);
    bell = <NotificationBell unreadCount={unreadCount} recent={recent} />;
  }

  return (
    <div className="min-h-screen flex text-slate-200">
      <Sidebar />

      <main className="flex-1 min-w-0">
        {bell && (
          <div className="flex justify-end border-b border-white/[0.06] px-4 py-2">{bell}</div>
        )}
        {children}
      </main>
    </div>
  );
}
