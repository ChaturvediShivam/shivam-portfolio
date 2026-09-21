import { Badge, DataTable, EmptyState, type Column } from "@/components/admin/ui";
import { LaunchSettingsForm } from "@/components/admin/vbyb/LaunchSettingsForm";
import { Section } from "@/components/admin/vbyb/Section";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { formatDateTime } from "@/lib/vbyb/format";
import { getIntegrationStatus, getLaunch, listDeliveries } from "@/lib/vbyb/launch";
import { humanize, type VbybWebhookDelivery } from "@/types/vbyb";

export const metadata = { title: "Settings · Validate Before You Build" };
export const dynamic = "force-dynamic";

function Present({ ok }: { ok: boolean }) {
  return <Badge variant={ok ? "success" : "danger"}>{ok ? "Set" : "Missing"}</Badge>;
}

export default async function VbybSettingsPage() {
  const { db } = await requireVbybAdminPage();
  const [launch, deliveries] = await Promise.all([getLaunch(db), listDeliveries(db)]);
  const status = getIntegrationStatus();

  const deliveryColumns: Column<VbybWebhookDelivery>[] = [
    { key: "provider", header: "Provider", render: (d) => humanize(d.provider) },
    { key: "event", header: "Event", render: (d) => d.event_type ?? "—" },
    {
      key: "reference",
      header: "Reference",
      render: (d) =>
        d.external_id ? (
          <code className="text-xs text-slate-300">{d.external_id}</code>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (d) => (
        <Badge variant={d.status === "processed" ? "success" : d.status === "failed" ? "danger" : "neutral"}>{humanize(d.status)}</Badge>
      ),
    },
    { key: "attempts", header: "Attempts", align: "right", render: (d) => d.attempts },
    { key: "error", header: "Detail", render: (d) => <span className="text-xs text-slate-400">{d.error ?? "—"}</span> },
    { key: "received", header: "Last received", render: (d) => formatDateTime(d.last_received_at) },
  ];

  return (
    <div className="space-y-6">
      <Section title="Launch and experiment">
        {launch ? (
          <LaunchSettingsForm launch={launch} />
        ) : (
          <EmptyState title="Founding launch not found" description="Apply the Validate Before You Build migration first." />
        )}
      </Section>

      <Section
        title="Integrations"
        description="Shows only whether each setting is present — values are never sent to the browser."
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Feature flags</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2">
                <code className="text-xs text-slate-300">FEATURE_VBYB</code>
                <Badge variant={status.moduleEnabled ? "success" : "neutral"}>{status.moduleEnabled ? "On" : "Off"}</Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <code className="text-xs text-slate-300">FEATURE_VBYB_WEBHOOKS</code>
                <Badge variant={status.webhooksEnabled ? "success" : "neutral"}>{status.webhooksEnabled ? "On" : "Off"}</Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <code className="text-xs text-slate-300">SUPABASE_SERVICE_ROLE_KEY</code>
                <Present ok={status.serviceRoleConfigured} />
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gumroad</p>
            <ul className="space-y-2 text-sm">
              {Object.entries(status.gumroad).map(([name, ok]) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <code className="text-xs text-slate-300">{name}</code>
                  <Present ok={ok} />
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">Ping URL (put the secret in place of the placeholder):</p>
            <p className="break-all rounded-md bg-black/30 px-3 py-2 font-mono text-xs text-slate-300">
              {status.endpoints.gumroad.replace("https://", "https://gumroad:<GUMROAD_WEBHOOK_SECRET>@")}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tally</p>
            <ul className="space-y-2 text-sm">
              {Object.entries(status.tally).map(([name, ok]) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <code className="text-xs text-slate-300">{name}</code>
                  <Present ok={ok} />
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">Webhook URL (enable the signing secret in Tally):</p>
            <p className="break-all rounded-md bg-black/30 px-3 py-2 font-mono text-xs text-slate-300">{status.endpoints.tally}</p>
          </div>
        </div>
      </Section>

      <Section
        title="Recent webhook deliveries"
        description="Only deliveries that passed authentication are stored. A request with a wrong secret or an invalid signature is rejected with 401 and logged server-side, so it never appears here."
      >
        <DataTable
          columns={deliveryColumns}
          rows={deliveries}
          getRowKey={(d) => d.id}
          emptyState={<EmptyState title="No deliveries yet" description="Send a test ping from Gumroad or a test submission from Tally." />}
        />
        <dl className="mt-5 space-y-2 border-t border-white/[0.06] pt-4 text-xs text-slate-500">
          <div>
            <dt className="inline font-medium text-slate-400">Reference — </dt>
            <dd className="inline">
              the identifier the provider sent: Tally&apos;s <code>data.formId</code>, or the Gumroad sale id. When a delivery is
              ignored, compare it with <code>TALLY_FORM_ID</code> or the sale&apos;s product against <code>GUMROAD_PRODUCT_ID</code>.
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-400">Received — </dt>
            <dd className="inline">authenticated and recorded, but processing has not finished.</dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-400">Processed — </dt>
            <dd className="inline">accepted and written to the database.</dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-400">Ignored — </dt>
            <dd className="inline">
              deliberately skipped, with the reason under Detail (a different form, a different product, or an unhandled event type).
              Nothing was written.
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-400">Failed — </dt>
            <dd className="inline">
              processing error; the provider retries. Repeat deliveries increment Attempts instead of creating duplicate records.
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}
