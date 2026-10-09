import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIN_MEDIAN_SAMPLE, MIN_RATE_SAMPLE, VBYB_LAUNCH_SLUG } from "@/lib/vbyb/config";
import { throwIfError } from "@/lib/vbyb/errors";
import { formatHours } from "@/lib/vbyb/format";
import type { CustomerRelationship, Decision } from "@/types/vbyb";

/**
 * Launch metrics.
 *
 * Every count and sum is computed in Postgres by vbyb_launch_metrics — nothing
 * here aggregates rows. This module only reads that result and decides how
 * honestly a number can be shown: a rate over two orders is "Insufficient data",
 * and anything this site does not collect (visitors, checkout starts) is "Not
 * tracked" rather than an invented figure.
 */

export interface LaunchMetrics {
  launchId: string;
  capacity: number;
  priceCents: number;
  currency: string;
  occupiedSlots: number;
  remainingSlots: number;
  overCapacityOrders: number;
  paidOrders: number;
  totalOrders: number;
  refundedOrders: number;
  refundRequestsOpen: number;
  testOrders: number;
  grossRevenueCents: number;
  refundedCents: number;
  netRevenueCents: number;
  currencies: string[];
  submissionsReceived: number;
  pendingSubmissions: number;
  submittedWaiting: number;
  inProgress: number;
  delivered: number;
  overdue: number;
  unmatchedSubmissions: number;
  deliverySample: number;
  avgDeliveryHours: number | null;
  medianDeliveryHours: number | null;
  decisions: Record<Decision, number>;
  relationships: Record<CustomerRelationship, number>;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Maps the SQL function's jsonb into typed metrics. Null when the launch is missing. */
export function parseLaunchMetrics(raw: unknown): LaunchMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const decisions = (r.decisions ?? {}) as Record<string, unknown>;
  const relationships = (r.relationships ?? {}) as Record<string, unknown>;

  return {
    launchId: String(r.launch_id ?? ""),
    capacity: num(r.capacity),
    priceCents: num(r.price_cents),
    currency: typeof r.currency === "string" ? r.currency : "USD",
    occupiedSlots: num(r.occupied_slots),
    remainingSlots: num(r.remaining_slots),
    overCapacityOrders: num(r.over_capacity_orders),
    paidOrders: num(r.paid_orders),
    totalOrders: num(r.total_orders),
    refundedOrders: num(r.refunded_orders),
    refundRequestsOpen: num(r.refund_requests_open),
    testOrders: num(r.test_orders),
    grossRevenueCents: num(r.gross_revenue_cents),
    refundedCents: num(r.refunded_cents),
    netRevenueCents: num(r.net_revenue_cents),
    currencies: Array.isArray(r.currencies) ? r.currencies.filter((c): c is string => typeof c === "string") : [],
    submissionsReceived: num(r.submissions_received),
    pendingSubmissions: num(r.pending_submissions),
    submittedWaiting: num(r.submitted_waiting),
    inProgress: num(r.in_progress),
    delivered: num(r.delivered),
    overdue: num(r.overdue),
    unmatchedSubmissions: num(r.unmatched_submissions),
    deliverySample: num(r.delivery_sample),
    avgDeliveryHours: numOrNull(r.avg_delivery_hours),
    medianDeliveryHours: numOrNull(r.median_delivery_hours),
    decisions: {
      build: num(decisions.build),
      test_more: num(decisions.test_more),
      park: num(decisions.park),
      kill: num(decisions.kill),
    },
    relationships: {
      stranger: num(relationships.stranger),
      known: num(relationships.known),
      unknown: num(relationships.unknown),
    },
  };
}

export async function getLaunchMetrics(db: SupabaseClient, slug: string = VBYB_LAUNCH_SLUG): Promise<LaunchMetrics | null> {
  const { data, error } = await db.rpc("vbyb_launch_metrics", { p_launch_slug: slug });
  throwIfError(error, "launch metrics");
  return parseLaunchMetrics(data);
}

export type MetricValue =
  | { kind: "value"; display: string; detail?: string }
  | { kind: "insufficient"; display: "Insufficient data"; detail: string }
  | { kind: "not_tracked"; display: "Not tracked"; detail: string };

export const NOT_TRACKED: MetricValue = {
  kind: "not_tracked",
  display: "Not tracked",
  detail: "This site does not collect visitor or checkout data.",
};

/** A percentage, or "Insufficient data" when the denominator is too small to mean anything. */
export function rateMetric(numerator: number, denominator: number, minSample: number = MIN_RATE_SAMPLE): MetricValue {
  if (denominator < minSample) {
    return {
      kind: "insufficient",
      display: "Insufficient data",
      detail: `${numerator} of ${denominator} — needs at least ${minSample}`,
    };
  }
  return {
    kind: "value",
    display: `${Math.round((numerator / denominator) * 100)}%`,
    detail: `${numerator} of ${denominator}`,
  };
}

export function durationMetric(hours: number | null, sample: number, minSample: number): MetricValue {
  if (hours == null || sample < minSample) {
    return {
      kind: "insufficient",
      display: "Insufficient data",
      detail: `${sample} delivered with a submission time — needs at least ${minSample}`,
    };
  }
  return { kind: "value", display: formatHours(hours), detail: `from ${sample} delivered` };
}

export function averageDeliveryMetric(metrics: LaunchMetrics): MetricValue {
  return durationMetric(metrics.avgDeliveryHours, metrics.deliverySample, 1);
}

export function medianDeliveryMetric(metrics: LaunchMetrics): MetricValue {
  return durationMetric(metrics.medianDeliveryHours, metrics.deliverySample, MIN_MEDIAN_SAMPLE);
}
