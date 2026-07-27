import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Briefcase, MessageSquare } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getContact } from "@/lib/contacts";
import { PageHeader, Badge } from "@/components/admin/ui";
import { ContactActions } from "@/components/admin/contacts/ContactActions";
import { providerLabel, type Contact } from "@/types/contact";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{children}</dd>
    </div>
  );
}

const dash = <span className="text-slate-600">—</span>;

/** Read-only placeholder for a section shipping in a later milestone. */
function PlaceholderSection({
  icon,
  title,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
        <span className="text-slate-500 [&>svg]:size-4">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
    </div>
  );
}

export default async function ContactDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const contact = (await getContact(supabase, id)) as Contact | null;
  if (!contact) notFound();

  const isArchived = contact.archived_at != null;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={contact.full_name}
        breadcrumb={
          <Link href="/admin/contacts" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="size-3.5" aria-hidden />
            Contacts
          </Link>
        }
        actions={<ContactActions contact={contact} />}
      />

      {isArchived && (
        <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-slate-400">
          <Badge variant="neutral">Archived</Badge>
          <span>This contact is archived and hidden from the default list.</span>
        </div>
      )}

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Title">{contact.title ?? dash}</Field>
          <Field label="Department">{contact.department ?? dash}</Field>
          <Field label="Company">
            {contact.company ? (
              <Link href={`/admin/companies/${contact.company.id}`} className="text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2">
                {contact.company.name}
              </Link>
            ) : (
              dash
            )}
          </Field>
          <Field label="Source">{contact.source ? providerLabel(contact.source) : dash}</Field>
          <Field label="Email">
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2">
                {contact.email}
              </a>
            ) : (
              dash
            )}
          </Field>
          <Field label="Phone">{contact.phone ?? dash}</Field>
          <Field label="LinkedIn">
            {contact.linkedin_url ? (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-slate-200 hover:text-white underline decoration-white/20 underline-offset-2"
              >
                {contact.linkedin_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              dash
            )}
          </Field>
          <Field label="Location">{contact.location ?? dash}</Field>
          <Field label="Timezone">{contact.timezone ?? dash}</Field>
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlaceholderSection
          icon={<Briefcase />}
          title="Opportunities"
          note="Opportunities linked to this contact will appear here once the Opportunities module ships (M3)."
        />
        <PlaceholderSection
          icon={<MessageSquare />}
          title="Messages"
          note="Conversations with this contact will appear here once the Messages module ships (M6)."
        />
      </div>

      <p className="text-xs text-slate-600">
        Added {formatDate(contact.created_at)} · Updated {formatDate(contact.updated_at)}
      </p>
    </div>
  );
}
