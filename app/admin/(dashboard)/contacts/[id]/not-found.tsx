import Link from "next/link";
import { Users } from "lucide-react";
import { EmptyState, buttonClasses } from "@/components/admin/ui";

export default function ContactNotFound() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <EmptyState
        icon={<Users />}
        title="Contact not found"
        description="This contact doesn't exist or may have been deleted."
        action={
          <Link href="/admin/contacts" className={buttonClasses("secondary")}>
            Back to contacts
          </Link>
        }
      />
    </div>
  );
}
