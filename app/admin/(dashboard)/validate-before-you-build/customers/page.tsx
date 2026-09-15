import { Badge, DataTable, EmptyState, PageHeader, type Column } from "@/components/admin/ui";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { formatDate } from "@/lib/vbyb/format";
import { listCustomers, type CustomerRow } from "@/lib/vbyb/orders";
import {
  DECISION_LABELS,
  VALIDATION_STATUS_LABELS,
  humanize,
  paymentStatusVariant,
  validationStatusVariant,
} from "@/types/vbyb";

export const metadata = { title: "Customers · Validate Before You Build" };
export const dynamic = "force-dynamic";

export default async function VbybCustomersPage() {
  const { db } = await requireVbybAdminPage();
  const customers = await listCustomers(db);

  const columns: Column<CustomerRow>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate text-slate-200">{c.name || c.email}</p>
          {c.name && <p className="truncate text-xs text-slate-500">{c.email}</p>}
        </div>
      ),
    },
    {
      key: "relationship",
      header: "Relationship",
      render: (c) => <Badge variant={c.relationship === "stranger" ? "info" : "neutral"}>{humanize(c.relationship)}</Badge>,
    },
    {
      key: "order",
      header: "Order",
      render: (c) => {
        const latest = c.orders[0];
        if (!latest) return <span className="text-slate-600">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            <Badge variant={paymentStatusVariant(latest.payment_status)}>{humanize(latest.payment_status)}</Badge>
            {latest.is_test && <Badge variant="special">Test</Badge>}
            {c.orders.length > 1 && <Badge variant="neutral">{c.orders.length} orders</Badge>}
          </div>
        );
      },
    },
    {
      key: "validation",
      header: "Validation",
      render: (c) => {
        const validation = c.orders[0]?.validation;
        return validation ? (
          <Badge variant={validationStatusVariant(validation.status)}>{VALIDATION_STATUS_LABELS[validation.status]}</Badge>
        ) : (
          <span className="text-slate-600">—</span>
        );
      },
    },
    {
      key: "decision",
      header: "Decision",
      render: (c) => {
        const decision = c.orders[0]?.validation?.decision;
        return decision ? DECISION_LABELS[decision] : <span className="text-slate-600">—</span>;
      },
    },
    { key: "refund", header: "Refund", render: (c) => (c.orders[0] ? humanize(c.orders[0].refund_status) : "—") },
    { key: "purchased", header: "Purchased", render: (c) => formatDate(c.orders[0]?.purchased_at) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        count={customers.length}
        countLabel={customers.length === 1 ? "customer" : "customers"}
        description="One record per email address. Set the relationship on the order page — the primary metric counts strangers."
      />
      <DataTable
        columns={columns}
        rows={customers}
        getRowKey={(c) => c.id}
        rowHref={(c) => (c.orders[0] ? `${VBYB_BASE_PATH}/orders/${c.orders[0].id}` : `${VBYB_BASE_PATH}/customers`)}
        emptyState={<EmptyState title="No customers yet" description="Customers are created with their first order." />}
      />
    </div>
  );
}
