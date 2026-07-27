"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <ErrorState title="Couldn't load the dashboard" message="Something went wrong. Please try again." onRetry={reset} />
    </div>
  );
}
