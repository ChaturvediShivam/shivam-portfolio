import { Badge, DataTable, EmptyState, PageHeader, type Column } from "@/components/admin/ui";
import { LinkSubmissionControl } from "@/components/admin/vbyb/LinkSubmissionControl";
import { Section } from "@/components/admin/vbyb/Section";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";
import { requireVbybAdminPage } from "@/lib/vbyb/db";
import { formatDate, formatDateTime } from "@/lib/vbyb/format";
import {
  listLinkableOrders,
  listUnmatchedSubmissions,
  listValidations,
  type ValidationListRow,
} from "@/lib/vbyb/validations";
import { dueAt, isOverdue } from "@/lib/vbyb/workflow";
import { DECISION_LABELS, VALIDATION_STATUS_LABELS, validationStatusVariant } from "@/types/vbyb";

export const metadata = { title: "Validations · Validate Before You Build" };
export const dynamic = "force-dynamic";

export default async function VbybValidationsPage() {
  const { db } = await requireVbybAdminPage();
  const [validations, unmatched, linkableOrders] = await Promise.all([
    listValidations(db),
    listUnmatchedSubmissions(db),
    listLinkableOrders(db),
  ]);

  const now = new Date();

  const columns: Column<ValidationListRow>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate text-slate-200">{v.customer?.name || v.customer?.email || "—"}</p>
          {v.order?.is_test && <Badge variant="special">Test</Badge>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (v) => <Badge variant={validationStatusVariant(v.status)}>{VALIDATION_STATUS_LABELS[v.status]}</Badge>,
    },
    { key: "submitted", header: "Submitted", render: (v) => formatDate(v.submitted_at) },
    {
      key: "due",
      header: "Due",
      render: (v) => {
        if (!v.submitted_at || v.status === "delivered" || v.status === "refunded") return <span className="text-slate-600">—</span>;
        const due = dueAt(v.submitted_at);
        return isOverdue(v, now) ? (
          <Badge variant="danger">Overdue · {formatDateTime(due?.toISOString())}</Badge>
        ) : (
          formatDateTime(due?.toISOString())
        );
      },
    },
    {
      key: "decision",
      header: "Decision",
      render: (v) => (v.decision ? DECISION_LABELS[v.decision] : <span className="text-slate-600">—</span>),
    },
    { key: "delivered", header: "Delivered", render: (v) => formatDate(v.delivered_at) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validations"
        count={validations.length}
        countLabel={validations.length === 1 ? "validation" : "validations"}
        description="One Validation File per order: PAID → SUBMITTED → IN PROGRESS → DELIVERED."
      />

      {unmatched.length > 0 && (
        <Section
          title={`Unmatched submissions (${unmatched.length})`}
          description="Stored exactly as received. Each is retried by email when a new order arrives, or you can link it here."
        >
          <ul className="divide-y divide-white/[0.06]">
            {unmatched.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">
                    {s.name || "Unnamed"} {s.email && <span className="text-slate-500">· {s.email}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    Submitted {formatDateTime(s.submitted_at)}
                    {s.ref ? " · has a ref that matched no order" : " · no ref"}
                  </p>
                  {s.fields?.idea_what && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{s.fields.idea_what}</p>}
                </div>
                <LinkSubmissionControl submissionId={s.id} orders={linkableOrders} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <DataTable
        columns={columns}
        rows={validations}
        getRowKey={(v) => v.id}
        rowHref={(v) => `${VBYB_BASE_PATH}/validations/${v.id}`}
        emptyState={<EmptyState title="No validations yet" description="A validation is created with every order." />}
      />
    </div>
  );
}
