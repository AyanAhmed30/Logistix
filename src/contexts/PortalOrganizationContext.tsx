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
  getPortalOrganizationProfile,
  switchAdminOrganization,
  type AdminOrganizationState,
  type OrganizationSwitcherItem,
} from "@/app/actions/organization-context";
import type { Organization } from "@/app/actions/organizations";
import { invalidateCachedOperationsBootstrap } from "@/lib/operations-inquiries-cache";

type PortalOrganizationContextValue = {
  organizationId: string | null;
  organizationName: string | null;
  organizations: OrganizationSwitcherItem[];
  organization: Organization | null;
  canSwitch: boolean;
  switchVersion: number;
  isSwitching: boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
};

const PortalOrganizationContext = createContext<PortalOrganizationContextValue | null>(null);

export function PortalOrganizationProvider({
  initial,
  initialOrganization = null,
  children,
}: {
  initial: AdminOrganizationState;
  initialOrganization?: Organization | null;
  children: ReactNode;
}) {
  const [organizationId, setOrganizationId] = useState(initial.organizationId);
  const [organizationName, setOrganizationName] = useState(initial.organizationName);
  const [organizations] = useState(initial.organizations);
  const [organization, setOrganization] = useState<Organization | null>(initialOrganization);
  const [switchVersion, setSwitchVersion] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);

  const canSwitch = organizations.length > 1;

  const refreshOrganizationProfile = useCallback(async (nextId: string | null) => {
    if (!nextId) {
      setOrganization(null);
      return;
    }
    const result = await getPortalOrganizationProfile(nextId);
    if ("organization" in result && result.organization) {
      setOrganization(result.organization as Organization);
    }
  }, []);

  const switchOrganization = useCallback(
    async (nextId: string) => {
      if (!nextId || nextId === organizationId || !canSwitch) return;

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
          invalidateCachedOperationsBootstrap();
          await refreshOrganizationProfile(result.organizationId);
          setSwitchVersion((v) => v + 1);
        }
      } catch {
        toast.error("Unable to switch organization");
      } finally {
        setIsSwitching(false);
      }
    },
    [organizationId, canSwitch, refreshOrganizationProfile]
  );

  const value = useMemo(
    () => ({
      organizationId,
      organizationName,
      organizations,
      organization,
      canSwitch,
      switchVersion,
      isSwitching,
      switchOrganization,
    }),
    [
      organizationId,
      organizationName,
      organizations,
      organization,
      canSwitch,
      switchVersion,
      isSwitching,
      switchOrganization,
    ]
  );

  return (
    <PortalOrganizationContext.Provider value={value}>
      {children}
    </PortalOrganizationContext.Provider>
  );
}

export function usePortalOrganization() {
  const ctx = useContext(PortalOrganizationContext);
  if (!ctx) {
    throw new Error("usePortalOrganization must be used within PortalOrganizationProvider");
  }
  return ctx;
}
