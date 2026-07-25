"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DashboardAccessState } from "@/lib/dashboard-access";

const DashboardAccessContext = createContext<DashboardAccessState | null>(null);

export function DashboardAccessProvider({
  access,
  children,
}: {
  access: DashboardAccessState;
  children: ReactNode;
}) {
  return (
    <DashboardAccessContext.Provider value={access}>
      {children}
    </DashboardAccessContext.Provider>
  );
}

export function useDashboardAccess(): DashboardAccessState {
  const ctx = useContext(DashboardAccessContext);
  if (!ctx) {
    throw new Error("useDashboardAccess must be used within DashboardAccessProvider");
  }
  return ctx;
}
