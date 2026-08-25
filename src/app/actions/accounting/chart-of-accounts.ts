'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import {
  requireAccountingActionAccess,
  sessionHasAccountingAccess,
} from '@/lib/accounting-page-access';
import {
  accountsToCsv,
  defaultAccountTypeForClassification,
  getCoaNormalBalance,
  normalizeCoaCode,
  parseCoaCsv,
  type CoaAccountType,
  type CoaClassification,
} from '@/lib/accounting-chart-of-accounts';

export type AccountingCoaListItem = {
  id: string;
  code: string;
  name: string;
  type: CoaClassification;
  account_type: CoaAccountType | null;
  parent_id: string | null;
  parent_code: string | null;
  parent_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  allow_reconciliation: boolean;
  is_active: boolean;
  default_tax_id: string | null;
  notes: string | null;
  bank_account_number: string | null;
  bank_currency: string | null;
  updated_at: string;
  depth: number;
  can_post: boolean;
  normal_balance: 'debit' | 'credit' | 'none';
};

export type AccountingCoaDetail = AccountingCoaListItem & {
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
  child_count: number;
};

const VALID_CLASS: CoaClassification[] = [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
  'view',
];

async function resolveCoaScope(opts?: { config?: boolean }) {
  let session: Awaited<ReturnType<typeof getSession>> = null;

  if (opts?.config) {
    const access = await requireAccountingActionAccess({ config: true });
    if ('error' in access && access.error) return { error: access.error };
    session = access.session;
  } else {
    session = await getSession();
    if (!session || !sessionHasAccountingAccess(session)) {
      return { error: 'Unauthorized' as const };
    }
  }

  if (!session) return { error: 'Unauthorized' as const };

  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );

  if (!sessionUsesOrganizationScope(session.role)) {
    return {
      session,
      organizationId: null as string | null,
      isGlobalAdminView: false,
    };
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

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

function mapRow(
  r: Record<string, unknown>,
  extras?: {
    parent_code?: string | null;
    parent_name?: string | null;
    organization_name?: string | null;
    depth?: number;
  }
): AccountingCoaListItem {
  const type = String(r.type || 'expense') as CoaClassification;
  return {
    id: String(r.id),
    code: String(r.code || ''),
    name: String(r.name || ''),
    type,
    account_type: (r.account_type ? String(r.account_type) : null) as CoaAccountType | null,
    parent_id: r.parent_id ? String(r.parent_id) : null,
    parent_code: extras?.parent_code ?? null,
    parent_name: extras?.parent_name ?? null,
    organization_id: r.organization_id ? String(r.organization_id) : null,
    organization_name: extras?.organization_name ?? null,
    allow_reconciliation: Boolean(r.allow_reconciliation),
    is_active: r.is_active !== false,
    default_tax_id: r.default_tax_id ? String(r.default_tax_id) : null,
    notes: r.notes ? String(r.notes) : null,
    bank_account_number: r.bank_account_number
      ? String(r.bank_account_number)
      : null,
    bank_currency: r.bank_currency ? String(r.bank_currency) : null,
    updated_at: String(r.updated_at || ''),
    depth: extras?.depth ?? 0,
    can_post: type !== 'view',
    normal_balance: getCoaNormalBalance(type),
  };
}

/** List accounts for Configuration UI (includes views + archived when filtered). */
export async function getAccountingCoaAccounts(opts?: {
  search?: string;
  classification?: string;
  accountType?: string;
  status?: 'all' | 'active' | 'archived';
  groupBy?: 'none' | 'classification' | 'account_type' | 'organization';
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveCoaScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { accounts: [] as AccountingCoaListItem[], total: 0, page: 1, pageSize: 50 };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize || 50));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('chart_of_accounts')
      .select('*', { count: 'exact' })
      .order('code', { ascending: true })
      .range(from, to);

    // Shared (null org) + selected org
    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const status = opts?.status || 'active';
    if (status === 'active') q = q.eq('is_active', true);
    if (status === 'archived') q = q.eq('is_active', false);

    const classification = String(opts?.classification || '').trim();
    if (classification && classification !== 'all') {
      q = q.eq('type', classification);
    }

    const accountType = String(opts?.accountType || '').trim();
    if (accountType && accountType !== 'all') {
      q = q.eq('account_type', accountType);
    }

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error, count } = await q;
    if (error) {
      if (/account_type|organization_id|column/i.test(error.message)) {
        return {
          accounts: [] as AccountingCoaListItem[],
          total: 0,
          page,
          pageSize,
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const parentIds = [
      ...new Set(rows.map((r) => String(r.parent_id || '')).filter(Boolean)),
    ];
    const orgIds = [
      ...new Set(rows.map((r) => String(r.organization_id || '')).filter(Boolean)),
    ];

    const [{ data: parents }, { data: orgs }] = await Promise.all([
      parentIds.length
        ? supabase.from('chart_of_accounts').select('id, code, name').in('id', parentIds)
        : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
      orgIds.length
        ? supabase.from('organizations').select('id, name').in('id', orgIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const pMap = new Map(
      (parents || []).map((p) => [String(p.id), { code: String(p.code), name: String(p.name) }])
    );
    const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

    const accounts = rows.map((r) => {
      const parent = r.parent_id ? pMap.get(String(r.parent_id)) : null;
      return mapRow(r as Record<string, unknown>, {
        parent_code: parent?.code ?? null,
        parent_name: parent?.name ?? null,
        organization_name: r.organization_id
          ? oMap.get(String(r.organization_id)) || null
          : 'Shared',
        depth: r.parent_id ? 1 : 0,
      });
    });

    return { accounts, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load chart of accounts',
    };
  }
}

/**
 * Lightweight picker for JE / invoice / asset forms.
 * Active, postable accounts only. Shared + org scoped.
 */
export async function searchAccountingPostableAccounts(opts?: {
  search?: string;
  types?: CoaClassification[];
  reconcileOnly?: boolean;
  limit?: number;
}) {
  try {
    const scope = await resolveCoaScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let q = supabase
      .from('chart_of_accounts')
      .select('id, code, name, type, account_type, allow_reconciliation')
      .eq('is_active', true)
      .neq('type', 'view')
      .order('code', { ascending: true })
      .limit(Math.min(200, Math.max(1, opts?.limit || 80)));

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    if (opts?.types?.length) {
      q = q.in('type', opts.types);
    }
    if (opts?.reconcileOnly) {
      q = q.eq('allow_reconciliation', true);
    }

    const needle = String(opts?.search || '').trim();
    if (needle) {
      q = q.or(`code.ilike.%${needle}%,name.ilike.%${needle}%`);
    }

    const { data, error } = await q;
    if (error) return { error: error.message };
    return { accounts: data || [] };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to search accounts',
    };
  }
}

export async function getAccountingCoaAccountDetail(accountId: string) {
  try {
    const scope = await resolveCoaScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Account not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Account not in the selected organization' };
    }

    const [{ data: parent }, { data: org }, { count: childCount }] = await Promise.all([
      row.parent_id
        ? supabase
            .from('chart_of_accounts')
            .select('id, code, name')
            .eq('id', row.parent_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      row.organization_id
        ? supabase
            .from('organizations')
            .select('id, name')
            .eq('id', row.organization_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('chart_of_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', accountId),
    ]);

    const base = mapRow(row as Record<string, unknown>, {
      parent_code: parent?.code ? String(parent.code) : null,
      parent_name: parent?.name ? String(parent.name) : null,
      organization_name: org?.name
        ? String(org.name)
        : row.organization_id
          ? null
          : 'Shared',
      depth: row.parent_id ? 1 : 0,
    });

    const detail: AccountingCoaDetail = {
      ...base,
      created_at: String(row.created_at || ''),
      created_by: row.created_by ? String(row.created_by) : null,
      updated_by: row.updated_by ? String(row.updated_by) : null,
      child_count: childCount || 0,
    };

    return { account: detail };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load account',
    };
  }
}

export async function getAccountingCoaParentOptions(opts?: {
  classification?: string;
  excludeId?: string;
}) {
  try {
    const scope = await resolveCoaScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let q = supabase
      .from('chart_of_accounts')
      .select('id, code, name, type')
      .eq('is_active', true)
      .eq('type', 'view')
      .order('code', { ascending: true });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    if (opts?.excludeId) q = q.neq('id', opts.excludeId);

    const { data, error } = await q;
    if (error) return { error: error.message };
    return { parents: data || [] };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load parents',
    };
  }
}

async function assertUniqueCode(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  code: string,
  organizationId: string | null,
  excludeId?: string
) {
  let q = supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('code', code)
    .limit(1);
  if (organizationId) {
    q = q.eq('organization_id', organizationId);
  } else {
    q = q.is('organization_id', null);
  }
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  if (data?.id) return 'Account code must be unique within the organization';
  return null;
}

async function validateParent(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  parentId: string | null,
  excludeId?: string
) {
  if (!parentId) return null;
  if (excludeId && parentId === excludeId) return 'Account cannot be its own parent';
  const { data: parent } = await supabase
    .from('chart_of_accounts')
    .select('id, type, is_active')
    .eq('id', parentId)
    .maybeSingle();
  if (!parent) return 'Parent account not found';
  if (!parent.is_active) return 'Parent account must be active';
  if (String(parent.type) !== 'view') {
    return 'Parent must be a View / Group account';
  }
  return null;
}

export async function createAccountingCoaAccount(payload: {
  code: string;
  name: string;
  type: CoaClassification;
  account_type?: CoaAccountType | null;
  parent_id?: string | null;
  allow_reconciliation?: boolean;
  default_tax_id?: string | null;
  notes?: string | null;
  bank_account_number?: string | null;
  bank_currency?: string | null;
  /** When true, create as org-specific; default shared template if no org */
  orgSpecific?: boolean;
}) {
  try {
    const scope = await resolveCoaScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const code = normalizeCoaCode(payload.code);
    const name = String(payload.name || '').trim();
    const type = payload.type;
    if (!code) return { error: 'Account code is required' };
    if (!name) return { error: 'Account name is required' };
    if (!VALID_CLASS.includes(type)) return { error: 'Invalid classification' };

    const accountType =
      type === 'view'
        ? 'view'
        : (payload.account_type || defaultAccountTypeForClassification(type));

    const organizationId =
      payload.orgSpecific && scope.organizationId ? scope.organizationId : null;

    if (payload.orgSpecific && !scope.organizationId) {
      return { error: 'Select an organization to create an organization-specific account' };
    }

    const supabase = await createAdminClient();
    const uniqueErr = await assertUniqueCode(supabase, code, organizationId);
    if (uniqueErr) return { error: uniqueErr };

    const parentId = payload.parent_id || null;
    const parentErr = await validateParent(supabase, parentId);
    if (parentErr) return { error: parentErr };

    const allowRecon =
      type === 'view' ? false : Boolean(payload.allow_reconciliation);

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert([
        {
          code,
          name,
          type,
          account_type: accountType,
          parent_id: parentId,
          organization_id: organizationId,
          allow_reconciliation: allowRecon,
          default_tax_id: payload.default_tax_id || null,
          notes: payload.notes || null,
          bank_account_number:
            accountType === 'bank'
              ? payload.bank_account_number?.trim() || null
              : null,
          bank_currency:
            accountType === 'bank'
              ? (payload.bank_currency || 'PKR').trim().toUpperCase() || 'PKR'
              : null,
          is_active: true,
          created_by: scope.session.username,
          updated_by: scope.session.username,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('id')
      .single();

    if (error) {
      if (/bank_account_number|bank_currency|column/i.test(error.message)) {
        const retry = await supabase
          .from('chart_of_accounts')
          .insert([
            {
              code,
              name,
              type,
              account_type: accountType,
              parent_id: parentId,
              organization_id: organizationId,
              allow_reconciliation: allowRecon,
              default_tax_id: payload.default_tax_id || null,
              notes: payload.notes || null,
              is_active: true,
              created_by: scope.session.username,
              updated_by: scope.session.username,
              updated_at: new Date().toISOString(),
            },
          ])
          .select('id')
          .single();
        if (retry.error) {
          if (/account_type|organization_id|column/i.test(retry.error.message)) {
            return {
              error:
                'Run enhance_accounting_chart_of_accounts_foundation.sql in Supabase first.',
            };
          }
          if (/unique|duplicate/i.test(retry.error.message)) {
            return { error: 'Account code must be unique within the organization' };
          }
          return { error: retry.error.message };
        }
        return { accountId: String(retry.data.id) };
      }
      if (/account_type|organization_id|column/i.test(error.message)) {
        return {
          error:
            'Run enhance_accounting_chart_of_accounts_foundation.sql in Supabase first.',
        };
      }
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Account code must be unique within the organization' };
      }
      return { error: error.message };
    }

    return { accountId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create account',
    };
  }
}

export async function updateAccountingCoaAccount(
  accountId: string,
  payload: {
    code?: string;
    name?: string;
    type?: CoaClassification;
    account_type?: CoaAccountType | null;
    parent_id?: string | null;
    allow_reconciliation?: boolean;
    default_tax_id?: string | null;
    notes?: string | null;
    bank_account_number?: string | null;
    bank_currency?: string | null;
    is_active?: boolean;
  }
) {
  try {
    const scope = await resolveCoaScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle();
    if (!existing) return { error: 'Account not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      existing.organization_id &&
      String(existing.organization_id) !== scope.organizationId
    ) {
      return { error: 'Account not in the selected organization' };
    }

    // Shared template edits allowed for Accounting Admin (config already gated)

    const patch: Record<string, unknown> = {
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) {
      const name = String(payload.name).trim();
      if (!name) return { error: 'Account name is required' };
      patch.name = name;
    }

    if (payload.code !== undefined) {
      const code = normalizeCoaCode(payload.code);
      if (!code) return { error: 'Account code is required' };
      const orgId = existing.organization_id
        ? String(existing.organization_id)
        : null;
      const uniqueErr = await assertUniqueCode(supabase, code, orgId, accountId);
      if (uniqueErr) return { error: uniqueErr };
      patch.code = code;
    }

    const nextType = (payload.type || String(existing.type)) as CoaClassification;
    if (payload.type !== undefined) {
      if (!VALID_CLASS.includes(payload.type)) return { error: 'Invalid classification' };
      patch.type = payload.type;
    }

    if (payload.account_type !== undefined || payload.type !== undefined) {
      patch.account_type =
        nextType === 'view'
          ? 'view'
          : payload.account_type ||
            existing.account_type ||
            defaultAccountTypeForClassification(nextType);
    }

    if (payload.parent_id !== undefined) {
      const parentErr = await validateParent(
        supabase,
        payload.parent_id || null,
        accountId
      );
      if (parentErr) return { error: parentErr };
      patch.parent_id = payload.parent_id || null;
    }

    if (payload.allow_reconciliation !== undefined) {
      patch.allow_reconciliation =
        nextType === 'view' ? false : Boolean(payload.allow_reconciliation);
    }

    if (payload.default_tax_id !== undefined) {
      patch.default_tax_id = payload.default_tax_id || null;
    }
    if (payload.notes !== undefined) patch.notes = payload.notes || null;
    if (payload.bank_account_number !== undefined) {
      patch.bank_account_number = payload.bank_account_number?.trim() || null;
    }
    if (payload.bank_currency !== undefined) {
      patch.bank_currency =
        payload.bank_currency?.trim().toUpperCase() || 'PKR';
    }

    if (payload.is_active !== undefined) {
      if (payload.is_active === false) {
        const { count } = await supabase
          .from('chart_of_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('parent_id', accountId)
          .eq('is_active', true);
        if ((count || 0) > 0) {
          return {
            error: 'Archive or move child accounts before archiving this account',
          };
        }
      }
      patch.is_active = payload.is_active;
    }

    const { error } = await supabase
      .from('chart_of_accounts')
      .update(patch)
      .eq('id', accountId);
    if (error) {
      if (/bank_account_number|bank_currency|column/i.test(error.message)) {
        delete patch.bank_account_number;
        delete patch.bank_currency;
        const retry = await supabase
          .from('chart_of_accounts')
          .update(patch)
          .eq('id', accountId);
        if (retry.error) {
          if (/unique|duplicate/i.test(retry.error.message)) {
            return { error: 'Account code must be unique within the organization' };
          }
          return { error: retry.error.message };
        }
      } else if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Account code must be unique within the organization' };
      } else {
        return { error: error.message };
      }
    }

    return getAccountingCoaAccountDetail(accountId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update account',
    };
  }
}

export async function archiveAccountingCoaAccount(accountId: string) {
  return updateAccountingCoaAccount(accountId, { is_active: false });
}

export async function restoreAccountingCoaAccount(accountId: string) {
  return updateAccountingCoaAccount(accountId, { is_active: true });
}

export async function exportAccountingCoaAccountsCsv() {
  try {
    const res = await getAccountingCoaAccounts({
      status: 'all',
      page: 1,
      pageSize: 5000,
    });
    if ('error' in res && res.error) return { error: res.error };
    const csv = accountsToCsv(
      (res.accounts || []).map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        account_type: a.account_type,
        parent_code: a.parent_code,
        allow_reconciliation: a.allow_reconciliation,
        is_active: a.is_active,
        notes: a.notes,
      }))
    );
    return { csv };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to export accounts',
    };
  }
}

