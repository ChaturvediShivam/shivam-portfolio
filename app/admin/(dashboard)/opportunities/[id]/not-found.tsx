import Link from "next/link";
import { Briefcase } from "lucide-react";
import { EmptyState, buttonClasses } from "@/components/admin/ui";

export default function OpportunityNotFound() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <EmptyState
        icon={<Briefcase />}
        title="Opportunity not found"
        description="This opportunity doesn't exist or may have been deleted."
        action={
          <Link href="/admin/opportunities" className={buttonClasses("secondary")}>
            Back to opportunities
          </Link>
        }
      />
    </div>
  );
}
