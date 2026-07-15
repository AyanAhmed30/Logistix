"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error/ErrorFallback";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <ErrorFallback
        title="This page ran into a problem"
        description="Something went wrong while loading this section. You can try again or return to your dashboard."
        errorMessage={error.message}
        onRetry={reset}
        onGoHome={() => {
          window.location.assign("/");
        }}
      />
    </div>
  );
}
