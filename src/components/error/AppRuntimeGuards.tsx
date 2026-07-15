"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/safe-async";

/**
 * Catches unhandled promise rejections so they surface as toasts instead of
 * leaving the app in a broken state.
 */
export function AppRuntimeGuards() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      event.preventDefault();
      const message = getErrorMessage(
        event.reason,
        "An unexpected error occurred. Please try again."
      );
      console.error("[unhandledrejection]", event.reason);
      toast.error(message);
    }

    function onWindowError(event: ErrorEvent) {
      console.error("[window.error]", event.error ?? event.message);
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onWindowError);

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onWindowError);
    };
  }, []);

  return null;
}
