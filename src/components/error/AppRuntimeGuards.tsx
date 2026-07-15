"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/safe-async";
import { isNextControlFlowError } from "@/lib/next-errors";

/**
 * Catches unhandled promise rejections so they surface as toasts instead of
 * leaving the app in a broken state.
 *
 * Next.js redirect()/notFound() throw control-flow errors — those must be ignored.
 */
export function AppRuntimeGuards() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isNextControlFlowError(event.reason)) {
        // Successful navigation via redirect() — do not toast or log as an error.
        return;
      }

      event.preventDefault();
      const message = getErrorMessage(
        event.reason,
        "An unexpected error occurred. Please try again."
      );
      console.error("[unhandledrejection]", event.reason);
      toast.error(message);
    }

    function onWindowError(event: ErrorEvent) {
      if (isNextControlFlowError(event.error) || isNextControlFlowError(event.message)) {
        return;
      }
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
