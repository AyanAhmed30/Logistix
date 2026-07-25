'use server';

import type { CrmOrgScope } from '@/app/actions/crm/types';
import type { SessionPayload } from '@/lib/auth/session';

export async function resolveCrmOrganizationScope(): Promise<
  CrmOrgScope | { error: string }
> {
  const { requireAdminOrganizationScope } = await import('@/lib/admin-organization-context');
  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  if (!scope.organizationId) {
    if (isSuperAdminInAdminContext(scope.session)) {
      return {
        organizationId: null,
        session: scope.session,
        isGlobalAdminView: true,
      };
    }
    return {
      error: 'Select an organization from the header switcher to use CRM Pipeline.',
    };
  }

  return {
    organizationId: scope.organizationId,
    session: scope.session,
    isGlobalAdminView: false,
  };
}

/** Requires a specific organization (mutations, stage management, create). */
export async function requireCrmOrganizationScope(): Promise<
  { organizationId: string; session: SessionPayload } | { error: string }
> {
  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };
  if (scope.isGlobalAdminView) {
    return {
      error: 'Select a specific organization to perform this action, or switch from Admin context.',
    };
  }
  return { organizationId: scope.organizationId, session: scope.session };
}

export async function revalidateCrmPipelinePaths() {
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/crm/pipeline');
  revalidatePath('/crm/opportunities');
  revalidatePath('/crm/activities');
}
