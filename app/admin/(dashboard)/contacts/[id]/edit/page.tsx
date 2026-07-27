import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getContact } from "@/lib/contacts";
import { PageHeader } from "@/components/admin/ui";
import { ContactForm } from "@/components/admin/contacts/ContactForm";
import type { Contact } from "@/types/contact";

export const metadata = { title: "Edit contact" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditContactPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const contact = (await getContact(supabase, id)) as Contact | null;
  if (!contact) notFound();

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={`Edit ${contact.full_name}`}
        breadcrumb={
          <Link
            href={`/admin/contacts/${contact.id}`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {contact.full_name}
          </Link>
        }
      />
      <ContactForm mode="edit" contact={contact} />
    </div>
  );
}
