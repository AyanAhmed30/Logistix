'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import {
  buildAssetDepreciationSchedule,
  computeBookValue,
  type AssetDepreciationMethod,
  type AssetMethodPeriod,
} from '@/lib/accounting-assets';
import type { AutoPostingLine } from '@/lib/accounting-journal-posting';

export type AccountingAssetStatus =
  | 'draft'
  | 'running'
  | 'fully_depreciated'
  | 'disposed'
  | 'cancelled';

export type AccountingAssetCategory = {
  id: string;
  organization_id: string | null;
  name: string;
  code: string | null;
  depreciation_method: AssetDepreciationMethod;
  useful_life_months: number;
  method_period: AssetMethodPeriod;
  journal_id: string | null;
  asset_account_id: string | null;
  depreciation_account_id: string | null;
  expense_account_id: string | null;
  is_active: boolean;
};

export type AccountingAssetDepreciation = {
  id: string;
  asset_id: string;
  sequence: number;
  period_label: string;
  depreciation_date: string;
  amount: number;
  remaining_value: number;
  status: 'draft' | 'posted' | 'cancelled';
  journal_entry_id: string | null;
  posted_at: string | null;
};

export type AccountingAssetListItem = {
  id: string;
  asset_number: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  organization_id: string;
  organization_name: string | null;
  acquisition_date: string;
  original_value: number;
  salvage_value: number;
  book_value: number;
  accumulated_depreciation: number;
  depreciation_method: AssetDepreciationMethod;
  useful_life_months: number;
  status: AccountingAssetStatus;
  created_at: string;
};

export type AccountingAssetDetail = AccountingAssetListItem & {
  vendor_name: string | null;
  contact_id: string | null;
  purchase_reference: string | null;
  purchase_date: string | null;
  currency: string;
  method_period: AssetMethodPeriod;
  depreciation_number: number;
  first_depreciation_date: string | null;
  end_depreciation_date: string | null;
  journal_id: string | null;
  asset_account_id: string | null;
  depreciation_account_id: string | null;
  expense_account_id: string | null;
  purchase_journal_entry_id: string | null;
  disposal_date: string | null;
  disposal_value: number | null;
  disposal_journal_entry_id: string | null;
  notes: string | null;
  depreciations: AccountingAssetDepreciation[];
  depreciation_je_count: number;
};

