import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmptyState, buttonClasses } from "@/components/admin/ui";

export default function CompanyNotFound() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <EmptyState
        icon={<Building2 />}
        title="Company not found"
        description="This company doesn't exist or may have been deleted."
        action={
          <Link href="/admin/companies" className={buttonClasses("secondary")}>
            Back to companies
          </Link>
        }
      />
    </div>
  );
}
