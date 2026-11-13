"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession } from "@/app/actions/session";
import { SessionExpiredModal } from "@/components/auth/SessionExpiredModal";
import {
  ACTIVITY_HEARTBEAT_MS,
  ACTIVITY_INTERACTION_WINDOW_MS,
  CLIENT_INACTIVITY_TIMEOUT_MS,
  SESSION_EXPIRED_STORAGE_KEY,
  SESSION_HEALTH_CHECK_MS,
  SESSION_REFRESH_THROTTLE_MS,
} from "@/lib/auth/session-config";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"] as const;

function isUnauthorizedResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    (result as { error?: string }).error === "Unauthorized"
  );
}

/**
 * Tracks user activity, keeps the session alive while the user is working,
 * and shows a single Session Expired dialog when the session ends.
 */
export function SessionManager() {
  const [expired, setExpired] = useState(false);
  const lastActivityRef = useRef(0);
  const lastRefreshRef = useRef(0);
  const expiredShownRef = useRef(false);
  // Sales agent sessions (set by the server): shorter limit, heartbeat only on real use.
  const trackedRef = useRef(false);
  const idleTimeoutRef = useRef(CLIENT_INACTIVITY_TIMEOUT_MS);

  const showExpired = useCallback(() => {
    if (expiredShownRef.current) return;
    expiredShownRef.current = true;
    setExpired(true);
    try {
      localStorage.setItem(SESSION_EXPIRED_STORAGE_KEY, String(Date.now()));
    } catch {
      // Ignore storage errors (private browsing, etc.)
    }
  }, []);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const tryRefresh = useCallback(async () => {
    if (expiredShownRef.current) return;

    let result: Awaited<ReturnType<typeof refreshSession>>;
    // Working = this tab is visible and the user did something recently.
    const interacted =
      document.visibilityState === "visible" &&
      Date.now() - lastActivityRef.current <= ACTIVITY_INTERACTION_WINDOW_MS;
    try {
      result = await refreshSession({ interacted });
    } catch (error) {
      // Offline or mid-deployment. The session itself is fine, so try again next tick.
      console.error("[session-refresh]", error);
      return;
    }
    if ("expired" in result && result.expired) {
      showExpired();
      return;
    }
    if ("success" in result && result.success) {
      trackedRef.current = Boolean(result.tracked);
      if (result.tracked && result.idleTimeoutMs) idleTimeoutRef.current = result.idleTimeoutMs;
      // A tracked heartbeat only counts when the agent was working.
      if (!result.tracked || interacted) lastRefreshRef.current = Date.now();
    }
  }, [showExpired]);

  const handleLogin = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_EXPIRED_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    window.location.href = "/login";
  }, []);

  const handleClose = useCallback(() => {
    setExpired(false);
  }, []);

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Defer first refresh so it does not compete with dashboard first paint after login.
    const initialRefreshTimer = window.setTimeout(() => {
      void tryRefresh();
    }, 2500);

    const onActivity = () => {
      recordActivity();
      const throttle = trackedRef.current ? ACTIVITY_HEARTBEAT_MS : SESSION_REFRESH_THROTTLE_MS;
      if (Date.now() - lastRefreshRef.current >= throttle) {
        void tryRefresh();
      }
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    return () => {
      window.clearTimeout(initialRefreshTimer);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [recordActivity, tryRefresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= idleTimeoutRef.current) {
        showExpired();
        return;
      }
      if (document.visibilityState === "visible") {
        void tryRefresh();
      }
    }, SESSION_HEALTH_CHECK_MS);

    return () => window.clearInterval(interval);
  }, [showExpired, tryRefresh]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_EXPIRED_STORAGE_KEY) {
        showExpired();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [showExpired]);

  useEffect(() => {
    const onSessionExpired = () => {
      showExpired();
    };
    window.addEventListener("logistix-session-expired", onSessionExpired);
    return () => window.removeEventListener("logistix-session-expired", onSessionExpired);
  }, [showExpired]);

  return (
    <SessionExpiredModal
      open={expired}
      onLogin={handleLogin}
      onClose={handleClose}
      showCloseButton
    />
  );
}

/** Call from client code when a server action returns Unauthorized. */
export function handlePossibleSessionExpiry(result: unknown): boolean {
  if (isUnauthorizedResult(result)) {
    try {
      localStorage.setItem(SESSION_EXPIRED_STORAGE_KEY, String(Date.now()));
    } catch {
      // Ignore storage errors
    }
    window.dispatchEvent(new Event("logistix-session-expired"));
    return true;
  }
  return false;
}
