"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function OpportunityDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[opportunities/:id] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <ErrorState title="Couldn't load this opportunity" message="Something went wrong. Please try again." onRetry={reset} />
    </div>
  );
}
