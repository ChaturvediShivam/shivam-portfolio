"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function CompanyDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[companies/:id] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <ErrorState
        title="Couldn't load this company"
        message="Something went wrong. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
