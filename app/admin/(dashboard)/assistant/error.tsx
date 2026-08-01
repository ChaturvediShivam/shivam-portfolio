"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function AssistantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[assistant] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <ErrorState
        title="Couldn't load the assistant"
        message="Something went wrong loading this page. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
