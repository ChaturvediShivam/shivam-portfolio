import Link from "next/link";
import { Badge, EmptyState } from "@/components/admin/ui";
import { ActivityFeed } from "@/components/admin/vbyb/ActivityFeed";
import { MetricTile, MetricValueTile } from "@/components/admin/vbyb/MetricTile";
import { Section } from "@/components/admin/vbyb/Section";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { listEvents } from "@/lib/vbyb/events";
import { formatMoney } from "@/lib/vbyb/format";
import { getLaunch } from "@/lib/vbyb/launch";
import { averageDeliveryMetric, getLaunchMetrics } from "@/lib/vbyb/metrics";
import { listValidations } from "@/lib/vbyb/validations";
import { dueAt, isOverdue } from "@/lib/vbyb/workflow";
import { DECISIONS, DECISION_LABELS } from "@/types/vbyb";

export const dynamic = "force-dynamic";

export default async function ValidateBeforeYouBuildOverviewPage() {
  const { db } = await requireVbybAdminPage();

  const [metrics, launch, events, validations] = await Promise.all([
    getLaunchMetrics(db),
    getLaunch(db),
    listEvents(db, { limit: 15 }),
    listValidations(db),
  ]);

  if (!metrics || !launch) {
    return (
      <EmptyState
        title="Founding launch not found"
        description="The founding-v1 launch row is missing. Apply supabase/migrations/20260914090000_validate_before_you_build.sql, which seeds it."
      />
    );
  }

  const currency = metrics.currency;
  const now = new Date();
  const overdue = validations.filter((v) => isOverdue(v, now));

  return (
    <div className="space-y-6">
      <Section
        title="Founding launch"
        description={`${formatMoney(launch.price_cents, launch.currency)} · ${launch.capacity} founding slots · every number below is computed from the database.`}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <MetricTile
            label="Paid pre-orders"
            value={`${metrics.paidOrders} / ${metrics.capacity}`}
            detail={metrics.overCapacityOrders > 0 ? `${metrics.overCapacityOrders} over capacity — refund needed` : undefined}
            tone={metrics.overCapacityOrders > 0 ? "alert" : "default"}
            href={`${VBYB_BASE_PATH}/orders`}
          />
          <MetricTile label="Remaining slots" value={String(metrics.remainingSlots)} />
          <MetricTile
            label="Revenue"
            value={formatMoney(metrics.grossRevenueCents, currency)}
            detail={`Net ${formatMoney(metrics.netRevenueCents, currency)}`}
          />
          <MetricTile label="Submissions" value={String(metrics.submissionsReceived)} href={`${VBYB_BASE_PATH}/validations`} />
          <MetricTile
            label="In progress"
            value={String(metrics.inProgress)}
            detail={metrics.submittedWaiting > 0 ? `${metrics.submittedWaiting} submitted, not started` : undefined}
          />
          <MetricTile label="Delivered" value={String(metrics.delivered)} />
          <MetricTile
            label="Refunds"
            value={String(metrics.refundedOrders)}
            detail={
              metrics.refundRequestsOpen > 0
                ? `${metrics.refundRequestsOpen} request${metrics.refundRequestsOpen === 1 ? "" : "s"} open`
                : `${formatMoney(metrics.refundedCents, currency)} refunded`
            }
            tone={metrics.refundRequestsOpen > 0 ? "alert" : "default"}
          />
          <MetricValueTile label="Average delivery time" metric={averageDeliveryMetric(metrics)} />
          <MetricTile label="Pending submissions" value={String(metrics.pendingSubmissions)} detail="Paid, no submission yet" />
          <MetricTile label="Overdue" value={String(metrics.overdue)} detail="Past the 48-hour window" tone={metrics.overdue > 0 ? "alert" : "default"} />
        </div>
        {(metrics.testOrders > 0 || metrics.currencies.length > 1) && (
          <p className="mt-4 text-xs text-slate-500">
            {metrics.testOrders > 0 && `${metrics.testOrders} test order${metrics.testOrders === 1 ? "" : "s"} excluded. `}
            {metrics.currencies.length > 1 && `Orders span ${metrics.currencies.join(", ")}; revenue totals mix currencies.`}
          </p>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Section title="Decisions" description="Recorded decisions on real (non-test) orders.">
          <dl className="grid grid-cols-2 gap-3">
            {DECISIONS.map((decision) => (
              <div key={decision} className="rounded-md border border-white/[0.06] px-3 py-2">
                <dt className="text-xs font-semibold tracking-wide text-slate-400">{DECISION_LABELS[decision]}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-white">{metrics.decisions[decision]}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Needs attention" className="lg:col-span-2">
          <ul className="space-y-3 text-sm">
            {overdue.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${VBYB_BASE_PATH}/validations/${v.id}`} className="text-slate-200 hover:underline">
                  {v.customer?.name || v.customer?.email || "Validation"}
                </Link>
                <Badge variant="danger">Overdue since {dueAt(v.submitted_at)?.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</Badge>
              </li>
            ))}
            {metrics.unmatchedSubmissions > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${VBYB_BASE_PATH}/validations`} className="text-slate-200 hover:underline">
                  Unmatched submissions waiting for an order
                </Link>
                <Badge variant="progress">{metrics.unmatchedSubmissions}</Badge>
              </li>
            )}
            {metrics.refundRequestsOpen > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${VBYB_BASE_PATH}/orders`} className="text-slate-200 hover:underline">
                  Open refund requests
                </Link>
                <Badge variant="progress">{metrics.refundRequestsOpen}</Badge>
              </li>
            )}
            {metrics.overCapacityOrders > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${VBYB_BASE_PATH}/orders`} className="text-slate-200 hover:underline">
                  Paid orders beyond founding capacity
                </Link>
                <Badge variant="danger">{metrics.overCapacityOrders}</Badge>
              </li>
            )}
            {overdue.length === 0 &&
              metrics.unmatchedSubmissions === 0 &&
              metrics.refundRequestsOpen === 0 &&
              metrics.overCapacityOrders === 0 && <li className="text-slate-500">Nothing needs attention.</li>}
          </ul>
        </Section>
      </div>

      <Section title="Recent activity">
        <ActivityFeed events={events} />
      </Section>
    </div>
  );
}
