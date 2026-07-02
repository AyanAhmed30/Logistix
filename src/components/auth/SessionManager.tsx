"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession } from "@/app/actions/session";
import { SessionExpiredModal } from "@/components/auth/SessionExpiredModal";
import {
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
  const lastActivityRef = useRef(Date.now());
  const lastRefreshRef = useRef(0);
  const expiredShownRef = useRef(false);

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

    const result = await refreshSession();
    if ("expired" in result && result.expired) {
      showExpired();
      return;
    }
    if ("success" in result && result.success) {
      lastRefreshRef.current = Date.now();
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
    void tryRefresh();

    const onActivity = () => {
      recordActivity();
      if (Date.now() - lastRefreshRef.current >= SESSION_REFRESH_THROTTLE_MS) {
        void tryRefresh();
      }
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [recordActivity, tryRefresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= CLIENT_INACTIVITY_TIMEOUT_MS) {
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
