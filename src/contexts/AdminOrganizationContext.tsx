"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  switchAdminOrganization,
  switchToAdminContext,
  type AdminOrganizationState,
  type OrganizationSwitcherItem,
} from "@/app/actions/organization-context";
import { ADMIN_CONTEXT_LABEL } from "@/lib/auth/super-admin";

type AdminOrganizationContextValue = {
  organizationId: string | null;
  organizationName: string | null;
  organizations: OrganizationSwitcherItem[];
  isSuperAdmin: boolean;
  isAdminContext: boolean;
  /** Incremented on each switch — remount data panels to refetch scoped data. */
  switchVersion: number;
  isSwitching: boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
  switchToAdmin: () => Promise<void>;
  setOrganizations: (orgs: OrganizationSwitcherItem[]) => void;
};

const AdminOrganizationContext = createContext<AdminOrganizationContextValue | null>(null);

export function AdminOrganizationProvider({
  initial,
  children,
}: {
  initial: AdminOrganizationState;
  children: ReactNode;
}) {
  const [organizationId, setOrganizationId] = useState(initial.organizationId);
  const [organizationName, setOrganizationName] = useState(initial.organizationName);
  const [organizations, setOrganizations] = useState(initial.organizations);
  const [isSuperAdmin] = useState(initial.isSuperAdmin);
  const [isAdminContext, setIsAdminContext] = useState(initial.isAdminContext);
  const [switchVersion, setSwitchVersion] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);

  const switchToAdmin = useCallback(async () => {
    if (!isSuperAdmin || isAdminContext) return;

    setIsSwitching(true);
    try {
      const result = await switchToAdminContext();
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("success" in result && result.success) {
        setOrganizationId(null);
        setOrganizationName(ADMIN_CONTEXT_LABEL);
        setIsAdminContext(true);
        setSwitchVersion((v) => v + 1);
      }
    } catch {
      toast.error("Unable to switch to Admin context");
    } finally {
      setIsSwitching(false);
    }
  }, [isSuperAdmin, isAdminContext]);

  const switchOrganization = useCallback(
    async (nextId: string) => {
      if (!nextId || nextId === organizationId) return;

      setIsSwitching(true);
      try {
        const result = await switchAdminOrganization(nextId);
        if ("error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        if ("success" in result && result.success) {
          setOrganizationId(result.organizationId);
          setOrganizationName(result.organizationName);
          setIsAdminContext(false);
          setSwitchVersion((v) => v + 1);
        }
      } catch {
        toast.error("Unable to switch organization");
      } finally {
        setIsSwitching(false);
      }
    },
    [organizationId]
  );

  const value = useMemo(
    () => ({
      organizationId,
      organizationName,
      organizations,
      isSuperAdmin,
      isAdminContext,
      switchVersion,
      isSwitching,
      switchOrganization,
      switchToAdmin,
      setOrganizations,
    }),
    [
      organizationId,
      organizationName,
      organizations,
      isSuperAdmin,
      isAdminContext,
      switchVersion,
      isSwitching,
      switchOrganization,
      switchToAdmin,
    ]
  );

  return (
    <AdminOrganizationContext.Provider value={value}>
      {children}
    </AdminOrganizationContext.Provider>
  );
}

export function useAdminOrganization() {
  const ctx = useContext(AdminOrganizationContext);
  if (!ctx) {
    throw new Error("useAdminOrganization must be used within AdminOrganizationProvider");
  }
  return ctx;
}