export type AccountingAssetLog = {
  id: string;
  asset_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  performed_by: string | null;
  performed_at: string;
  details: Record<string, unknown>;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
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

  if (!scope.organizationId) {
    return { error: 'Select an organization from the header switcher.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

async function allocateAssetNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string
) {
  const { data: seq } = await supabase
    .from('accounting_asset_sequences')
    .select('next_number, prefix')
    .eq('organization_id', organizationId)
    .maybeSingle();

  let next = 1;
  let prefix = 'FA';
  if (seq) {
    next = Number(seq.next_number) || 1;
    prefix = String(seq.prefix || 'FA');
    await supabase
      .from('accounting_asset_sequences')
      .update({ next_number: next + 1, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId);
  } else {
    await supabase.from('accounting_asset_sequences').insert([
      { organization_id: organizationId, prefix: 'FA', next_number: 2 },
    ]);
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

async function appendLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  opts: {
    assetId: string;
    organizationId?: string | null;
    action: string;
    performedBy: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    details?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('accounting_asset_logs').insert([
      {
        asset_id: opts.assetId,
        organization_id: opts.organizationId || null,
        action: opts.action,
        previous_status: opts.previousStatus ?? null,
        new_status: opts.newStatus ?? null,
        performed_by: opts.performedBy,
        details: opts.details || {},
      },
    ]);
  } catch {
    /* best-effort */
  }
}

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  preferred?: string | null,
  codeHints: string[] = [],
  typeHint?: string
) {
  if (preferred) {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('id', preferred)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  for (const code of codeHints) {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  if (typeHint) {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('type', typeHint)
      .eq('is_active', true)
      .order('code', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  return null;
}

async function rebuildSchedule(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  asset: {
    id: string;
    organization_id: string;
    original_value: number;
    salvage_value: number;
    depreciation_method: string;
    method_period: string;
    depreciation_number: number;
    first_depreciation_date: string | null;
  }
) {
  // Keep posted lines; rebuild only draft/cancelled board.
  const { data: existing } = await supabase
    .from('accounting_asset_depreciations')
    .select('id, status, sequence, amount')
    .eq('asset_id', asset.id);

  const posted = (existing || []).filter((d) => String(d.status) === 'posted');
  const postedAmount = round2(
    posted.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  );
  const postedSeqs = new Set(posted.map((d) => Number(d.sequence)));

  await supabase
    .from('accounting_asset_depreciations')
    .delete()
    .eq('asset_id', asset.id)
    .neq('status', 'posted');

  const first =
    asset.first_depreciation_date ||
    new Date().toISOString().slice(0, 10);
  const full = buildAssetDepreciationSchedule({
    originalValue: Number(asset.original_value) || 0,
    salvageValue: Number(asset.salvage_value) || 0,
    method: asset.depreciation_method as AssetDepreciationMethod,
    methodPeriod: asset.method_period as AssetMethodPeriod,
    numberOfDepreciations: Number(asset.depreciation_number) || 1,
    firstDepreciationDate: first,
  });

  const toInsert = full
    .filter((l) => !postedSeqs.has(l.sequence))
    .map((l) => ({
      asset_id: asset.id,
      organization_id: asset.organization_id,
      sequence: l.sequence,
      period_label: l.period_label,
      depreciation_date: l.depreciation_date,
      amount: l.amount,
      remaining_value: l.remaining_value,
      status: 'draft' as const,
    }));

  if (toInsert.length) {
    await supabase.from('accounting_asset_depreciations').insert(toInsert);
  }

  const book = computeBookValue(Number(asset.original_value) || 0, postedAmount);
  const endDate =
    full.length > 0 ? full[full.length - 1].depreciation_date : asset.first_depreciation_date;

  await supabase
    .from('accounting_assets')
    .update({
      book_value: book,
      accumulated_depreciation: postedAmount,
      end_depreciation_date: endDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', asset.id);

  return { postedCount: posted.length, draftCount: toInsert.length };
}

function mapCategory(r: Record<string, unknown>): AccountingAssetCategory {
  return {
    id: String(r.id),
    organization_id: r.organization_id ? String(r.organization_id) : null,
    name: String(r.name || ''),
    code: r.code ? String(r.code) : null,
    depreciation_method: (String(r.depreciation_method || 'straight_line') as AssetDepreciationMethod),
    useful_life_months: Number(r.useful_life_months) || 36,
    method_period: (String(r.method_period || 'monthly') as AssetMethodPeriod),
    journal_id: r.journal_id ? String(r.journal_id) : null,
    asset_account_id: r.asset_account_id ? String(r.asset_account_id) : null,
    depreciation_account_id: r.depreciation_account_id
      ? String(r.depreciation_account_id)
      : null,
    expense_account_id: r.expense_account_id ? String(r.expense_account_id) : null,
    is_active: r.is_active !== false,
  };
}

export async function getAccountingAssetCategories() {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_asset_categories')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const { data, error } = await q;
    if (error) {
      if (/accounting_asset_categories|relation/i.test(error.message)) {
        return { categories: [] as AccountingAssetCategory[] };
      }
      return { error: error.message };
    }
    return { categories: (data || []).map((r) => mapCategory(r as Record<string, unknown>)) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load categories',
    };
  }
}

export async function saveAccountingAssetCategory(input: {
  id?: string | null;
  name: string;
  code?: string | null;
  depreciation_method?: AssetDepreciationMethod;
  useful_life_months?: number;
  method_period?: AssetMethodPeriod;
  journal_id?: string | null;
  asset_account_id?: string | null;
  depreciation_account_id?: string | null;
  expense_account_id?: string | null;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };
    if (!scope.organizationId && !scope.isGlobalAdminView) {
      return { error: 'Select an organization' };
    }

    const name = String(input.name || '').trim();
    if (!name) return { error: 'Category name is required' };

    const supabase = await createAdminClient();
    const payload = {
      name,
      code: input.code?.trim() || null,
      depreciation_method: input.depreciation_method || 'straight_line',
      useful_life_months: Math.max(1, Number(input.useful_life_months) || 36),
      method_period: input.method_period || 'monthly',
      journal_id: input.journal_id || null,
      asset_account_id: input.asset_account_id || null,
      depreciation_account_id: input.depreciation_account_id || null,
      expense_account_id: input.expense_account_id || null,
      organization_id: scope.organizationId,
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await supabase
        .from('accounting_asset_categories')
        .update(payload)
        .eq('id', input.id);
      if (error) return { error: error.message };
      return { categoryId: String(input.id) };
    }

    const { data, error } = await supabase
      .from('accounting_asset_categories')
      .insert([{ ...payload, created_by: scope.session.username }])
      .select('id')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to create category' };
    return { categoryId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to save category',
    };
  }
}

export async function getAccountingAssets(filters?: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { assets: [] as AccountingAssetListItem[], total: 0, page: 1, pageSize: 40 };
    }

    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_assets')
      .select('*', { count: 'exact' })
      .order('acquisition_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    const status = String(filters?.status || '').trim();
    if (status && status !== 'all') {
      q = q.eq('status', status);
    }

    const search = String(filters?.search || '').trim();
    if (search) {
      const like = `%${search.replace(/[%_,]/g, ' ')}%`;
      q = q.or(
        `asset_number.ilike.${like},name.ilike.${like},vendor_name.ilike.${like},purchase_reference.ilike.${like}`
      );
    }

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_assets|relation/i.test(error.message)) {
        return {
          assets: [] as AccountingAssetListItem[],
          total: 0,
          page,
          pageSize,
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const catIds = [...new Set(rows.map((r) => String(r.category_id || '')).filter(Boolean))];
    const orgIds = [...new Set(rows.map((r) => String(r.organization_id)))];

    const [{ data: cats }, { data: orgs }] = await Promise.all([
      catIds.length
        ? supabase.from('accounting_asset_categories').select('id, name').in('id', catIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      orgIds.length
        ? supabase.from('organizations').select('id, name').in('id', orgIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const cMap = new Map((cats || []).map((c) => [String(c.id), String(c.name)]));
    const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

    const assets: AccountingAssetListItem[] = rows.map((r) => ({
      id: String(r.id),
      asset_number: String(r.asset_number),
      name: String(r.name || ''),
      category_id: r.category_id ? String(r.category_id) : null,
      category_name: r.category_id ? cMap.get(String(r.category_id)) || null : null,
      organization_id: String(r.organization_id),
      organization_name: oMap.get(String(r.organization_id)) || null,
      acquisition_date: String(r.acquisition_date || '').slice(0, 10),
      original_value: Number(r.original_value) || 0,
      salvage_value: Number(r.salvage_value) || 0,
      book_value: Number(r.book_value) || 0,
      accumulated_depreciation: Number(r.accumulated_depreciation) || 0,
      depreciation_method: String(r.depreciation_method || 'straight_line') as AssetDepreciationMethod,
      useful_life_months: Number(r.useful_life_months) || 0,
      status: String(r.status) as AccountingAssetStatus,
      created_at: String(r.created_at || ''),
    }));

    return { assets, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load assets',
    };
  }
}

export async function getAccountingAssetDetail(assetId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Asset not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Asset not in the selected organization' };
    }

    const [{ data: cat }, { data: org }, { data: deps }] = await Promise.all([
      row.category_id
        ? supabase
            .from('accounting_asset_categories')
            .select('id, name')
            .eq('id', row.category_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('organizations')
        .select('id, name')
        .eq('id', row.organization_id)
        .maybeSingle(),
      supabase
        .from('accounting_asset_depreciations')
        .select('*')
        .eq('asset_id', assetId)
        .order('sequence', { ascending: true }),
    ]);

    const depreciations: AccountingAssetDepreciation[] = (deps || []).map((d) => ({
      id: String(d.id),
      asset_id: String(d.asset_id),
      sequence: Number(d.sequence) || 0,
      period_label: String(d.period_label || ''),
      depreciation_date: String(d.depreciation_date || '').slice(0, 10),
      amount: Number(d.amount) || 0,
      remaining_value: Number(d.remaining_value) || 0,
      status: String(d.status) as 'draft' | 'posted' | 'cancelled',
      journal_entry_id: d.journal_entry_id ? String(d.journal_entry_id) : null,
      posted_at: d.posted_at ? String(d.posted_at) : null,
    }));

    const asset: AccountingAssetDetail = {
      id: String(row.id),
      asset_number: String(row.asset_number),
      name: String(row.name || ''),
      category_id: row.category_id ? String(row.category_id) : null,
      category_name: cat?.name ? String(cat.name) : null,
      organization_id: String(row.organization_id),
      organization_name: org?.name ? String(org.name) : null,
      acquisition_date: String(row.acquisition_date || '').slice(0, 10),
      original_value: Number(row.original_value) || 0,
      salvage_value: Number(row.salvage_value) || 0,
      book_value: Number(row.book_value) || 0,
      accumulated_depreciation: Number(row.accumulated_depreciation) || 0,
      depreciation_method: String(row.depreciation_method || 'straight_line') as AssetDepreciationMethod,
      useful_life_months: Number(row.useful_life_months) || 0,
      status: String(row.status) as AccountingAssetStatus,
      created_at: String(row.created_at || ''),
      vendor_name: row.vendor_name ? String(row.vendor_name) : null,
      contact_id: row.contact_id ? String(row.contact_id) : null,
      purchase_reference: row.purchase_reference ? String(row.purchase_reference) : null,
      purchase_date: row.purchase_date ? String(row.purchase_date).slice(0, 10) : null,
      currency: String(row.currency || 'PKR'),
      method_period: String(row.method_period || 'monthly') as AssetMethodPeriod,
      depreciation_number: Number(row.depreciation_number) || 0,
      first_depreciation_date: row.first_depreciation_date
        ? String(row.first_depreciation_date).slice(0, 10)
        : null,
      end_depreciation_date: row.end_depreciation_date
        ? String(row.end_depreciation_date).slice(0, 10)
        : null,
      journal_id: row.journal_id ? String(row.journal_id) : null,
      asset_account_id: row.asset_account_id ? String(row.asset_account_id) : null,
      depreciation_account_id: row.depreciation_account_id
        ? String(row.depreciation_account_id)
        : null,
      expense_account_id: row.expense_account_id ? String(row.expense_account_id) : null,
      purchase_journal_entry_id: row.purchase_journal_entry_id
        ? String(row.purchase_journal_entry_id)
        : null,
      disposal_date: row.disposal_date ? String(row.disposal_date).slice(0, 10) : null,
      disposal_value:
        row.disposal_value != null ? Number(row.disposal_value) : null,
      disposal_journal_entry_id: row.disposal_journal_entry_id
        ? String(row.disposal_journal_entry_id)
        : null,
      notes: row.notes ? String(row.notes) : null,
      depreciations,
      depreciation_je_count: depreciations.filter((d) => d.journal_entry_id).length,
    };

    return { asset };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load asset',
    };
  }
}

export async function createAccountingAsset(input?: {
  name?: string;
  category_id?: string | null;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };
    if (!scope.organizationId) {
      return { error: 'Select an organization to create an asset' };
    }

    const supabase = await createAdminClient();
    const number = await allocateAssetNumber(supabase, scope.organizationId);
    const today = new Date().toISOString().slice(0, 10);

    let defaults: Partial<{
      depreciation_method: string;
      useful_life_months: number;
      method_period: string;
      journal_id: string | null;
      asset_account_id: string | null;
      depreciation_account_id: string | null;
      expense_account_id: string | null;
    }> = {
      depreciation_method: 'straight_line',
      useful_life_months: 36,
      method_period: 'monthly',
    };

    if (input?.category_id) {
      const { data: cat } = await supabase
        .from('accounting_asset_categories')
        .select('*')
        .eq('id', input.category_id)
        .maybeSingle();
      if (cat) {
        defaults = {
          depreciation_method: String(cat.depreciation_method || 'straight_line'),
          useful_life_months: Number(cat.useful_life_months) || 36,
          method_period: String(cat.method_period || 'monthly'),
          journal_id: cat.journal_id ? String(cat.journal_id) : null,
          asset_account_id: cat.asset_account_id ? String(cat.asset_account_id) : null,
          depreciation_account_id: cat.depreciation_account_id
            ? String(cat.depreciation_account_id)
            : null,
          expense_account_id: cat.expense_account_id
            ? String(cat.expense_account_id)
            : null,
        };
      }
    }

    const life = defaults.useful_life_months || 36;

    const { data, error } = await supabase
      .from('accounting_assets')
      .insert([
        {
          organization_id: scope.organizationId,
          asset_number: number,
          name: String(input?.name || '').trim() || 'New Asset',
          category_id: input?.category_id || null,
          status: 'draft',
          acquisition_date: today,
          purchase_date: today,
          original_value: 0,
          salvage_value: 0,
          book_value: 0,
          accumulated_depreciation: 0,
          depreciation_method: defaults.depreciation_method,
          method_period: defaults.method_period,
          useful_life_months: life,
          depreciation_number: life,
          first_depreciation_date: today,
          journal_id: defaults.journal_id || null,
          asset_account_id: defaults.asset_account_id || null,
          depreciation_account_id: defaults.depreciation_account_id || null,
          expense_account_id: defaults.expense_account_id || null,
          created_by: scope.session.username,
          updated_by: scope.session.username,
        },
      ])
      .select('id')
      .single();

    if (error || !data) {
      if (error && /accounting_assets|relation/i.test(error.message)) {
        return {
          error:
            'Run create_accounting_assets_module.sql migration to enable Assets.',
        };
      }
      return { error: error?.message || 'Failed to create asset' };
    }

    await appendLog(supabase, {
      assetId: String(data.id),
      organizationId: scope.organizationId,
      action: 'asset_created',
      performedBy: scope.session.username,
      newStatus: 'draft',
      details: { asset_number: number },
    });

    return { assetId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create asset',
    };
  }
}

export async function updateAccountingAsset(
  assetId: string,
  payload: {
    name?: string;
    category_id?: string | null;
    vendor_name?: string | null;
    contact_id?: string | null;
    purchase_reference?: string | null;
    purchase_date?: string | null;
    acquisition_date?: string;
    original_value?: number;
    salvage_value?: number;
    currency?: string;
    depreciation_method?: AssetDepreciationMethod;
    method_period?: AssetMethodPeriod;
    useful_life_months?: number;
    depreciation_number?: number;
    first_depreciation_date?: string | null;
    journal_id?: string | null;
    asset_account_id?: string | null;
    depreciation_account_id?: string | null;
    expense_account_id?: string | null;
    notes?: string | null;
  }
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('accounting_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();
    if (!existing) return { error: 'Asset not found' };
    if (String(existing.status) === 'disposed') {
      return { error: 'Disposed assets are read-only' };
    }
    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(existing.organization_id) !== scope.organizationId
    ) {
      return { error: 'Asset not in the selected organization' };
    }

    const original =
      payload.original_value != null
        ? round2(payload.original_value)
        : Number(existing.original_value) || 0;
    const salvage =
      payload.salvage_value != null
        ? round2(payload.salvage_value)
        : Number(existing.salvage_value) || 0;
    if (salvage - original > 0.004) {
      return { error: 'Salvage value cannot exceed original cost' };
    }

    const life =
      payload.useful_life_months != null
        ? Math.max(1, Number(payload.useful_life_months))
        : Number(existing.useful_life_months) || 36;
    const deprNumber =
      payload.depreciation_number != null
        ? Math.max(1, Number(payload.depreciation_number))
        : Number(existing.depreciation_number) || life;

    const patch: Record<string, unknown> = {
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };
    if (payload.name !== undefined) patch.name = String(payload.name).trim();
    if (payload.category_id !== undefined) patch.category_id = payload.category_id;
    if (payload.vendor_name !== undefined) patch.vendor_name = payload.vendor_name;
    if (payload.contact_id !== undefined) patch.contact_id = payload.contact_id;
    if (payload.purchase_reference !== undefined) {
      patch.purchase_reference = payload.purchase_reference;
    }
    if (payload.purchase_date !== undefined) patch.purchase_date = payload.purchase_date;
    if (payload.acquisition_date !== undefined) {
      patch.acquisition_date = payload.acquisition_date;
    }
    if (payload.original_value !== undefined) patch.original_value = original;
    if (payload.salvage_value !== undefined) patch.salvage_value = salvage;
    if (payload.currency !== undefined) patch.currency = payload.currency || 'PKR';
    if (payload.depreciation_method !== undefined) {
      patch.depreciation_method = payload.depreciation_method;
    }
    if (payload.method_period !== undefined) patch.method_period = payload.method_period;
    if (payload.useful_life_months !== undefined) patch.useful_life_months = life;
    if (payload.depreciation_number !== undefined || payload.useful_life_months !== undefined) {
      patch.depreciation_number = deprNumber;
    }
    if (payload.first_depreciation_date !== undefined) {
      patch.first_depreciation_date = payload.first_depreciation_date;
    }
    if (payload.journal_id !== undefined) patch.journal_id = payload.journal_id;
    if (payload.asset_account_id !== undefined) {
      patch.asset_account_id = payload.asset_account_id;
    }
    if (payload.depreciation_account_id !== undefined) {
      patch.depreciation_account_id = payload.depreciation_account_id;
    }
    if (payload.expense_account_id !== undefined) {
      patch.expense_account_id = payload.expense_account_id;
    }
    if (payload.notes !== undefined) patch.notes = payload.notes;

    // Draft: book value tracks original until running
    if (String(existing.status) === 'draft') {
      patch.book_value = original;
      patch.accumulated_depreciation = 0;
    }

    const { error } = await supabase
      .from('accounting_assets')
      .update(patch)
      .eq('id', assetId);
    if (error) return { error: error.message };

    const { data: refreshed } = await supabase
      .from('accounting_assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (refreshed && String(refreshed.status) !== 'disposed') {
      await rebuildSchedule(supabase, {
        id: String(refreshed.id),
        organization_id: String(refreshed.organization_id),
        original_value: Number(refreshed.original_value) || 0,
        salvage_value: Number(refreshed.salvage_value) || 0,
        depreciation_method: String(refreshed.depreciation_method),
        method_period: String(refreshed.method_period),
        depreciation_number: Number(refreshed.depreciation_number) || 1,
        first_depreciation_date: refreshed.first_depreciation_date
          ? String(refreshed.first_depreciation_date).slice(0, 10)
          : null,
      });
    }

    await appendLog(supabase, {
      assetId,
      organizationId: String(existing.organization_id),
      action: 'asset_updated',
      performedBy: scope.session.username,
      previousStatus: String(existing.status),
      newStatus: String(existing.status),
      details: { fields: Object.keys(payload) },
    });

    return getAccountingAssetDetail(assetId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update asset',
    };
  }
}

/** Confirm asset → Running + purchase JE + build schedule. */
export async function confirmAccountingAsset(assetId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: asset } = await supabase
      .from('accounting_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();
    if (!asset) return { error: 'Asset not found' };
    if (String(asset.status) !== 'draft') {
      return { error: 'Only draft assets can be confirmed' };
    }
    if (!(Number(asset.original_value) > 0)) {
      return { error: 'Original cost must be greater than zero' };
    }
    if (!String(asset.name || '').trim()) {
      return { error: 'Asset name is required' };
    }

    await rebuildSchedule(supabase, {
      id: String(asset.id),
      organization_id: String(asset.organization_id),
      original_value: Number(asset.original_value) || 0,
      salvage_value: Number(asset.salvage_value) || 0,
      depreciation_method: String(asset.depreciation_method),
      method_period: String(asset.method_period),
      depreciation_number: Number(asset.depreciation_number) || 1,
      first_depreciation_date: asset.first_depreciation_date
        ? String(asset.first_depreciation_date).slice(0, 10)
        : String(asset.acquisition_date).slice(0, 10),
    });

    // Purchase JE (best-effort)
    let purchaseJeId: string | null = asset.purchase_journal_entry_id
      ? String(asset.purchase_journal_entry_id)
      : null;

    try {
      const { getJournalIdByType } = await import('@/lib/accounting-journal-posting');
      const { createAndPostAutomaticJournalEntry } = await import(
        '@/app/actions/accounting/journal-entries'
      );

      let journalId = asset.journal_id ? String(asset.journal_id) : null;
      if (!journalId) {
        const j = await getJournalIdByType('general', String(asset.organization_id));
        journalId = String(j.id);
      }

      const assetAccountId = await resolveAccountId(
        supabase,
        asset.asset_account_id ? String(asset.asset_account_id) : null,
        ['1500', '1600', '1510', '1400'],
        'asset'
      );
      const creditAccountId = await resolveAccountId(
        supabase,
        null,
        ['1000', '1010', '2100', '2000'],
        'asset'
      );

      if (assetAccountId && creditAccountId && journalId) {
        const amount = round2(Number(asset.original_value) || 0);
        const lines: AutoPostingLine[] = [
          {
            account_id: assetAccountId,
            label: `Asset ${asset.asset_number} — ${asset.name}`,
            partner_name: asset.vendor_name ? String(asset.vendor_name) : null,
            contact_id: asset.contact_id ? String(asset.contact_id) : null,
            debit: amount,
            credit: 0,
          },
          {
            account_id: creditAccountId,
            label: `Asset acquisition ${asset.asset_number}`,
            partner_name: asset.vendor_name ? String(asset.vendor_name) : null,
            contact_id: asset.contact_id ? String(asset.contact_id) : null,
            debit: 0,
            credit: amount,
          },
        ];

        const je = await createAndPostAutomaticJournalEntry({
          organizationId: String(asset.organization_id),
          journalId,
          entryDate: String(asset.acquisition_date || asset.purchase_date).slice(0, 10),
          reference: String(asset.asset_number),
          partnerName: asset.vendor_name ? String(asset.vendor_name) : null,
          contactId: asset.contact_id ? String(asset.contact_id) : null,
          sourceType: 'asset_purchase' as never,
          sourceId: assetId,
          sourceNumber: String(asset.asset_number),
          lines,
          performedBy: scope.session.username,
        });
        if ('journalEntryId' in je && je.journalEntryId) {
          purchaseJeId = je.journalEntryId ?? null;
        }
      }
    } catch (err) {
      console.warn('[assets] purchase JE:', err);
    }

    await supabase
      .from('accounting_assets')
      .update({
        status: 'running',
        book_value: round2(Number(asset.original_value) || 0),
        accumulated_depreciation: 0,
        purchase_journal_entry_id: purchaseJeId,
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assetId);

    await appendLog(supabase, {
      assetId,
      organizationId: String(asset.organization_id),
      action: 'asset_confirmed',
      performedBy: scope.session.username,
      previousStatus: 'draft',
      newStatus: 'running',
      details: { purchase_journal_entry_id: purchaseJeId },
    });

    return getAccountingAssetDetail(assetId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to confirm asset',
    };
  }
}

export async function postAccountingAssetDepreciation(depreciationId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: dep } = await supabase
      .from('accounting_asset_depreciations')
      .select('*')
      .eq('id', depreciationId)
      .maybeSingle();
    if (!dep) return { error: 'Depreciation line not found' };
    if (String(dep.status) === 'posted') {
      return { alreadyPosted: true as const, journalEntryId: dep.journal_entry_id };
    }

    const { data: asset } = await supabase
      .from('accounting_assets')
      .select('*')
      .eq('id', dep.asset_id)
      .maybeSingle();
    if (!asset) return { error: 'Asset not found' };
    if (!['running', 'fully_depreciated'].includes(String(asset.status))) {
      return { error: 'Asset must be running to post depreciation' };
    }

    const amount = round2(Number(dep.amount) || 0);
    if (amount <= 0.004) return { error: 'Depreciation amount is zero' };

    let journalEntryId: string | null = null;
    try {
      const { getJournalIdByType } = await import('@/lib/accounting-journal-posting');
      const { createAndPostAutomaticJournalEntry } = await import(
        '@/app/actions/accounting/journal-entries'
      );

      let journalId = asset.journal_id ? String(asset.journal_id) : null;
      if (!journalId) {
        const j = await getJournalIdByType('general', String(asset.organization_id));
        journalId = String(j.id);
      }

      const expenseId = await resolveAccountId(
        supabase,
        asset.expense_account_id ? String(asset.expense_account_id) : null,
        ['6100', '6200', '6800', '5100'],
        'expense'
      );
      const accumId = await resolveAccountId(
        supabase,
        asset.depreciation_account_id ? String(asset.depreciation_account_id) : null,
        ['1590', '1690', '1580', '1500'],
        'asset'
      );

      if (!expenseId || !accumId) {
        return {
          error:
            'Configure Depreciation Expense and Accumulated Depreciation accounts on the asset or CoA.',
        };
      }

      const lines: AutoPostingLine[] = [
        {
          account_id: expenseId,
          label: `Depreciation ${asset.asset_number} — ${dep.period_label}`,
          debit: amount,
          credit: 0,
        },
        {
          account_id: accumId,
          label: `Accum. Dep. ${asset.asset_number} — ${dep.period_label}`,
          debit: 0,
          credit: amount,
        },
      ];

      const je = await createAndPostAutomaticJournalEntry({
        organizationId: String(asset.organization_id),
        journalId: journalId!,
        entryDate: String(dep.depreciation_date).slice(0, 10),
        reference: `${asset.asset_number}/${dep.sequence}`,
        sourceType: 'asset_depreciation' as never,
        sourceId: depreciationId,
        sourceNumber: String(asset.asset_number),
        lines,
        performedBy: scope.session.username,
      });
      if ('error' in je && je.error) return { error: je.error };
      if ('journalEntryId' in je) journalEntryId = je.journalEntryId ?? null;
    } catch (err) {
      return {
        error:
          err instanceof Error ? err.message : 'Failed to create depreciation journal entry',
      };
    }

    await supabase
      .from('accounting_asset_depreciations')
      .update({
        status: 'posted',
        journal_entry_id: journalEntryId,
        posted_at: new Date().toISOString(),
        posted_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', depreciationId);

    const nextAccum = round2(
      (Number(asset.accumulated_depreciation) || 0) + amount
    );
    const nextBook = computeBookValue(Number(asset.original_value) || 0, nextAccum);
    const salvage = round2(Number(asset.salvage_value) || 0);
    const fully = nextBook <= salvage + 0.004;

    await supabase
      .from('accounting_assets')
      .update({
        accumulated_depreciation: nextAccum,
        book_value: nextBook,
        status: fully ? 'fully_depreciated' : 'running',
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asset.id);

    await appendLog(supabase, {
      assetId: String(asset.id),
      organizationId: String(asset.organization_id),
      action: 'depreciation_posted',
      performedBy: scope.session.username,
      previousStatus: String(asset.status),
      newStatus: fully ? 'fully_depreciated' : 'running',
      details: {
        depreciation_id: depreciationId,
        amount,
        journal_entry_id: journalEntryId,
        period: dep.period_label,
      },
    });

    return {
      journalEntryId,
      assetId: String(asset.id),
      bookValue: nextBook,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post depreciation',
    };
  }
}

/** Post all due draft depreciation lines (date <= today). */
export async function postDueAccountingAssetDepreciations(assetId?: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    let q = supabase
      .from('accounting_asset_depreciations')
      .select('id')
      .eq('status', 'draft')
      .lte('depreciation_date', today)
      .order('depreciation_date', { ascending: true })
      .limit(50);

    if (assetId) q = q.eq('asset_id', assetId);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    const { data } = await q;
    let posted = 0;
    for (const row of data || []) {
      const res = await postAccountingAssetDepreciation(String(row.id));
      if (!('error' in res && res.error)) posted += 1;
    }
    return { posted };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post due depreciations',
    };
  }
}

export async function disposeAccountingAsset(
  assetId: string,
  opts?: { disposalDate?: string; disposalValue?: number }
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: asset } = await supabase
      .from('accounting_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();
    if (!asset) return { error: 'Asset not found' };
    if (String(asset.status) === 'disposed') {
      return { error: 'Asset is already disposed' };
    }
    if (String(asset.status) === 'draft') {
      return { error: 'Confirm the asset before disposing' };
    }

    const disposalDate = String(
      opts?.disposalDate || new Date().toISOString().slice(0, 10)
    ).slice(0, 10);
    const proceeds = round2(
      opts?.disposalValue != null ? Number(opts.disposalValue) : 0
    );
    const book = round2(Number(asset.book_value) || 0);
    const original = round2(Number(asset.original_value) || 0);
    const accum = round2(Number(asset.accumulated_depreciation) || 0);

    let disposalJeId: string | null = null;
    try {
      const { getJournalIdByType } = await import('@/lib/accounting-journal-posting');
      const { createAndPostAutomaticJournalEntry } = await import(
        '@/app/actions/accounting/journal-entries'
      );

      let journalId = asset.journal_id ? String(asset.journal_id) : null;
      if (!journalId) {
        const j = await getJournalIdByType('general', String(asset.organization_id));
        journalId = String(j.id);
      }

      const assetAccountId = await resolveAccountId(
        supabase,
        asset.asset_account_id ? String(asset.asset_account_id) : null,
        ['1500', '1600', '1510'],
        'asset'
      );
      const accumId = await resolveAccountId(
        supabase,
        asset.depreciation_account_id ? String(asset.depreciation_account_id) : null,
        ['1590', '1690', '1580'],
        'asset'
      );
      const bankId = await resolveAccountId(
        supabase,
        null,
        ['1000', '1010', '1100'],
        'asset'
      );
      const gainLossId = await resolveAccountId(
        supabase,
        null,
        ['6900', '7900', '6100'],
        'expense'
      );

      if (assetAccountId && accumId && bankId && gainLossId && journalId) {
        const lines: AutoPostingLine[] = [];
        // Clear accum dep
        if (accum > 0.004) {
          lines.push({
            account_id: accumId,
            label: `Clear accum. dep. ${asset.asset_number}`,
            debit: accum,
            credit: 0,
          });
        }
        if (proceeds > 0.004) {
          lines.push({
            account_id: bankId,
            label: `Disposal proceeds ${asset.asset_number}`,
            debit: proceeds,
            credit: 0,
          });
        }
        const loss = round2(book - proceeds);
        if (loss > 0.004) {
          lines.push({
            account_id: gainLossId,
            label: `Loss on disposal ${asset.asset_number}`,
            debit: loss,
            credit: 0,
          });
        } else if (loss < -0.004) {
          lines.push({
            account_id: gainLossId,
            label: `Gain on disposal ${asset.asset_number}`,
            debit: 0,
            credit: round2(-loss),
          });
        }
        lines.push({
          account_id: assetAccountId,
          label: `Dispose asset ${asset.asset_number}`,
          debit: 0,
          credit: original,
        });

        const debitSum = round2(lines.reduce((s, l) => s + l.debit, 0));
        const creditSum = round2(lines.reduce((s, l) => s + l.credit, 0));
        if (Math.abs(debitSum - creditSum) > 0.05) {
          // Balance with gain/loss adjustment
          const diff = round2(debitSum - creditSum);
          if (diff > 0) {
            lines.push({
              account_id: gainLossId,
              label: `Disposal balancing ${asset.asset_number}`,
              debit: 0,
              credit: diff,
            });
          } else {
            lines.push({
              account_id: gainLossId,
              label: `Disposal balancing ${asset.asset_number}`,
              debit: round2(-diff),
              credit: 0,
            });
          }
        }

        const je = await createAndPostAutomaticJournalEntry({
          organizationId: String(asset.organization_id),
          journalId,
          entryDate: disposalDate,
          reference: `DISP/${asset.asset_number}`,
          sourceType: 'asset_disposal' as never,
          sourceId: assetId,
          sourceNumber: String(asset.asset_number),
          lines,
          performedBy: scope.session.username,
        });
        if ('journalEntryId' in je) disposalJeId = je.journalEntryId ?? null;
      }
    } catch (err) {
      console.warn('[assets] disposal JE:', err);
    }

    // Cancel remaining draft depreciations
    await supabase
      .from('accounting_asset_depreciations')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('asset_id', assetId)
      .eq('status', 'draft');

    await supabase
      .from('accounting_assets')
      .update({
        status: 'disposed',
        book_value: 0,
        disposed_at: new Date().toISOString(),
        disposal_date: disposalDate,
        disposal_value: proceeds,
        disposal_journal_entry_id: disposalJeId,
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assetId);

    await appendLog(supabase, {
      assetId,
      organizationId: String(asset.organization_id),
      action: 'asset_disposed',
      performedBy: scope.session.username,
      previousStatus: String(asset.status),
      newStatus: 'disposed',
      details: {
        disposal_date: disposalDate,
        disposal_value: proceeds,
        book_value_before: book,
        disposal_journal_entry_id: disposalJeId,
      },
    });

    return getAccountingAssetDetail(assetId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to dispose asset',
    };
  }
}

export async function getAccountingAssetActivity(assetId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_asset_logs')
      .select('*')
      .eq('asset_id', assetId)
      .order('performed_at', { ascending: false })
      .limit(200);

    if (error) {
      if (/accounting_asset_logs|relation/i.test(error.message)) {
        return { logs: [] as AccountingAssetLog[] };
      }
      return { error: error.message };
    }

    return {
      logs: (data || []).map(
        (r): AccountingAssetLog => ({
          id: String(r.id),
          asset_id: String(r.asset_id),
          action: String(r.action || ''),
          previous_status: r.previous_status ? String(r.previous_status) : null,
          new_status: r.new_status ? String(r.new_status) : null,
          performed_by: r.performed_by ? String(r.performed_by) : null,
          performed_at: String(r.performed_at || ''),
          details: (r.details || {}) as Record<string, unknown>,
        })
      ),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load activity',
    };
  }
}

export async function getAccountingAssetReports() {
  try {
    const list = await getAccountingAssets({ page: 1, pageSize: 500, status: 'all' });
    if ('error' in list && list.error) return { error: list.error };
    const assets = list.assets || [];

    const running = assets.filter((a) => a.status === 'running');
    const fully = assets.filter((a) => a.status === 'fully_depreciated');
    const disposed = assets.filter((a) => a.status === 'disposed');
    const draft = assets.filter((a) => a.status === 'draft');

    const totalCost = round2(assets.reduce((s, a) => s + a.original_value, 0));
    const totalBook = round2(
      assets
        .filter((a) => a.status !== 'disposed')
        .reduce((s, a) => s + a.book_value, 0)
    );
    const totalAccum = round2(
      assets.reduce((s, a) => s + a.accumulated_depreciation, 0)
    );

    return {
      summary: {
        count: assets.length,
        draft: draft.length,
        running: running.length,
        fully_depreciated: fully.length,
        disposed: disposed.length,
        total_cost: totalCost,
        total_book_value: totalBook,
        total_accumulated: totalAccum,
      },
      register: assets,
      fully_depreciated: fully,
      disposed,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load asset reports',
    };
  }
}
