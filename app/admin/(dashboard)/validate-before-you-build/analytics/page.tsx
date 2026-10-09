import Link from "next/link";
import { EmptyState, buttonClasses } from "@/components/admin/ui";
import { MetricTile, MetricValueTile } from "@/components/admin/vbyb/MetricTile";
import { Section } from "@/components/admin/vbyb/Section";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { formatMoney, thresholdStatus } from "@/lib/vbyb/format";
import { getLaunch } from "@/lib/vbyb/launch";
import {
  NOT_TRACKED,
  averageDeliveryMetric,
  getLaunchMetrics,
  medianDeliveryMetric,
  rateMetric,
} from "@/lib/vbyb/metrics";
import { DECISIONS, DECISION_LABELS } from "@/types/vbyb";

export const metadata = { title: "Analytics · Validate Before You Build" };
export const dynamic = "force-dynamic";

export default async function VbybAnalyticsPage() {
  const { db } = await requireVbybAdminPage();
  const [metrics, launch] = await Promise.all([getLaunchMetrics(db), getLaunch(db)]);

  if (!metrics || !launch) {
    return <EmptyState title="Founding launch not found" description="Apply the Validate Before You Build migration first." />;
  }

  const currency = metrics.currency;
  const strangers = metrics.relationships.stranger;

  return (
    <div className="space-y-6">
      <Section
        title="Launch experiment"
        description={`${launch.name}. Launch experiment thresholds are internal targets you set — not industry benchmarks. Visitor and conversation counts are not tracked by this site.`}
        actions={
          <Link href={`${VBYB_BASE_PATH}/settings`} className={buttonClasses("secondary", "sm")}>
            Edit experiment
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricTile label="Price" value={formatMoney(launch.price_cents, launch.currency)} />
          <MetricTile label="Capacity" value={`${launch.capacity} customers`} />
          <MetricTile
            label={launch.primary_metric || "Primary metric"}
            value={String(strangers)}
            detail={
              metrics.relationships.unknown > 0
                ? `${metrics.relationships.unknown} customer${metrics.relationships.unknown === 1 ? "" : "s"} not yet classified`
                : "Paid or refunded orders from strangers"
            }
          />
          <MetricTile
            label="Launch experiment thresholds"
            value={launch.criteria_min_preorders == null && launch.criteria_strong_preorders == null ? "Not set" : `${launch.criteria_min_preorders ?? "—"} / ${launch.criteria_strong_preorders ?? "—"}`}
            tone={launch.criteria_min_preorders == null && launch.criteria_strong_preorders == null ? "muted" : "default"}
            detail={
              launch.criteria_min_preorders == null && launch.criteria_strong_preorders == null
                ? "Add minimum / strong thresholds in Settings"
                : `Minimum ${thresholdStatus(launch.criteria_min_preorders, strangers)} · strong ${thresholdStatus(launch.criteria_strong_preorders, strangers)}`
            }
          />
        </div>
      </Section>

      <Section title="Sales" description="Test orders are excluded from every figure.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricTile label="Total pre-orders" value={String(metrics.totalOrders)} detail="Paid, including later refunds" />
          <MetricTile label="Currently paid" value={String(metrics.paidOrders)} />
          <MetricTile label="From strangers" value={String(strangers)} detail={`Known: ${metrics.relationships.known} · Unclassified: ${metrics.relationships.unknown}`} />
          <MetricTile label="Test orders (excluded)" value={String(metrics.testOrders)} tone="muted" />
          <MetricTile label="Total revenue" value={formatMoney(metrics.grossRevenueCents, currency)} />
          <MetricTile
            label="Refunds"
            value={String(metrics.refundedOrders)}
            detail={`${formatMoney(metrics.refundedCents, currency)} refunded`}
          />
          <MetricTile label="Net revenue" value={formatMoney(metrics.netRevenueCents, currency)} />
          <MetricValueTile label="Refund rate" metric={rateMetric(metrics.refundedOrders, metrics.totalOrders)} />
        </div>
      </Section>

      <Section title="Funnel" description="This site does not collect visitor or checkout data, so no conversion figures are shown.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricValueTile label="Landing page visitors" metric={NOT_TRACKED} />
          <MetricValueTile label="Checkout starts" metric={NOT_TRACKED} />
          <MetricValueTile label="Visitor → purchase conversion" metric={NOT_TRACKED} />
        </div>
      </Section>

      <Section title="Delivery">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricValueTile label="Submission rate" metric={rateMetric(metrics.submissionsReceived, metrics.totalOrders)} />
          <MetricValueTile label="Delivery rate" metric={rateMetric(metrics.delivered, metrics.submissionsReceived)} />
          <MetricValueTile label="Average delivery time" metric={averageDeliveryMetric(metrics)} />
          <MetricValueTile label="Median delivery time" metric={medianDeliveryMetric(metrics)} />
          <MetricTile label="Overdue now" value={String(metrics.overdue)} tone={metrics.overdue > 0 ? "alert" : "default"} />
        </div>
      </Section>

      <Section title="Decisions">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {DECISIONS.map((d) => (
            <MetricTile key={d} label={DECISION_LABELS[d]} value={String(metrics.decisions[d])} />
          ))}
        </div>
      </Section>
    </div>
  );
}
