"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function MessageDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[messages/:id] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <ErrorState title="Couldn't load this message" message="Something went wrong. Please try again." onRetry={reset} />
    </div>
  );
}
