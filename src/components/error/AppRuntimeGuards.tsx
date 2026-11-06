"use client";

import { useEffect } from "react";
import { showRefreshNeeded, toast } from "@/lib/app-toast";
import { isNextControlFlowError } from "@/lib/next-errors";
import { getErrorMessage } from "@/lib/safe-async";
import { isStaleClientError } from "@/lib/user-facing-error";

/** A failure this soon after a click or key press is treated as the user's own action. */
const USER_ACTION_WINDOW_MS = 30_000;

/**
 * Last-resort handler for failures nothing else caught. Everything is logged, but
 * only a failure that follows the user's own action reaches the screen, so polling
 * and other background work can never raise a popup.
 *
 * Next.js redirect()/notFound() throw control-flow errors — those must be ignored.
 */
export function AppRuntimeGuards() {
  useEffect(() => {
    let lastUserAction = 0;

    function onUserAction() {
      lastUserAction = Date.now();
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isNextControlFlowError(event.reason)) {
        // Successful navigation via redirect() — do not toast or log as an error.
        return;
      }

      event.preventDefault();
      console.error("[unhandledrejection]", event.reason);

      if (Date.now() - lastUserAction > USER_ACTION_WINDOW_MS) return;
      if (isStaleClientError(event.reason)) {
        showRefreshNeeded();
        return;
      }
      toast.error(getErrorMessage(event.reason));
    }

    function onWindowError(event: ErrorEvent) {
      if (isNextControlFlowError(event.error) || isNextControlFlowError(event.message)) {
        return;
      }
      console.error("[window.error]", event.error ?? event.message);
    }

    window.addEventListener("pointerdown", onUserAction, { capture: true, passive: true });
    window.addEventListener("keydown", onUserAction, { capture: true, passive: true });
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onWindowError);

    return () => {
      window.removeEventListener("pointerdown", onUserAction, { capture: true });
      window.removeEventListener("keydown", onUserAction, { capture: true });
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onWindowError);
    };
  }, []);

  return null;
}
