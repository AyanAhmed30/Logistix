"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error/ErrorFallback";
import { reloadIfStaleClient } from "@/lib/client-recovery";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
    reloadIfStaleClient(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <ErrorFallback
        title="This page ran into a problem"
        description="Something went wrong while loading this section. You can try again or return to your dashboard."
        onRetry={reset}
        onGoHome={() => {
          window.location.assign("/");
        }}
      />
    </div>
  );
}
