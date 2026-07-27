import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";
import { ContactForm } from "@/components/admin/contacts/ContactForm";

export const metadata = { title: "New contact" };

export default function NewContactPage() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="New contact"
        breadcrumb={
          <Link
            href="/admin/contacts"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Contacts
          </Link>
        }
      />
      <ContactForm mode="create" />
    </div>
  );
}
