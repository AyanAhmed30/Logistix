"use client";

import { PortalOrganizationProvider } from "@/contexts/PortalOrganizationContext";
import type { AdminOrganizationState } from "@/app/actions/organization-context";
import type { Organization } from "@/app/actions/organizations";
import { PortalUserDashboardShell } from "@/components/user/PortalUserDashboardShell";

type Props = {
  username: string;
  permissions: string[];
  initialOrganizationState: AdminOrganizationState;
  initialOrganization?: Organization | null;
};

export function PortalUserDashboardWithOrganization(props: Props) {
  return (
    <PortalOrganizationProvider
      initial={props.initialOrganizationState}
      initialOrganization={props.initialOrganization ?? null}
    >
      <PortalUserDashboardShell
        username={props.username}
        permissions={props.permissions}
      />
    </PortalOrganizationProvider>
  );
}
