'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';

export type OrganizationBankAccount = {
  id: string;
  code: string;
  name: string;
  /** Full number — never expose in UI lists; use account_mask. */
  account_number: string | null;
  account_mask: string | null;
  currency: string;
  organization_id: string | null;
  is_active: boolean;
  /** Compact label for selects */
  label: string;
};

function maskAccountNumber(value: string | null | undefined): string | null {
  const raw = String(value || '').replace(/\s+/g, '');
  if (!raw) return null;
  const last = raw.slice(-4);
  return `****${last}`;
}

function buildLabel(row: {
  name: string;
  code: string;
  account_mask: string | null;
  currency: string;
}) {
  const parts = [row.name || row.code];
  if (row.account_mask) parts.push(row.account_mask);
  if (row.currency) parts.push(row.currency);
  return parts.filter(Boolean).join(' · ');
}

async function resolveScope() {
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
    return { error: 'Select an organization from the header switcher.' };
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

function mapBankRow(r: Record<string, unknown>): OrganizationBankAccount {
  const name = String(r.name || '');
  const code = String(r.code || '');
  const account_number = r.bank_account_number
    ? String(r.bank_account_number)
    : null;
  const account_mask = maskAccountNumber(account_number);
  const currency = String(r.bank_currency || 'PKR').toUpperCase() || 'PKR';
  return {
    id: String(r.id),
    code,
    name,
    account_number,
    account_mask,
    currency,
    organization_id: r.organization_id ? String(r.organization_id) : null,
    is_active: r.is_active !== false,
    label: buildLabel({ name, code, account_mask, currency }),
  };
}

/**
 * Active company bank accounts for the current organization.
 * Source of truth: Chart of Accounts (account_type = 'bank').
 */
export async function listOrganizationBankAccounts(opts?: {
  search?: string;
  includeInactive?: boolean;
  limit?: number;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) return { accounts: [] as OrganizationBankAccount[] };

    const supabase = await createAdminClient();
    const limit = Math.min(100, Math.max(10, opts?.limit || 50));
    const search = String(opts?.search || '').trim();

    let q = supabase
      .from('chart_of_accounts')
      .select(
        'id, code, name, organization_id, is_active, bank_account_number, bank_currency, account_type'
      )
      .eq('account_type', 'bank')
      .neq('type', 'view')
      .order('code', { ascending: true })
      .limit(limit);

    if (!opts?.includeInactive) {
      q = q.eq('is_active', true);
    }

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    if (search) {
      q = q.or(
        `code.ilike.%${search}%,name.ilike.%${search}%,bank_account_number.ilike.%${search}%`
      );
    }

    const { data, error } = await q;
    if (error) {
      if (/bank_account_number|bank_currency|account_type|column/i.test(error.message)) {
        let legacy = supabase
          .from('chart_of_accounts')
          .select('id, code, name, organization_id, is_active, type')
          .eq('is_active', true)
          .neq('type', 'view')
          .ilike('name', '%bank%')
          .order('code', { ascending: true })
          .limit(limit);

        if (scope.organizationId && !scope.isGlobalAdminView) {
          legacy = legacy.or(
            `organization_id.eq.${scope.organizationId},organization_id.is.null`
          );
        }

        const legacyRes = await legacy;
        if (legacyRes.error) {
          const byCode = await supabase
            .from('chart_of_accounts')
            .select('id, code, name, is_active')
            .eq('is_active', true)
            .in('code', ['1200', '1002', '1010'])
            .order('code', { ascending: true })
            .limit(limit);
          if (byCode.error) return { error: byCode.error.message };
          return {
            accounts: (byCode.data || []).map((r) =>
              mapBankRow({ ...r, bank_account_number: null, bank_currency: 'PKR' })
            ),
            migrationRequired: true as const,
          };
        }
        return {
          accounts: (legacyRes.data || []).map((r) =>
            mapBankRow({ ...r, bank_account_number: null, bank_currency: 'PKR' })
          ),
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    return { accounts: (data || []).map((r) => mapBankRow(r as Record<string, unknown>)) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load bank accounts',
    };
  }
}

export async function getOrganizationBankAccountById(accountId: string) {
  try {
    if (!accountId) return { account: null };
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select(
        'id, code, name, organization_id, is_active, bank_account_number, bank_currency, account_type'
      )
      .eq('id', accountId)
      .maybeSingle();

    if (error) {
      if (/bank_account_number|bank_currency|column/i.test(error.message)) {
        const legacy = await supabase
          .from('chart_of_accounts')
          .select('id, code, name, organization_id, is_active')
          .eq('id', accountId)
          .maybeSingle();
        if (legacy.error || !legacy.data) return { account: null };
        return {
          account: mapBankRow({
            ...legacy.data,
            bank_account_number: null,
            bank_currency: 'PKR',
          }),
        };
      }
      return { error: error.message };
    }
    if (!data) return { account: null };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      data.organization_id &&
      String(data.organization_id) !== scope.organizationId
    ) {
      return { error: 'Bank account not found in the selected organization' };
    }

    return { account: mapBankRow(data as Record<string, unknown>) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load bank account',
    };
  }
}
