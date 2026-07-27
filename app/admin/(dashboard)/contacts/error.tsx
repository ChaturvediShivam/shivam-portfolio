"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function ContactsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[contacts] route error:", error);
  }, [error]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <ErrorState
        title="Couldn't load contacts"
        message="Something went wrong loading this page. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
