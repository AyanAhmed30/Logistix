"use client";

import { usePathname } from "next/navigation";
import { SessionManager } from "@/components/auth/SessionManager";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/session-expired") return true;
  if (pathname.startsWith("/carton/") || pathname.startsWith("/scan/")) return true;
  return false;
}

/** Mounts session lifecycle handling on all authenticated app routes. */
export function AuthSessionGuard() {
  const pathname = usePathname();

  if (isPublicPath(pathname)) {
    return null;
  }

  return <SessionManager />;
}
