'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import {
  requireAccountingActionAccess,
  sessionHasAccountingAccess,
} from '@/lib/accounting-page-access';
import {
  normalizeTaxCode,
  taxMasterTypeLabel,
  type TaxAmountType,
  type TaxMasterType,
  type TaxScope,
} from '@/lib/accounting-tax-engine';

export type AccountingTaxListItem = {
  id: string;
  name: string;
  code: string;
  type: TaxMasterType;
  rate_type: 'percentage' | 'fixed';
  rate_value: number;
  amount_type: TaxAmountType;
  is_inclusive: boolean;
  scope: TaxScope | null;
  invoice_label: string | null;
  description: string | null;
  sequence: number;
  organization_id: string | null;
  organization_name: string | null;
  tax_group_id: string | null;
  tax_group_name: string | null;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  refund_account_id: string | null;
  is_active: boolean;
  updated_at: string;
};

export type AccountingTaxDetail = AccountingTaxListItem & {
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AccountingTaxGroupItem = {
  id: string;
  name: string;
  sequence: number;
  organization_id: string | null;
  is_active: boolean;
};

const VALID_TYPES: TaxMasterType[] = [
  'sales_tax',
  'purchase_tax',
  'withholding_tax',
];

async function resolveTaxScope(opts?: { config?: boolean }) {
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
    return {
      session: scope.session,
      organizationId: null as string | null,
      isGlobalAdminView: true,
    };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

function mapTax(
  r: Record<string, unknown>,
  extras?: {
    organization_name?: string | null;
    tax_group_name?: string | null;
    account_code?: string | null;
    account_name?: string | null;
  }
): AccountingTaxListItem {
  const rateType = String(r.rate_type || 'percentage') as 'percentage' | 'fixed';
  const amountType = (String(r.amount_type || '') === 'fixed' || rateType === 'fixed'
    ? 'fixed'
    : 'percent') as TaxAmountType;
  return {
    id: String(r.id),
    name: String(r.name || ''),
    code: String(r.code || ''),
    type: String(r.type || 'sales_tax') as TaxMasterType,
    rate_type: rateType,
    rate_value: Number(r.rate_value) || 0,
    amount_type: amountType,
    is_inclusive: Boolean(r.is_inclusive),
    scope: (r.scope ? String(r.scope) : null) as TaxScope | null,
    invoice_label: r.invoice_label ? String(r.invoice_label) : null,
    description: r.description ? String(r.description) : null,
    sequence: Number(r.sequence) || 10,
    organization_id: r.organization_id ? String(r.organization_id) : null,
    organization_name: extras?.organization_name ?? null,
    tax_group_id: r.tax_group_id ? String(r.tax_group_id) : null,
    tax_group_name: extras?.tax_group_name ?? null,
    account_id: r.account_id ? String(r.account_id) : null,
    account_code: extras?.account_code ?? null,
    account_name: extras?.account_name ?? null,
    refund_account_id: r.refund_account_id ? String(r.refund_account_id) : null,
    is_active: r.is_active !== false,
    updated_at: String(r.updated_at || ''),
  };
}

async function enrichTaxes(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  rows: Record<string, unknown>[]
) {
  const accountIds = [
    ...new Set(
      rows
        .flatMap((r) => [
          r.account_id ? String(r.account_id) : '',
          r.refund_account_id ? String(r.refund_account_id) : '',
        ])
        .filter(Boolean)
    ),
  ];
  const groupIds = [
    ...new Set(rows.map((r) => String(r.tax_group_id || '')).filter(Boolean)),
  ];
  const orgIds = [
    ...new Set(rows.map((r) => String(r.organization_id || '')).filter(Boolean)),
  ];

  const [{ data: accounts }, { data: groups }, { data: orgs }] = await Promise.all([
    accountIds.length
      ? supabase.from('chart_of_accounts').select('id, code, name').in('id', accountIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
    groupIds.length
      ? supabase.from('tax_groups').select('id, name').in('id', groupIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    orgIds.length
      ? supabase.from('organizations').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const aMap = new Map(
    (accounts || []).map((a) => [String(a.id), { code: String(a.code), name: String(a.name) }])
  );
  const gMap = new Map((groups || []).map((g) => [String(g.id), String(g.name)]));
  const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

  return rows.map((r) => {
    const acc = r.account_id ? aMap.get(String(r.account_id)) : null;
    return mapTax(r, {
      organization_name: r.organization_id
        ? oMap.get(String(r.organization_id)) || null
        : 'Shared',
      tax_group_name: r.tax_group_id ? gMap.get(String(r.tax_group_id)) || null : null,
      account_code: acc?.code ?? null,
      account_name: acc?.name ?? null,
    });
  });
}

/** Active taxes for pickers (invoices/products). Shared + org. */
export async function searchAccountingTaxes(opts?: {
  search?: string;
  type?: TaxMasterType | 'all';
  scope?: TaxScope | 'all';
  limit?: number;
}) {
  try {
    const scope = await resolveTaxScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let q = supabase
      .from('taxes')
      .select(
        'id, name, code, type, rate_type, rate_value, is_inclusive, account_id, invoice_label, amount_type, scope, tax_group_id, is_active'
      )
      .eq('is_active', true)
      .order('sequence', { ascending: true })
      .order('name', { ascending: true })
      .limit(Math.min(200, Math.max(1, opts?.limit || 80)));

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    if (opts?.type && opts.type !== 'all') q = q.eq('type', opts.type);
    if (opts?.scope && opts.scope !== 'all') q = q.eq('scope', opts.scope);

    const needle = String(opts?.search || '').trim();
    if (needle) {
      q = q.or(
        `code.ilike.%${needle}%,name.ilike.%${needle}%,invoice_label.ilike.%${needle}%`
      );
    }

    const { data, error } = await q;
    if (error) {
      if (/organization_id|amount_type|scope|column/i.test(error.message)) {
        const legacy = await supabase
          .from('taxes')
          .select(
            'id, name, code, type, rate_type, rate_value, is_inclusive, account_id, is_active'
          )
          .eq('is_active', true)
          .order('name', { ascending: true })
          .limit(80);
        if (legacy.error) return { error: legacy.error.message };
        return { taxes: legacy.data || [] };
      }
      return { error: error.message };
    }
    return { taxes: data || [] };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to search taxes',
    };
  }
}

export async function getAccountingTaxGroups() {
  try {
    const scope = await resolveTaxScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let q = supabase
      .from('tax_groups')
      .select('id, name, sequence, organization_id, is_active')
      .eq('is_active', true)
      .order('sequence', { ascending: true });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const { data, error } = await q;
    if (error) {
      if (/tax_groups|does not exist/i.test(error.message)) {
        return { groups: [] as AccountingTaxGroupItem[], migrationRequired: true as const };
      }
      return { error: error.message };
    }
    return { groups: (data || []) as AccountingTaxGroupItem[] };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load tax groups',
    };
  }
}

export async function getAccountingConfigTaxes(opts?: {
  search?: string;
  type?: string;
  status?: 'all' | 'active' | 'archived';
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveTaxScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { taxes: [] as AccountingTaxListItem[], total: 0, page: 1, pageSize: 40 };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('taxes')
      .select('*', { count: 'exact' })
      .order('sequence', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const status = opts?.status || 'active';
    if (status === 'active') q = q.eq('is_active', true);
    if (status === 'archived') q = q.eq('is_active', false);

    const type = String(opts?.type || '').trim();
    if (type && type !== 'all') q = q.eq('type', type);

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error, count } = await q;
    if (error) {
      if (/organization_id|amount_type|tax_group|column/i.test(error.message)) {
        return {
          taxes: [] as AccountingTaxListItem[],
          total: 0,
          page,
          pageSize,
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const taxes = await enrichTaxes(supabase, (data || []) as Record<string, unknown>[]);
    return { taxes, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load taxes',
    };
  }
}

export async function getAccountingConfigTaxDetail(taxId: string) {
  try {
    const scope = await resolveTaxScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('taxes')
      .select('*')
      .eq('id', taxId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Tax not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Tax not in the selected organization' };
    }

    const [enriched] = await enrichTaxes(supabase, [row as Record<string, unknown>]);
    const detail: AccountingTaxDetail = {
      ...enriched,
      created_at: String(row.created_at || ''),
      created_by: row.created_by ? String(row.created_by) : null,
      updated_by: row.updated_by ? String(row.updated_by) : null,
    };
    return { tax: detail };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load tax',
    };
  }
}

async function assertUniqueTaxCode(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  code: string,
  organizationId: string | null,
  excludeId?: string
) {
  let q = supabase.from('taxes').select('id').eq('code', code).limit(1);
  if (organizationId) q = q.eq('organization_id', organizationId);
  else q = q.is('organization_id', null);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  if (data?.id) return 'Tax code must be unique within the organization';
  return null;
}

function deriveScopeFromType(type: TaxMasterType): TaxScope {
  if (type === 'purchase_tax') return 'purchase';
  if (type === 'withholding_tax') return 'none';
  return 'sale';
}

export async function createAccountingConfigTax(payload: {
  name: string;
  code: string;
  type: TaxMasterType;
  rate_value: number;
  amount_type?: TaxAmountType;
  is_inclusive?: boolean;
  account_id?: string | null;
  refund_account_id?: string | null;
  tax_group_id?: string | null;
  invoice_label?: string | null;
  description?: string | null;
  sequence?: number;
  orgSpecific?: boolean;
}) {
  try {
    const scope = await resolveTaxScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const name = String(payload.name || '').trim();
    const code = normalizeTaxCode(payload.code);
    const type = payload.type;
    if (!name) return { error: 'Tax name is required' };
    if (!code) return { error: 'Tax code is required' };
    if (!VALID_TYPES.includes(type)) return { error: 'Invalid tax type' };

    const rateValue = Number(payload.rate_value);
    if (!Number.isFinite(rateValue) || rateValue < 0) {
      return { error: 'Tax rate must be zero or greater' };
    }

    const amountType = payload.amount_type || 'percent';
    const rateType = amountType === 'fixed' ? 'fixed' : 'percentage';
    const organizationId =
      payload.orgSpecific && scope.organizationId ? scope.organizationId : null;
    if (payload.orgSpecific && !scope.organizationId) {
      return { error: 'Select an organization to create an organization-specific tax' };
    }

    const supabase = await createAdminClient();
    const uniqueErr = await assertUniqueTaxCode(supabase, code, organizationId);
    if (uniqueErr) return { error: uniqueErr };

    if (payload.account_id) {
      const { data: acc } = await supabase
        .from('chart_of_accounts')
        .select('id, is_active, type')
        .eq('id', payload.account_id)
        .maybeSingle();
      if (!acc) return { error: 'Tax account not found in Chart of Accounts' };
      if (!acc.is_active) return { error: 'Tax account must be active' };
      if (String(acc.type) === 'view') return { error: 'Tax account cannot be a view account' };
    }

    const { data, error } = await supabase
      .from('taxes')
      .insert([
        {
          name,
          code,
          type,
          rate_type: rateType,
          rate_value: rateValue,
          amount_type: amountType,
          is_inclusive: Boolean(payload.is_inclusive),
          account_id: payload.account_id || null,
          refund_account_id: payload.refund_account_id || null,
          tax_group_id: payload.tax_group_id || null,
          invoice_label: payload.invoice_label || name,
          description: payload.description || null,
          sequence: payload.sequence ?? 10,
          scope: deriveScopeFromType(type),
          organization_id: organizationId,
          is_active: true,
          created_by: scope.session.username,
          updated_by: scope.session.username,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('id')
      .single();

    if (error) {
      if (/organization_id|amount_type|tax_group|column/i.test(error.message)) {
        return {
          error: 'Run enhance_accounting_taxes_foundation.sql in Supabase first.',
        };
      }
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Tax code must be unique within the organization' };
      }
      return { error: error.message };
    }

    return { taxId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create tax',
    };
  }
}

export async function updateAccountingConfigTax(
  taxId: string,
  payload: {
    name?: string;
    code?: string;
    type?: TaxMasterType;
    rate_value?: number;
    amount_type?: TaxAmountType;
    is_inclusive?: boolean;
    account_id?: string | null;
    refund_account_id?: string | null;
    tax_group_id?: string | null;
    invoice_label?: string | null;
    description?: string | null;
    sequence?: number;
    is_active?: boolean;
  }
) {
  try {
    const scope = await resolveTaxScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('taxes')
      .select('*')
      .eq('id', taxId)
      .maybeSingle();
    if (!existing) return { error: 'Tax not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      existing.organization_id &&
      String(existing.organization_id) !== scope.organizationId
    ) {
      return { error: 'Tax not in the selected organization' };
    }

    const patch: Record<string, unknown> = {
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) {
      const name = String(payload.name).trim();
      if (!name) return { error: 'Tax name is required' };
      patch.name = name;
    }

    if (payload.code !== undefined) {
      const code = normalizeTaxCode(payload.code);
      if (!code) return { error: 'Tax code is required' };
      const orgId = existing.organization_id
        ? String(existing.organization_id)
        : null;
      const uniqueErr = await assertUniqueTaxCode(supabase, code, orgId, taxId);
      if (uniqueErr) return { error: uniqueErr };
      patch.code = code;
    }

    if (payload.type !== undefined) {
      if (!VALID_TYPES.includes(payload.type)) return { error: 'Invalid tax type' };
      patch.type = payload.type;
      patch.scope = deriveScopeFromType(payload.type);
    }

    if (payload.rate_value !== undefined) {
      const rateValue = Number(payload.rate_value);
      if (!Number.isFinite(rateValue) || rateValue < 0) {
        return { error: 'Tax rate must be zero or greater' };
      }
      patch.rate_value = rateValue;
    }

    if (payload.amount_type !== undefined) {
      patch.amount_type = payload.amount_type;
      patch.rate_type = payload.amount_type === 'fixed' ? 'fixed' : 'percentage';
    }

    if (payload.is_inclusive !== undefined) {
      patch.is_inclusive = Boolean(payload.is_inclusive);
    }

    if (payload.account_id !== undefined) {
      if (payload.account_id) {
        const { data: acc } = await supabase
          .from('chart_of_accounts')
          .select('id, is_active, type')
          .eq('id', payload.account_id)
          .maybeSingle();
        if (!acc) return { error: 'Tax account not found' };
        if (!acc.is_active) return { error: 'Tax account must be active' };
      }
      patch.account_id = payload.account_id || null;
    }

    if (payload.refund_account_id !== undefined) {
      patch.refund_account_id = payload.refund_account_id || null;
    }
    if (payload.tax_group_id !== undefined) {
      patch.tax_group_id = payload.tax_group_id || null;
    }
    if (payload.invoice_label !== undefined) {
      patch.invoice_label = payload.invoice_label || null;
    }
    if (payload.description !== undefined) {
      patch.description = payload.description || null;
    }
    if (payload.sequence !== undefined) {
      patch.sequence = Number(payload.sequence) || 10;
    }
    if (payload.is_active !== undefined) {
      patch.is_active = payload.is_active;
    }

    const { error } = await supabase.from('taxes').update(patch).eq('id', taxId);
    if (error) {
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Tax code must be unique within the organization' };
      }
      return { error: error.message };
    }

    return getAccountingConfigTaxDetail(taxId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update tax',
    };
  }
}

export async function archiveAccountingConfigTax(taxId: string) {
  return updateAccountingConfigTax(taxId, { is_active: false });
}

export async function restoreAccountingConfigTax(taxId: string) {
  return updateAccountingConfigTax(taxId, { is_active: true });
}

export async function createAccountingTaxGroup(name: string) {
  try {
    const scope = await resolveTaxScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    const trimmed = String(name || '').trim();
    if (!trimmed) return { error: 'Group name is required' };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('tax_groups')
      .insert([
        {
          name: trimmed,
          sequence: 100,
          organization_id: null,
          is_active: true,
        },
      ])
      .select('id')
      .single();
    if (error) {
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Tax group already exists' };
      }
      return { error: error.message };
    }
    return { groupId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create tax group',
    };
  }
}

export async function ensureDefaultAccountingTaxes() {
  try {
    const scope = await resolveTaxScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    // Groups
    for (const g of [
      { name: 'GST', sequence: 10 },
      { name: 'VAT', sequence: 20 },
    ]) {
      const { data: existing } = await supabase
        .from('tax_groups')
        .select('id')
        .ilike('name', g.name)
        .is('organization_id', null)
        .maybeSingle();
      if (!existing?.id) {
        await supabase.from('tax_groups').insert([
          { name: g.name, sequence: g.sequence, organization_id: null, is_active: true },
        ]);
      }
    }

    const { data: gstGroup } = await supabase
      .from('tax_groups')
      .select('id')
      .ilike('name', 'GST')
      .is('organization_id', null)
      .maybeSingle();

    const { data: taxPayable } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('code', '2200')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const defaults = [
      {
        name: 'GST Sales 18%',
        code: 'GST_S_18',
        type: 'sales_tax' as const,
        rate: 18,
        scope: 'sale',
        sequence: 10,
      },
      {
        name: 'GST Purchase 18%',
        code: 'GST_P_18',
        type: 'purchase_tax' as const,
        rate: 18,
        scope: 'purchase',
        sequence: 20,
      },
      {
        name: 'GST Sales 0%',
        code: 'GST_S_0',
        type: 'sales_tax' as const,
        rate: 0,
        scope: 'sale',
        sequence: 30,
      },
    ];

    let created = 0;
    for (const d of defaults) {
      const { data: existing } = await supabase
        .from('taxes')
        .select('id')
        .eq('code', d.code)
        .is('organization_id', null)
        .maybeSingle();
      if (existing?.id) continue;
      const { error } = await supabase.from('taxes').insert([
        {
          name: d.name,
          code: d.code,
          type: d.type,
          rate_type: 'percentage',
          rate_value: d.rate,
          amount_type: 'percent',
          is_inclusive: false,
          account_id: taxPayable?.id || null,
          tax_group_id: gstGroup?.id || null,
          invoice_label: d.rate ? `GST ${d.rate}%` : 'GST 0%',
          scope: d.scope,
          sequence: d.sequence,
          organization_id: null,
          is_active: true,
          created_by: scope.session?.username || null,
          updated_by: scope.session?.username || null,
        },
      ]);
      if (!error) created += 1;
    }

    return { created };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to ensure default taxes',
    };
  }
}

export async function exportAccountingConfigTaxesCsv() {
  try {
    const res = await getAccountingConfigTaxes({
      status: 'all',
      page: 1,
      pageSize: 5000,
    });
    if ('error' in res && res.error) return { error: res.error };
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const headers = [
      'code',
      'name',
      'type',
      'amount_type',
      'rate_value',
      'is_inclusive',
      'invoice_label',
      'tax_group',
      'account_code',
      'is_active',
    ];
    const lines = [
      headers.join(','),
      ...(res.taxes || []).map((t) =>
        [
          t.code,
          t.name,
          t.type,
          t.amount_type,
          String(t.rate_value),
          t.is_inclusive ? '1' : '0',
          t.invoice_label || '',
          t.tax_group_name || '',
          t.account_code || '',
          t.is_active ? '1' : '0',
        ]
          .map(escape)
          .join(',')
      ),
    ];
    return { csv: lines.join('\n') };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to export taxes',
    };
  }
}

/** Resolve posting tax account for an org (sales or purchase). */
export async function resolveDefaultTaxAccount(opts: {
  organizationId?: string | null;
  kind: 'sales' | 'purchase';
}) {
  try {
    const supabase = await createAdminClient();
    const type = opts.kind === 'purchase' ? 'purchase_tax' : 'sales_tax';
    let q = supabase
      .from('taxes')
      .select('id, account_id, rate_value, name, invoice_label')
      .eq('type', type)
      .eq('is_active', true)
      .order('sequence', { ascending: true })
      .limit(1);

    if (opts.organizationId) {
      q = q.or(
        `organization_id.eq.${opts.organizationId},organization_id.is.null`
      );
    } else {
      q = q.is('organization_id', null);
    }

    const { data } = await q.maybeSingle();
    if (data?.account_id) {
      return {
        accountId: String(data.account_id),
        taxId: String(data.id),
        label: String(data.invoice_label || data.name || 'Tax'),
      };
    }
    return { accountId: null as string | null, taxId: null, label: 'Tax' };
  } catch {
    return { accountId: null as string | null, taxId: null, label: 'Tax' };
  }
}

export { taxMasterTypeLabel };
