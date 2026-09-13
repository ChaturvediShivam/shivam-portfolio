import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, PageHeader, buttonClasses } from "@/components/admin/ui";
import { ActivityFeed } from "@/components/admin/vbyb/ActivityFeed";
import {
  CopyLinkButton,
  CustomerForm,
  OrderNotesForm,
  RefundPanel,
  ResyncButton,
} from "@/components/admin/vbyb/OrderPanels";
import { Field, Section, dash } from "@/components/admin/vbyb/Section";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { listEvents } from "@/lib/vbyb/events";
import { formatDate, formatDateTime, formatMoney } from "@/lib/vbyb/format";
import { getOrder, listOrderSubmissions, personalSubmissionLink } from "@/lib/vbyb/orders";
import {
  VALIDATION_STATUS_LABELS,
  humanize,
  paymentStatusVariant,
  validationStatusVariant,
} from "@/types/vbyb";

export const metadata = { title: "Order · Validate Before You Build" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VbybOrderPage({ params }: PageProps) {
  const { id } = await params;
  const { db } = await requireVbybAdminPage();
  const order = await getOrder(db, id);
  if (!order) notFound();

  const [events, submissions] = await Promise.all([
    listEvents(db, { orderId: order.id, limit: 50 }),
    listOrderSubmissions(db, order.id),
  ]);

  const customerLabel = order.customer?.name || order.customer?.email || "Order";
  const submissionLink = personalSubmissionLink(order.submission_ref);

  return (
    <div className="space-y-6">
      <PageHeader
        title={customerLabel}
        description={order.customer?.name ? order.customer.email : undefined}
        breadcrumb={
          <Link href={`${VBYB_BASE_PATH}/orders`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft size={12} aria-hidden="true" /> Orders
          </Link>
        }
        actions={
          <>
            {order.provider === "gumroad" && <ResyncButton orderId={order.id} />}
            {order.validation && (
              <Link href={`${VBYB_BASE_PATH}/validations/${order.validation.id}`} className={buttonClasses("primary", "sm")}>
                Open validation
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Order">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Amount">{formatMoney(order.amount_cents, order.currency)}</Field>
              <Field label="Payment">
                <Badge variant={paymentStatusVariant(order.payment_status)}>{humanize(order.payment_status)}</Badge>
              </Field>
              <Field label="Refund status">{humanize(order.refund_status)}</Field>
              <Field label="Founding slot">
                {order.capacity_status === "over_capacity" ? (
                  <Badge variant="danger">Over capacity</Badge>
                ) : order.slot_number && order.payment_status === "paid" ? (
                  `#${order.slot_number}`
                ) : (
                  dash
                )}
              </Field>
              <Field label="Validation">
                {order.validation ? (
                  <Badge variant={validationStatusVariant(order.validation.status)}>
                    {VALIDATION_STATUS_LABELS[order.validation.status]}
                  </Badge>
                ) : (
                  dash
                )}
              </Field>
              <Field label="Purchased">{formatDateTime(order.purchased_at)}</Field>
              <Field label="Source">{humanize(order.provider)}</Field>
              <Field label="Gumroad sale id">
                {order.external_order_id ? <code className="text-xs">{order.external_order_id}</code> : dash}
              </Field>
              <Field label="Test order">{order.is_test ? <Badge variant="special">Test</Badge> : "No"}</Field>
            </dl>
          </Section>

          <Section
            title="Personal submission link"
            description="Send this to the customer. It carries a private reference so their Tally submission matches this order — no internal ids."
            actions={<CopyLinkButton value={submissionLink} />}
          >
            <p className="break-all rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 font-mono text-xs text-slate-300">
              {submissionLink}
            </p>
            {order.validation?.submission_id && (
              <p className="mt-2 text-xs text-slate-500">This order already has a submission. A second one is kept as additional.</p>
            )}
          </Section>

          <Section
            title="Refund"
            description="7-day refund policy. Refunds free the founding slot; the order, customer and validation are kept."
          >
            <RefundPanel order={order} />
          </Section>

          <Section title="Notes">
            <OrderNotesForm orderId={order.id} notes={order.notes} />
          </Section>

          {order.raw_payload && (
            <Section title="Recorded Gumroad sale" description="The sale fields stored from the Gumroad API at the last sync.">
              <details>
                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">Show data</summary>
                <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-black/30 p-3 text-xs text-slate-300">
                  {JSON.stringify(order.raw_payload, null, 2)}
                </pre>
              </details>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          {order.customer && (
            <Section title="Customer">
              <CustomerForm customer={order.customer} />
            </Section>
          )}

          <Section title="Submissions">
            {submissions.length === 0 ? (
              <p className="text-sm text-slate-500">No submission yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {submissions.map((s, index) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-slate-300">{formatDate(s.submitted_at)}</span>
                    <span className="text-xs text-slate-500">
                      {index === 0 ? "Primary" : "Additional"} · matched by {s.matched_by ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Activity">
            <ActivityFeed events={events} />
          </Section>
        </div>
      </div>
    </div>
  );
}
