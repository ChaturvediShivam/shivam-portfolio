"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[analytics] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <ErrorState title="Couldn't load analytics" message="Something went wrong. Please try again." onRetry={reset} />
    </div>
  );
}
