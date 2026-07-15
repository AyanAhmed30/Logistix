"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error/ErrorFallback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F4F6F9] antialiased">
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
          <ErrorFallback
            title="Application error"
            description="Logistix Express encountered an unexpected problem. Your session is still active — try reloading this page."
            errorMessage={error.message}
            onRetry={reset}
            onGoHome={() => {
              window.location.assign("/");
            }}
          />
        </div>
      </body>
    </html>
  );
}
