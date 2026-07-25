import type { SessionPayload } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { createAdminClient } from '@/utils/supabase/server';
import { resolveSalesAgentForSession } from '@/lib/legacy-user-bridge';
import {
  getSalesAccessLevel,
  hasSalesAccess,
} from '@/lib/module-permissions';
import { resolveSalesAccessRole, salesRoleSeesAllOrgRecords } from '@/lib/sales-roles';

/**
 * CRM record visibility (aligned with Odoo Sales access levels):
 * - all: Super Admin, Sales Administrator, User: All Documents
 * - assigned: User: Own Documents Only (salesperson_id OR created_by)
 */
export type CrmVisibilityScope =
  | { mode: 'all'; session: SessionPayload; salesAgentId: string | null }
  | { mode: 'assigned'; session: SessionPayload; salesAgentId: string | null };

export async function resolveCrmVisibilityScope(
  session: SessionPayload
): Promise<CrmVisibilityScope> {
  const supabase = await createAdminClient();
  const agent = await resolveSalesAgentForSession(supabase, session);
  const salesAgentId = agent?.id ?? null;

  if (isSuperAdminSession(session)) {
    return { mode: 'all', session, salesAgentId };
  }

  const salesRole = resolveSalesAccessRole(session);
  if (salesRoleSeesAllOrgRecords(salesRole)) {
    return { mode: 'all', session, salesAgentId };
  }

  const level = getSalesAccessLevel(session.permissions || []);
  if (level === 'own') {
    return { mode: 'assigned', session, salesAgentId };
  }

  if (
    (session.role === 'organization' || session.appUserRole === 'administrator') &&
    (hasSalesAccess(session.permissions) || session.role === 'organization')
  ) {
    return { mode: 'all', session, salesAgentId };
  }

  if (session.role === 'admin') {
    return { mode: 'all', session, salesAgentId };
  }

  // CRM-only users without Sales access level → org-wide within active company
  if (!hasSalesAccess(session.permissions)) {
    return { mode: 'all', session, salesAgentId };
  }

  // Remaining Sales users without Own Documents → treat as org-wide for CRM pipeline
  return { mode: 'all', session, salesAgentId };
}

/** Apply salesperson / creator visibility onto a query with salesperson_id + created_by. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCrmVisibilityFilter<T = any>(
  query: T,
  visibility: CrmVisibilityScope
): T {
  if (visibility.mode !== 'assigned') return query;

  const username = String(visibility.session.username || '').trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any;
  if (visibility.salesAgentId && username) {
    return q.or(
      `salesperson_id.eq.${visibility.salesAgentId},created_by.eq.${username}`
    ) as T;
  }
  if (visibility.salesAgentId) {
    return q.eq('salesperson_id', visibility.salesAgentId) as T;
  }
  if (username) {
    return q.eq('created_by', username) as T;
  }
  // No identity to scope — return empty set rather than leaking all org records
  return q.eq('id', '00000000-0000-0000-0000-000000000000') as T;
}

export function canAccessCrmOpportunityRow(
  visibility: CrmVisibilityScope,
  row: { salesperson_id?: string | null; created_by?: string | null }
): boolean {
  if (visibility.mode === 'all') return true;
  const username = String(visibility.session.username || '').trim();
  if (
    visibility.salesAgentId &&
    String(row.salesperson_id || '') === visibility.salesAgentId
  ) {
    return true;
  }
  if (username && String(row.created_by || '') === username) {
    return true;
  }
  return false;
}

export async function writeCrmAuditLog(input: {
  organizationId: string | null;
  entityType?: string;
  entityId?: string | null;
  action: string;
  performedBy: string;
  details?: Record<string, unknown>;
}) {
  try {
    const supabase = await createAdminClient();
    await supabase.from('crm_audit_logs').insert({
      organization_id: input.organizationId,
      entity_type: input.entityType || 'opportunity',
      entity_id: input.entityId || null,
      action: input.action,
      performed_by: input.performedBy,
      details: input.details || {},
    });
  } catch {
    // Audit table may not exist yet — never block primary flow
  }
}
