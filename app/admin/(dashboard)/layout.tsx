import { Sidebar } from "@/components/admin/Sidebar";
import { adminNavigation } from "@/lib/admin/navigation";
import { featureEnabled, type FeatureFlag } from "@/lib/featureFlags";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUnreadCount, listRecentNotifications } from "@/lib/notifications";
import { NotificationBell } from "@/components/admin/notifications/NotificationBell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Notification bell: only mounted when the feature is enabled (inert otherwise).
  //
  // This layout wraps every admin page and there is no error boundary above it,
  // so an unhandled throw here would take down the whole admin area rather than
  // just the bell. The reads therefore degrade to "no bell" — the same
  // null-on-failure contract getJobsHealth uses for the M1 queue panel. The
  // realistic trigger is the flag being enabled before the M5 migration is
  // applied.
  let bell: React.ReactNode = null;
  if (featureEnabled("FEATURE_NOTIFICATIONS")) {
    try {
      const supabase = await createServerSupabaseClient();
      const [unreadCount, recent] = await Promise.all([
        getUnreadCount(supabase),
        listRecentNotifications(supabase, 8),
      ]);
      bell = <NotificationBell unreadCount={unreadCount} recent={recent} />;
    } catch (err) {
      console.error("[admin layout] notification bell unavailable:", err);
    }
  }

  // Flag-gated nav items are resolved here because `featureEnabled` is
  // server-only; the sidebar is a Client Component and receives ids, not flags.
  const hiddenIds = adminNavigation
    .filter((item) => item.flag && !featureEnabled(item.flag as FeatureFlag))
    .map((item) => item.id);

  return (
    <div className="min-h-screen flex text-slate-200">
      <Sidebar hiddenIds={hiddenIds} />

      <main className="flex-1 min-w-0">
        {bell && (
          <div className="flex justify-end border-b border-white/[0.06] px-4 py-2">{bell}</div>
        )}
        {children}
      </main>
    </div>
  );
}
