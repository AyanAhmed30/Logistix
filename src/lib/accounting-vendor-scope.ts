/**
 * Shared org scope for Accounting Vendors (AP) server actions.
 */
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';

export async function resolveVendorAccountingScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session || !sessionHasAccountingAccess(session)) {
    return { error: 'Unauthorized' as const };
  }

  if (!sessionUsesOrganizationScope(session.role)) {
    return { session, organizationId: null as string | null, isGlobalAdminView: false };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return {
        session,
        organizationId: null as string | null,
        isGlobalAdminView: false,
        empty: true as const,
      };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return { session: scope.session, organizationId: null, isGlobalAdminView: true };
  }

  if (!scope.organizationId) {
    return { error: 'Select an organization from the header switcher.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

export function formatVendorAddress(row: {
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
} | null): string | null {
  if (!row) return null;
  const parts = [
    row.street,
    row.street2,
    [row.city, row.state].filter(Boolean).join(', '),
    row.zip,
    row.country,
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

export {
  computeBillLineTotal,
  computeBillTotals,
} from '@/lib/accounting-bill-math';
