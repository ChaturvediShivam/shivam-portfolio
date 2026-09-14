import { Badge, DataTable, EmptyState, PageHeader, type Column } from "@/components/admin/ui";
import { ManualOrderDialog } from "@/components/admin/vbyb/ManualOrderDialog";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { currencyMinorDigits, formatDate, formatMoney } from "@/lib/vbyb/format";
import { getLaunch } from "@/lib/vbyb/launch";
import { listOrders, type OrderRow } from "@/lib/vbyb/orders";
import {
  DECISION_LABELS,
  VALIDATION_STATUS_LABELS,
  humanize,
  paymentStatusVariant,
  validationStatusVariant,
} from "@/types/vbyb";

export const metadata = { title: "Orders · Validate Before You Build" };
export const dynamic = "force-dynamic";

export default async function VbybOrdersPage() {
  const { db } = await requireVbybAdminPage();
  const [orders, launch] = await Promise.all([listOrders(db), getLaunch(db)]);

  const currency = launch?.currency ?? "USD";
  const digits = currencyMinorDigits(currency);
  const defaultAmount = launch ? (launch.price_cents / 10 ** digits).toFixed(digits) : "";

  const columns: Column<OrderRow>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (o) => (
        <div className="min-w-0">
          <p className="truncate text-slate-200">{o.customer?.name || o.customer?.email || "—"}</p>
          {o.customer?.name && <p className="truncate text-xs text-slate-500">{o.customer.email}</p>}
        </div>
      ),
    },
    { key: "amount", header: "Amount", align: "right", render: (o) => formatMoney(o.amount_cents, o.currency) },
    {
      key: "payment",
      header: "Payment",
      render: (o) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={paymentStatusVariant(o.payment_status)}>{humanize(o.payment_status)}</Badge>
          {o.refund_status === "requested" && <Badge variant="progress">Refund requested</Badge>}
          {o.is_test && <Badge variant="special">Test</Badge>}
        </div>
      ),
    },
    {
      key: "slot",
      header: "Founding slot",
      render: (o) =>
        o.capacity_status === "over_capacity" ? (
          <Badge variant="danger">Over capacity</Badge>
        ) : o.slot_number && o.payment_status === "paid" ? (
          `#${o.slot_number}`
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
    {
      key: "validation",
      header: "Validation",
      render: (o) =>
        o.validation ? (
          <Badge variant={validationStatusVariant(o.validation.status)}>{VALIDATION_STATUS_LABELS[o.validation.status]}</Badge>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
    {
      key: "submission",
      header: "Submission",
      render: (o) =>
        o.validation?.submission_id ? (
          <Badge variant="info">Received</Badge>
        ) : (
          <span className="text-xs text-slate-500">Not yet</span>
        ),
    },
    {
      key: "decision",
      header: "Decision",
      render: (o) => (o.validation?.decision ? DECISION_LABELS[o.validation.decision] : <span className="text-slate-600">—</span>),
    },
    { key: "source", header: "Source", render: (o) => humanize(o.provider) },
    { key: "purchased", header: "Purchased", render: (o) => formatDate(o.purchased_at) },
    { key: "updated", header: "Updated", render: (o) => formatDate(o.updated_at) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        count={orders.length}
        countLabel={orders.length === 1 ? "order" : "orders"}
        description="Gumroad purchases arrive through the webhook; refunded orders are kept for history."
        actions={<ManualOrderDialog defaultAmount={defaultAmount} defaultCurrency={currency} />}
      />
      <DataTable
        columns={columns}
        rows={orders}
        getRowKey={(o) => o.id}
        rowHref={(o) => `${VBYB_BASE_PATH}/orders/${o.id}`}
        emptyState={
          <EmptyState
            title="No orders yet"
            description="Orders appear here when Gumroad sends a purchase, or when you record one manually."
          />
        }
      />
    </div>
  );
}
