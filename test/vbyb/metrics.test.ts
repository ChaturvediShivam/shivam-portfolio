import { describe, it, expect } from "vitest";
import { createSupabaseStub } from "@/test/stubs/supabase";
import {
  NOT_TRACKED,
  averageDeliveryMetric,
  getLaunchMetrics,
  medianDeliveryMetric,
  parseLaunchMetrics,
  rateMetric,
} from "@/lib/vbyb/metrics";
import { currencyMinorDigits, formatMoney, parseAmountToMinorUnits } from "@/lib/vbyb/format";

/**
 * Every number is computed in SQL (vbyb_launch_metrics); these tests pin how the
 * result is read and how honestly it is displayed. The SQL arithmetic itself is
 * exercised by supabase/verification/validate_before_you_build_selftest.sql.
 */

const SQL_RESULT = {
  launch_id: "launch-1",
  capacity: 10,
  price_cents: 3900,
  currency: "USD",
  occupied_slots: 4,
  remaining_slots: 6,
  over_capacity_orders: 0,
  paid_orders: 4,
  total_orders: 5,
  refunded_orders: 1,
  refund_requests_open: 0,
  test_orders: 2,
  gross_revenue_cents: 19500,
  refunded_cents: 3900,
  net_revenue_cents: 15600,
  currencies: ["USD"],
  submissions_received: 3,
  pending_submissions: 1,
  submitted_waiting: 0,
  in_progress: 1,
  delivered: 2,
  overdue: 0,
  unmatched_submissions: 1,
  delivery_sample: 2,
  avg_delivery_hours: 30.5,
  median_delivery_hours: 30.5,
  decisions: { build: 1, test_more: 1, park: 0, kill: 0 },
  relationships: { stranger: 3, known: 1, unknown: 1 },
};

describe("parseLaunchMetrics", () => {
  it("maps the SQL result without recomputing anything", () => {
    const m = parseLaunchMetrics(SQL_RESULT)!;
    expect(m.paidOrders).toBe(4);
    expect(m.capacity).toBe(10);
    expect(m.remainingSlots).toBe(6);
    expect(m.grossRevenueCents).toBe(19500);
    expect(m.netRevenueCents).toBe(15600);
    expect(m.decisions).toEqual({ build: 1, test_more: 1, park: 0, kill: 0 });
    expect(m.relationships.stranger).toBe(3);
  });

  it("returns null when the launch does not exist (the function returns SQL null)", () => {
    expect(parseLaunchMetrics(null)).toBeNull();
  });

  it("treats missing counts as zero and missing durations as null", () => {
    const m = parseLaunchMetrics({ launch_id: "x", capacity: 10 })!;
    expect(m.paidOrders).toBe(0);
    expect(m.avgDeliveryHours).toBeNull();
    expect(m.decisions.kill).toBe(0);
  });

  it("is fetched through the vbyb_launch_metrics RPC for the founding launch", async () => {
    const stub = createSupabaseStub({ rpc: { vbyb_launch_metrics: SQL_RESULT } });
    const m = await getLaunchMetrics(stub.client);
    expect(stub.rpcCalls).toEqual([{ name: "vbyb_launch_metrics", args: { p_launch_slug: "founding-v1" } }]);
    expect(m?.occupiedSlots).toBe(4);
  });
});

describe("honest display", () => {
  it("shows a rate only once the sample is large enough", () => {
    expect(rateMetric(2, 3)).toMatchObject({ kind: "insufficient", display: "Insufficient data" });
    expect(rateMetric(3, 5)).toMatchObject({ kind: "value", display: "60%", detail: "3 of 5" });
  });

  it("never invents conversion data", () => {
    expect(NOT_TRACKED).toMatchObject({ kind: "not_tracked", display: "Not tracked" });
  });

  it("needs three deliveries before showing a median", () => {
    const m = parseLaunchMetrics(SQL_RESULT)!;
    expect(averageDeliveryMetric(m)).toMatchObject({ kind: "value", display: "30.5 h" });
    expect(medianDeliveryMetric(m)).toMatchObject({ kind: "insufficient" });
    expect(medianDeliveryMetric({ ...m, deliverySample: 3 })).toMatchObject({ kind: "value" });
  });
});

describe("money", () => {
  it("formats minor units per currency, not assuming cents", () => {
    expect(formatMoney(3900, "USD")).toBe("$39.00");
    expect(currencyMinorDigits("JPY")).toBe(0);
    expect(formatMoney(3900, "JPY")).toBe("¥3,900");
  });

  it("parses amounts into minor units and rejects junk", () => {
    expect(parseAmountToMinorUnits("39", "USD")).toBe(3900);
    expect(parseAmountToMinorUnits("39.5", "USD")).toBe(3950);
    expect(parseAmountToMinorUnits("39.999", "USD")).toBeNull();
    expect(parseAmountToMinorUnits("-1", "USD")).toBeNull();
    expect(parseAmountToMinorUnits("abc", "USD")).toBeNull();
    expect(parseAmountToMinorUnits("500", "JPY")).toBe(500);
    expect(parseAmountToMinorUnits("5.5", "JPY")).toBeNull();
  });
});
