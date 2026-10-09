"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/admin/ui";

export default function ValidateBeforeYouBuildError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[validate-before-you-build] route error:", error.digest ?? error.name);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't load Validate Before You Build"
      message="Something went wrong loading this page. If the module was just enabled, check that the 20260914090000_validate_before_you_build migration has been applied and SUPABASE_SERVICE_ROLE_KEY is set."
      onRetry={reset}
    />
  );
}