export async function importAccountingCoaAccountsCsv(csvText: string) {
  try {
    const scope = await resolveCoaScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const rows = parseCoaCsv(csvText);
    if (!rows.length) return { error: 'No rows found in CSV' };

    const supabase = await createAdminClient();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    // Resolve parent codes after first pass — create leaves with parent_code in second pass
    for (const row of rows) {
      const code = normalizeCoaCode(row.code);
      const name = String(row.name || '').trim();
      const type = String(row.classification || '').toLowerCase() as CoaClassification;
      if (!code || !name) {
        errors.push(`Skipped row: missing code/name`);
        continue;
      }
      if (!VALID_CLASS.includes(type)) {
        errors.push(`${code}: invalid classification`);
        continue;
      }

      let parentId: string | null = null;
      if (row.parent_code) {
        const parentCode = normalizeCoaCode(row.parent_code);
        const { data: parent } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', parentCode)
          .is('organization_id', null)
          .maybeSingle();
        parentId = parent?.id ? String(parent.id) : null;
      }

      const accountType =
        type === 'view'
          ? 'view'
          : (row.account_type as CoaAccountType) ||
            defaultAccountTypeForClassification(type);

      const { data: existing } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', code)
        .is('organization_id', null)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('chart_of_accounts')
          .update({
            name,
            type,
            account_type: accountType,
            parent_id: parentId,
            allow_reconciliation:
              type === 'view' ? false : row.allow_reconciliation,
            is_active: row.is_active,
            notes: row.notes || null,
            updated_by: scope.session.username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) errors.push(`${code}: ${error.message}`);
        else updated += 1;
      } else {
        const { error } = await supabase.from('chart_of_accounts').insert([
          {
            code,
            name,
            type,
            account_type: accountType,
            parent_id: parentId,
            organization_id: null,
            allow_reconciliation:
              type === 'view' ? false : row.allow_reconciliation,
            is_active: row.is_active,
            notes: row.notes || null,
            created_by: scope.session.username,
            updated_by: scope.session.username,
          },
        ]);
        if (error) errors.push(`${code}: ${error.message}`);
        else created += 1;
      }
    }

    return { created, updated, errors };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to import accounts',
    };
  }
}
