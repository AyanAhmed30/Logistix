"use client";

import { useEffect } from "react";
import { SessionExpiredModal } from "@/components/auth/SessionExpiredModal";
import { SESSION_EXPIRED_STORAGE_KEY } from "@/lib/auth/session-config";

export default function SessionExpiredPage() {
  useEffect(() => {
    try {
      localStorage.removeItem(SESSION_EXPIRED_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <SessionExpiredModal
        open
        onLogin={() => {
          window.location.href = "/login";
        }}
        showCloseButton={false}
      />
    </div>
  );
}
