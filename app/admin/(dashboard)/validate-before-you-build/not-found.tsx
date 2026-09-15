import Link from "next/link";
import { EmptyState, buttonClasses } from "@/components/admin/ui";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";

export default function NotFound() {
  return (
    <EmptyState
      title="Not found"
      description="That record doesn't exist, or the link is out of date."
      action={
        <Link href={VBYB_BASE_PATH} className={buttonClasses("secondary", "sm")}>
          Back to overview
        </Link>
      }
    />
  );
}
