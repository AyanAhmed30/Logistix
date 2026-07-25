import { redirect } from 'next/navigation';
import { getAdminOrganizationState } from '@/app/actions/organization-context';
import { buildDashboardAccessFromSession } from '@/lib/crm-page-access';
import { hasDepartmentAccess } from '@/lib/module-permissions';
import { CrmLayoutClient } from '@/components/crm/CrmLayoutClient';
import { ensureDefaultCrmStages } from '@/app/actions/crm/stages';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/login');

  if (!access.isSuperAdmin && !hasDepartmentAccess(access.permissions, 'crm')) {
    redirect('/access-denied');
  }

  const organizationState = await getAdminOrganizationState();

  // Seed default boards (New / Qualified / Proposition / Won) for the active company
  if (organizationState.organizationId) {
    await ensureDefaultCrmStages(organizationState.organizationId);
  }

  return (
    <CrmLayoutClient access={access} initialOrganizationState={organizationState}>
      {children}
    </CrmLayoutClient>
  );
}
