import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSettingsData, APP_VERSION, BUILD_TIME } from "@/lib/settings";
import { PageHeader, Badge } from "@/components/admin/ui";
import { SettingRow, SettingToggle, IntegrationCard } from "@/components/admin/settings/SettingsControls";

export const metadata = { title: "Settings" };

function formatDateTime(v: string | null) {
  return v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-3">
        <h2 id={id} className="text-sm font-semibold text-white">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const soon = <Badge variant="neutral">Coming soon</Badge>;

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { profile, gmailConnected } = await getSettingsData(supabase);

  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  const region = process.env.VERCEL_REGION ?? "—";
  const deployment = process.env.VERCEL_URL ?? "local";

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader title="Settings" description="Configure the CRM." />

      {/* General */}
      <Section id="general-heading" title="General" description="Workspace defaults. Editing arrives in a later phase.">
        <dl className="divide-y divide-white/[0.06]">
          <SettingRow label="Application name" value="Career CRM" />
          <SettingRow label="Timezone" value={<>Automatic {soon}</>} hint="Uses your browser locale for now." />
          <SettingRow label="Date format" value={<>Locale default {soon}</>} />
        </dl>
      </Section>

      {/* Profile */}
      <Section id="profile-heading" title="Profile" description="Your account. Managed via authentication.">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold text-slate-200" aria-hidden>
            {profile.initials}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">{profile.name ?? profile.email ?? "Admin"}</p>
            <p className="text-xs text-slate-500">{profile.email ?? "—"}</p>
          </div>
        </div>
        <dl className="divide-y divide-white/[0.06]">
          <SettingRow label="Display name" value={profile.name ? profile.name : <span className="text-slate-500">Not set</span>} />
          <SettingRow label="Email" value={profile.email ?? "—"} hint="Read-only — managed by your login." />
          <SettingRow label="Email verified" value={profile.emailConfirmed ? <Badge variant="success">Verified</Badge> : <Badge variant="neutral">Unverified</Badge>} />
        </dl>
      </Section>

      {/* Preferences */}
      <Section id="preferences-heading" title="Preferences" description="Personal defaults. Not configurable yet.">
        <dl className="divide-y divide-white/[0.06]">
          <SettingRow label="Theme" value={<>Dark {soon}</>} />
          <SettingRow label="Default landing page" value={<>Inquiries (/admin) {soon}</>} hint="Dashboard lives at /admin/dashboard." />
          <SettingRow label="Items per page" value={<>25 {soon}</>} />
          <SettingRow label="Default list/board view" value={<>Table {soon}</>} />
        </dl>
      </Section>

      {/* Notifications */}
      <Section id="notifications-heading" title="Notifications" description="Delivery preferences. Coming in a later phase.">
        <div className="divide-y divide-white/[0.06]">
          <SettingToggle label="Email notifications" description="Account and activity emails" />
          <SettingToggle label="Task reminders" description="Reminders for due and overdue tasks" />
          <SettingToggle label="Opportunity reminders" description="Nudges for next actions" />
          <SettingToggle label="Message notifications" description="Alerts for new inbound messages" />
        </div>
      </Section>

      {/* Security */}
      <Section id="security-heading" title="Security" description="Session and account security.">
        <dl className="divide-y divide-white/[0.06]">
          <SettingRow label="Current session" value={<Badge variant="success" dot>Active</Badge>} />
          <SettingRow label="Last login" value={formatDateTime(profile.lastSignInAt)} />
          <SettingRow label="Account created" value={formatDateTime(profile.createdAt)} />
          <SettingRow
            label="Password"
            value={
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Coming soon"
                className="cursor-not-allowed rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-500"
              >
                Change password
              </button>
            }
            hint="Password management arrives in a later phase."
          />
        </dl>
      </Section>

      {/* Integrations */}
      <Section id="integrations-heading" title="Integrations" description="Connect inboxes and calendars. OAuth arrives in Phase 3.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <IntegrationCard
            name="Gmail"
            description="Sync email into the CRM."
            status={gmailConnected ? "connected" : "not_connected"}
            detail={gmailConnected ? "Inbox connected." : "Sync your inbox once OAuth is available."}
          />
          <IntegrationCard name="Google Calendar" description="Sync interviews and events." status="coming_soon" />
          <IntegrationCard name="More providers" description="LinkedIn, Greenhouse, Lever, Ashby, and more." status="coming_soon" />
        </div>
      </Section>

      {/* System information */}
      <Section id="system-heading" title="System information">
        <dl className="divide-y divide-white/[0.06]">
          <SettingRow label="Environment" value={environment} />
          <SettingRow label="App version" value={APP_VERSION} />
          <SettingRow label="Commit" value={commit} />
          <SettingRow label="Region" value={region} />
          <SettingRow label="Deployment" value={deployment} />
          <SettingRow label="Build time" value={formatDateTime(BUILD_TIME)} hint="Server build / deploy time." />
        </dl>
      </Section>
    </div>
  );
}
