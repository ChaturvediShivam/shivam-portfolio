"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function ContactDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[contacts/:id] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <ErrorState title="Couldn't load this contact" message="Something went wrong. Please try again." onRetry={reset} />
    </div>
  );
}
