import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip, Download } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMessage, getMessageAttachments, getThreadMessages, sanitizeMessageHtml } from "@/lib/messages";
import { PageHeader, Badge } from "@/components/admin/ui";
import { MessageActions } from "@/components/admin/messages/MessageActions";
import { MessageBody } from "@/components/admin/messages/MessageBody";
import { MessageLinkPanel } from "@/components/admin/messages/MessageLinkPanel";
import { directionBadgeVariant, directionLabel, type Message } from "@/types/message";
import { providerLabel } from "@/types/contact";

interface PageProps {
  params: Promise<{ id: string }>;
}

const dash = <span className="text-slate-600">—</span>;

function formatDateTime(v: string | null) {
  return v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}
function formatDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}
function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-20 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-slate-200">{children}</dd>
    </div>
  );
}

export default async function MessageDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const message = (await getMessage(supabase, id)) as Message | null;
  if (!message) notFound();

  const [attachments, thread] = await Promise.all([
    getMessageAttachments(supabase, id),
    message.thread_id ? getThreadMessages(supabase, message.thread_id, id) : Promise.resolve([]),
  ]);

  const safeHtml = message.body_html ? sanitizeMessageHtml(message.body_html) : null;
  const isArchived = message.archived_at != null;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={message.subject || "(no subject)"}
        breadcrumb={
          <Link href="/admin/messages" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="size-3.5" aria-hidden />
            Messages
          </Link>
        }
        actions={<MessageActions message={message} />}
      />

      {isArchived && (
        <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-slate-400">
          <Badge variant="neutral">Archived</Badge>
          <span>This message is archived.</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Message */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant={directionBadgeVariant(message.direction)}>{directionLabel(message.direction)}</Badge>
              {!message.is_read && <Badge variant="info">Unread</Badge>}
            </div>

            <dl className="space-y-1.5">
              <Field label="From">
                {message.from_name ? `${message.from_name} ` : ""}
                {message.from_address ? <span className="text-slate-400">&lt;{message.from_address}&gt;</span> : !message.from_name ? dash : null}
              </Field>
              <Field label="To">{message.to_addresses?.length ? message.to_addresses.join(", ") : dash}</Field>
              {message.cc_addresses?.length > 0 && <Field label="Cc">{message.cc_addresses.join(", ")}</Field>}
              <Field label="Date">{formatDateTime(message.received_at ?? message.sent_at) ?? dash}</Field>
              <Field label="Source">
                {message.source ? providerLabel(message.source) : dash}
                {message.integration_account?.email_address ? ` · ${message.integration_account.email_address}` : ""}
              </Field>
            </dl>

            {message.ai_summary && (
              <div className="mt-4 rounded-md border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-xs font-medium text-slate-400">AI summary</p>
                <p className="mt-1 text-sm text-slate-300">{message.ai_summary}</p>
              </div>
            )}

            <div className="mt-5 border-t border-white/[0.06] pt-5">
              <MessageBody html={safeHtml} text={message.body_text} />
            </div>
          </div>

          {/* Attachments */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Paperclip className="size-4 text-slate-500" aria-hidden />
              Attachments
            </h2>
            {attachments.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No attachments.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{a.file_name}</p>
                      <p className="text-xs text-slate-500">
                        {[a.mime_type, formatBytes(a.file_size_bytes)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {a.file_url && (
                      <a
                        href={a.file_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Download ${a.file_name}`}
                        className="rounded p-1 text-slate-400 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                      >
                        <Download className="size-4" aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <MessageLinkPanel message={message} />

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold text-white">Thread</h2>
            {thread.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No other messages in this thread.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {thread.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/messages/${t.id}`} className="block rounded-md border border-white/[0.06] px-3 py-2 hover:border-white/15">
                      <span className="block truncate text-sm text-slate-200">{t.subject || "(no subject)"}</span>
                      <span className="block text-xs text-slate-500">
                        {t.from_name ?? t.from_address ?? "—"} · {formatDate(t.received_at ?? t.sent_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5 text-xs text-slate-500">
            <p>Thread ID: {message.thread_id ?? "—"}</p>
            <p className="mt-1 break-all">Message ID: {message.external_message_id ?? "—"}</p>
            <p className="mt-1">Received {formatDate(message.received_at)} · Added {formatDate(message.created_at)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
