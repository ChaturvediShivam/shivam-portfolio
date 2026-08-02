"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function ResumeAiError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[resume-ai] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <ErrorState
        title="Couldn't load Resume AI"
        message="Something went wrong loading this page. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
