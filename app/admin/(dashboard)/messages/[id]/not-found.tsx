import Link from "next/link";
import { Mail } from "lucide-react";
import { EmptyState, buttonClasses } from "@/components/admin/ui";

export default function MessageNotFound() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <EmptyState
        icon={<Mail />}
        title="Message not found"
        description="This message doesn't exist or may have been deleted."
        action={
          <Link href="/admin/messages" className={buttonClasses("secondary")}>
            Back to messages
          </Link>
        }
      />
    </div>
  );
}
