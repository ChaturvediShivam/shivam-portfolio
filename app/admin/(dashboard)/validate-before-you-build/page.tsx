import Link from "next/link";
import { Badge, EmptyState } from "@/components/admin/ui";
import { ActivityFeed } from "@/components/admin/vbyb/ActivityFeed";
import { MetricTile, MetricValueTile } from "@/components/admin/vbyb/MetricTile";
import { Section } from "@/components/admin/vbyb/Section";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { listEvents } from "@/lib/vbyb/events";
import { formatMoney, thresholdStatus } from "@/lib/vbyb/format";
import { countFailedDeliveries, getLaunch } from "@/lib/vbyb/launch";
import { averageDeliveryMetric, getLaunchMetrics, medianDeliveryMetric, rateMetric } from "@/lib/vbyb/metrics";
import { listValidations } from "@/lib/vbyb/validations";
import { dueAt, isOverdue } from "@/lib/vbyb/workflow";
import { DECISIONS, DECISION_LABELS } from "@/types/vbyb";

export const dynamic = "force-dynamic";

/**
 * "How is the first founding launch performing?"
 *
 * Every number is read from vbyb_launch_metrics / vbyb_launches. Launch
 * configuration (price, currency, capacity, primary metric, thresholds) comes
 * from the launch row, never from code.
 */
export default async function ValidateBeforeYouBuildOverviewPage() {
  const { db } = await requireVbybAdminPage();

  const [metrics, launch, events, validations, failedDeliveries] = await Promise.all([
    getLaunchMetrics(db),
    getLaunch(db),
    listEvents(db, { limit: 15 }),
    listValidations(db),
    countFailedDeliveries(db),
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

  const strangers = metrics.relationships.stranger;
  const unclassified = metrics.relationships.unknown;
  const decided = DECISIONS.reduce((sum, d) => sum + metrics.decisions[d], 0);
  const undecided = Math.max(metrics.totalOrders - decided, 0);
  const thresholdsSet = launch.criteria_min_preorders != null || launch.criteria_strong_preorders != null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="vbyb-primary-metric" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-white/15 bg-white/[0.04] p-5 md:col-span-2">
          <p id="vbyb-primary-metric" className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Primary metric · {launch.primary_metric ?? "Not set"}
          </p>
          <p className="mt-2 text-4xl font-semibold tabular-nums text-white">{strangers}</p>
          <p className="mt-1 text-xs text-slate-500">
            Customers marked as strangers with a paid (or later refunded) non-test order.
            {unclassified > 0
              ? ` ${unclassified} customer${unclassified === 1 ? " is" : "s are"} not yet classified — set the relationship on each order.`
              : ""}
          </p>
        </div>
        <MetricTile
          label="Launch experiment thresholds"
          value={thresholdsSet ? `${launch.criteria_min_preorders ?? "—"} / ${launch.criteria_strong_preorders ?? "—"}` : "Not set"}
          detail={
            thresholdsSet
              ? `Minimum ${thresholdStatus(launch.criteria_min_preorders, strangers)} · strong ${thresholdStatus(launch.criteria_strong_preorders, strangers)}. Internal thresholds, not benchmarks.`
              : "Set internal minimum / strong thresholds in Settings."
          }
          tone={thresholdsSet ? "default" : "muted"}
          href={`${VBYB_BASE_PATH}/settings`}
        />
      </section>

      <Section
        title="Founding launch"
        description={`${launch.name} · ${formatMoney(launch.price_cents, launch.currency)} · capacity ${launch.capacity}. Test orders are excluded from every figure.`}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <MetricTile
            label="Paid pre-orders"
            value={`${metrics.paidOrders} / ${metrics.capacity}`}
            detail={metrics.overCapacityOrders > 0 ? `${metrics.overCapacityOrders} over capacity — refund needed` : undefined}
            tone={metrics.overCapacityOrders > 0 ? "alert" : "default"}
            href={`${VBYB_BASE_PATH}/orders`}
          />
          <MetricTile label="Remaining capacity" value={String(metrics.remainingSlots)} />
          <MetricTile
            label="Revenue"
            value={formatMoney(metrics.grossRevenueCents, currency)}
            detail={`Net ${formatMoney(metrics.netRevenueCents, currency)}`}
          />
          <MetricTile label="Submissions received" value={String(metrics.submissionsReceived)} href={`${VBYB_BASE_PATH}/validations`} />
          <MetricTile
            label="In progress"
            value={String(metrics.inProgress)}
            detail={metrics.submittedWaiting > 0 ? `${metrics.submittedWaiting} submitted, not started` : undefined}
          />
          <MetricTile label="Delivered" value={String(metrics.delivered)} />
          <MetricTile
            label="Refunded"
            value={String(metrics.refundedOrders)}
            detail={
              metrics.refundRequestsOpen > 0
                ? `${metrics.refundRequestsOpen} request${metrics.refundRequestsOpen === 1 ? "" : "s"} open`
                : `${formatMoney(metrics.refundedCents, currency)} refunded`
            }
            tone={metrics.refundRequestsOpen > 0 ? "alert" : "default"}
          />
          <MetricTile label="Awaiting submission" value={String(metrics.pendingSubmissions)} detail="Paid, no submission yet" />
          <MetricTile label="Overdue" value={String(metrics.overdue)} detail="Past the 48-hour window" tone={metrics.overdue > 0 ? "alert" : "default"} />
          <MetricTile
            label="Unmatched submissions"
            value={String(metrics.unmatchedSubmissions)}
            tone={metrics.unmatchedSubmissions > 0 ? "alert" : "default"}
            href={`${VBYB_BASE_PATH}/validations`}
          />
        </div>
        {(metrics.testOrders > 0 || metrics.currencies.length > 1) && (
          <p className="mt-4 text-xs text-slate-500">
            {metrics.testOrders > 0 && `${metrics.testOrders} test order${metrics.testOrders === 1 ? "" : "s"} excluded. `}
            {metrics.currencies.length > 1 && `Orders span ${metrics.currencies.join(", ")}; revenue totals mix currencies.`}
          </p>
        )}
      </Section>

      <Section
        title="Funnel"
        description="Paid and submitted are separate states: an order counts as submitted only once its Tally submission is linked. Rates need at least 5 observations."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricTile label="Paid" value={String(metrics.totalOrders)} detail="Including later refunds" />
          <MetricTile label="Submission received" value={String(metrics.submissionsReceived)} />
          <MetricTile label="Validation in progress" value={String(metrics.inProgress)} />
          <MetricTile label="Delivered" value={String(metrics.delivered)} />
          <MetricTile label="Refunded" value={String(metrics.refundedOrders)} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricValueTile label="Paid → submission" metric={rateMetric(metrics.submissionsReceived, metrics.totalOrders)} />
          <MetricValueTile label="Submission → delivered" metric={rateMetric(metrics.delivered, metrics.submissionsReceived)} />
          <MetricValueTile label="Average delivery time" metric={averageDeliveryMetric(metrics)} />
          <MetricValueTile label="Median delivery time" metric={medianDeliveryMetric(metrics)} />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Section
          title="Decisions"
          description="Conclusions recorded from each evidence ledger — the evidence remains the source of truth."
        >
          <dl className="grid grid-cols-2 gap-3">
            {DECISIONS.map((decision) => (
              <div key={decision} className="rounded-md border border-white/[0.06] px-3 py-2">
                <dt className="text-xs font-semibold tracking-wide text-slate-400">{DECISION_LABELS[decision]}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-white">{metrics.decisions[decision]}</dd>
              </div>
            ))}
            <div className="col-span-2 rounded-md border border-dashed border-white/10 px-3 py-2">
              <dt className="text-xs font-semibold tracking-wide text-slate-500">UNDECIDED</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-300">{undecided}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Needs attention" className="lg:col-span-2">
          <ul className="space-y-3 text-sm">
            {overdue.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${VBYB_BASE_PATH}/validations/${v.id}`} className="text-slate-200 hover:underline">
                  {v.customer?.name || v.customer?.email || "Validation"}
                </Link>
                <Badge variant="danger">
                  Overdue since {dueAt(v.submitted_at)?.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </Badge>
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
            {unclassified > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${VBYB_BASE_PATH}/customers`} className="text-slate-200 hover:underline">
                  Customers not yet classified as stranger or known
                </Link>
                <Badge variant="neutral">{unclassified}</Badge>
              </li>
            )}
            {failedDeliveries > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${VBYB_BASE_PATH}/settings`} className="text-slate-200 hover:underline">
                  Webhook deliveries that failed processing
                </Link>
                <Badge variant="danger">{failedDeliveries}</Badge>
              </li>
            )}
            {overdue.length === 0 &&
              metrics.unmatchedSubmissions === 0 &&
              metrics.refundRequestsOpen === 0 &&
              metrics.overCapacityOrders === 0 &&
              unclassified === 0 &&
              failedDeliveries === 0 && <li className="text-slate-500">Nothing needs attention.</li>}
          </ul>
        </Section>
      </div>

      <Section title="Recent activity">
        <ActivityFeed events={events} emptyText="No activity yet. Orders, submissions and status changes will appear here." />
      </Section>
    </div>
  );
}
