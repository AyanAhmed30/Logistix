'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import {
  requireAccountingActionAccess,
  sessionHasAccountingAccess,
} from '@/lib/accounting-page-access';
import {
  buildConversionResult,
  formatCurrencyAmount,
  isValidIsoCurrencyCode,
  normalizeCurrencyCode,
  roundCurrencyAmount,
  toFiniteAmount,
  type CurrencyDef,
  type CurrencySymbolPosition,
  type ExchangeRateType,
  type MoneyConversionResult,
  FALLBACK_BASE_CURRENCY,
} from '@/lib/accounting-currencies';

export type AccountingCurrencyListItem = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
  rounding: number;
  symbol_position: CurrencySymbolPosition;
  is_base: boolean;
  is_active: boolean;
  sequence: number;
  notes: string | null;
  latest_rate: number | null;
  latest_rate_date: string | null;
  updated_at: string;
};

export type AccountingCurrencyDetail = AccountingCurrencyListItem & {
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
  unrealized_gain_account_id: string | null;
  unrealized_loss_account_id: string | null;
  rates: AccountingExchangeRateRow[];
};

export type AccountingExchangeRateRow = {
  id: string;
  currency_id: string;
  rate_date: string;
  rate_to_base: number;
  source: string | null;
  rate_type: ExchangeRateType;
  created_at: string;
  updated_at: string;
};

async function resolveCurrencyScope(opts?: { config?: boolean }) {
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

function mapCurrencyRow(r: Record<string, unknown>): Omit<
  AccountingCurrencyListItem,
  'latest_rate' | 'latest_rate_date'
> {
  return {
    id: String(r.id),
    code: normalizeCurrencyCode(String(r.code || '')),
    name: String(r.name || ''),
    symbol: String(r.symbol || ''),
    decimal_places: Math.max(0, Math.min(6, Number(r.decimal_places ?? 2))),
    rounding: toFiniteAmount(r.rounding, 0.01) || 0.01,
    symbol_position:
      r.symbol_position === 'after' ? 'after' : ('before' as CurrencySymbolPosition),
    is_base: Boolean(r.is_base),
    is_active: r.is_active !== false,
    sequence: Number(r.sequence ?? 100) || 100,
    notes: r.notes != null ? String(r.notes) : null,
    updated_at: String(r.updated_at || ''),
  };
}

function toCurrencyDef(
  c: Pick<
    AccountingCurrencyListItem,
    | 'id'
    | 'code'
    | 'name'
    | 'symbol'
    | 'decimal_places'
    | 'rounding'
    | 'symbol_position'
    | 'is_base'
    | 'is_active'
    | 'sequence'
  >
): CurrencyDef {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    decimal_places: c.decimal_places,
    rounding: c.rounding,
    symbol_position: c.symbol_position,
    is_base: c.is_base,
    is_active: c.is_active,
    sequence: c.sequence,
  };
}

/** Active currencies for pickers (journals, invoices, org defaults). */
export async function searchAccountingCurrencies(opts?: {
  search?: string;
  limit?: number;
  activeOnly?: boolean;
}) {
  try {
    const scope = await resolveCurrencyScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) return { currencies: [] as CurrencyDef[] };

    const supabase = await createAdminClient();
    let q = supabase
      .from('currencies')
      .select(
        'id, code, name, symbol, decimal_places, rounding, symbol_position, is_base, is_active, sequence'
      )
      .order('sequence', { ascending: true })
      .order('code', { ascending: true })
      .limit(opts?.limit ?? 80);

    if (opts?.activeOnly !== false) q = q.eq('is_active', true);

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(
        `code.ilike.%${search}%,name.ilike.%${search}%,symbol.ilike.%${search}%`
      );
    }

    const { data, error } = await q;
    if (error) {
      if (/currencies|does not exist/i.test(error.message)) {
        return { currencies: [] as CurrencyDef[], migrationRequired: true as const };
      }
      return { error: error.message };
    }

    return {
      currencies: (data || []).map((r) =>
        toCurrencyDef(mapCurrencyRow(r as Record<string, unknown>))
      ),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to search currencies',
    };
  }
}

export async function getAccountingConfigCurrencies(opts?: {
  search?: string;
  status?: 'active' | 'archived' | 'all';
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const status = opts?.status || 'active';

    const supabase = await createAdminClient();
    let q = supabase
      .from('currencies')
      .select('*', { count: 'exact' })
      .order('sequence', { ascending: true })
      .order('code', { ascending: true })
      .range(from, to);

    if (status === 'active') q = q.eq('is_active', true);
    if (status === 'archived') q = q.eq('is_active', false);

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(
        `code.ilike.%${search}%,name.ilike.%${search}%,symbol.ilike.%${search}%`
      );
    }

    const { data, error, count } = await q;
    if (error) {
      if (/currencies|does not exist/i.test(error.message)) {
        return {
          currencies: [] as AccountingCurrencyListItem[],
          total: 0,
          page,
          pageSize,
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const ids = rows.map((r) => String(r.id));

    const latestByCurrency = new Map<
      string,
      { rate: number; rate_date: string }
    >();

    if (ids.length) {
      const { data: rates } = await supabase
        .from('exchange_rates')
        .select('currency_id, rate_to_base, rate_date')
        .in('currency_id', ids)
        .order('rate_date', { ascending: false });

      for (const rate of rates || []) {
        const cid = String(rate.currency_id);
        if (latestByCurrency.has(cid)) continue;
        latestByCurrency.set(cid, {
          rate: toFiniteAmount(rate.rate_to_base),
          rate_date: String(rate.rate_date),
        });
      }
    }

    const currencies: AccountingCurrencyListItem[] = rows.map((r) => {
      const base = mapCurrencyRow(r as Record<string, unknown>);
      const latest = latestByCurrency.get(base.id);
      return {
        ...base,
        latest_rate: base.is_base ? 1 : latest?.rate ?? null,
        latest_rate_date: base.is_base
          ? new Date().toISOString().slice(0, 10)
          : latest?.rate_date ?? null,
      };
    });

    return { currencies, total: count ?? currencies.length, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load currencies',
    };
  }
}

export async function getAccountingConfigCurrencyDetail(currencyId: string) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('currencies')
      .select('*')
      .eq('id', currencyId)
      .maybeSingle();

    if (error || !data) {
      return { error: error?.message || 'Currency not found' };
    }

    const { data: rates } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('currency_id', currencyId)
      .order('rate_date', { ascending: false })
      .limit(120);

    const base = mapCurrencyRow(data as Record<string, unknown>);
    const rateRows: AccountingExchangeRateRow[] = (rates || []).map((r) => ({
      id: String(r.id),
      currency_id: String(r.currency_id),
      rate_date: String(r.rate_date),
      rate_to_base: toFiniteAmount(r.rate_to_base),
      source: r.source != null ? String(r.source) : null,
      rate_type: (['manual', 'api', 'bank', 'import'].includes(String(r.rate_type))
        ? String(r.rate_type)
        : 'manual') as ExchangeRateType,
      created_at: String(r.created_at || ''),
      updated_at: String(r.updated_at || ''),
    }));

    const latest = rateRows[0];
    const currency: AccountingCurrencyDetail = {
      ...base,
      created_at: String(data.created_at || ''),
      created_by: data.created_by != null ? String(data.created_by) : null,
      updated_by: data.updated_by != null ? String(data.updated_by) : null,
      unrealized_gain_account_id: data.unrealized_gain_account_id
        ? String(data.unrealized_gain_account_id)
        : null,
      unrealized_loss_account_id: data.unrealized_loss_account_id
        ? String(data.unrealized_loss_account_id)
        : null,
      latest_rate: base.is_base ? 1 : latest?.rate_to_base ?? null,
      latest_rate_date: base.is_base
        ? new Date().toISOString().slice(0, 10)
        : latest?.rate_date ?? null,
      rates: rateRows,
    };

    return { currency };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load currency',
    };
  }
}

export async function createAccountingConfigCurrency(payload: {
  code: string;
  name: string;
  symbol?: string;
  decimal_places?: number;
  rounding?: number;
  symbol_position?: CurrencySymbolPosition;
  sequence?: number;
  notes?: string | null;
  is_base?: boolean;
  initial_rate?: number | null;
  initial_rate_date?: string | null;
}) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const code = normalizeCurrencyCode(payload.code);
    if (!isValidIsoCurrencyCode(code)) {
      return { error: 'Currency code must be a 3-letter ISO code (e.g. USD).' };
    }
    const name = String(payload.name || '').trim();
    if (!name) return { error: 'Currency name is required.' };

    const supabase = await createAdminClient();
    const actor = scope.session?.username || null;

    if (payload.is_base) {
      await supabase
        .from('currencies')
        .update({ is_base: false, updated_at: new Date().toISOString() })
        .eq('is_base', true);
    }

    const { data, error } = await supabase
      .from('currencies')
      .insert({
        code,
        name,
        symbol: String(payload.symbol || code).trim() || code,
        decimal_places: Math.max(0, Math.min(6, Number(payload.decimal_places ?? 2))),
        rounding: toFiniteAmount(payload.rounding, 0.01) || 0.01,
        symbol_position: payload.symbol_position === 'after' ? 'after' : 'before',
        sequence: Number(payload.sequence ?? 100) || 100,
        notes: payload.notes || null,
        is_base: Boolean(payload.is_base),
        is_active: true,
        created_by: actor,
        updated_by: actor,
      })
      .select('id')
      .single();

    if (error) {
      if (/currencies|does not exist|column/i.test(error.message)) {
        return {
          error:
            'Run enhance_accounting_currencies_foundation.sql in Supabase first.',
        };
      }
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Currency code already exists.' };
      }
      return { error: error.message };
    }

    const currencyId = String(data.id);
    const rate = toFiniteAmount(payload.initial_rate, 0);
    if (!payload.is_base && rate > 0) {
      const rateDate =
        payload.initial_rate_date || new Date().toISOString().slice(0, 10);
      await supabase.from('exchange_rates').upsert(
        {
          currency_id: currencyId,
          rate_date: rateDate,
          rate_to_base: rate,
          source: 'manual',
          rate_type: 'manual',
          created_by: actor,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'currency_id,rate_date' }
      );
    }

    return { currencyId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create currency',
    };
  }
}

export async function updateAccountingConfigCurrency(
  currencyId: string,
  payload: {
    name?: string;
    symbol?: string;
    decimal_places?: number;
    rounding?: number;
    symbol_position?: CurrencySymbolPosition;
    sequence?: number;
    notes?: string | null;
    is_base?: boolean;
  }
) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const actor = scope.session?.username || null;

    const { data: existing, error: findErr } = await supabase
      .from('currencies')
      .select('id, code, is_base')
      .eq('id', currencyId)
      .maybeSingle();
    if (findErr || !existing) {
      return { error: findErr?.message || 'Currency not found' };
    }

    if (payload.is_base && !existing.is_base) {
      await supabase
        .from('currencies')
        .update({ is_base: false, updated_at: new Date().toISOString() })
        .eq('is_base', true);
    }

    if (payload.is_base === false && existing.is_base) {
      return { error: 'Set another currency as base before unsetting this one.' };
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: actor,
    };
    if (payload.name !== undefined) {
      const name = String(payload.name || '').trim();
      if (!name) return { error: 'Currency name is required.' };
      patch.name = name;
    }
    if (payload.symbol !== undefined) {
      patch.symbol = String(payload.symbol || '').trim();
    }
    if (payload.decimal_places !== undefined) {
      patch.decimal_places = Math.max(
        0,
        Math.min(6, Number(payload.decimal_places))
      );
    }
    if (payload.rounding !== undefined) {
      patch.rounding = toFiniteAmount(payload.rounding, 0.01) || 0.01;
    }
    if (payload.symbol_position !== undefined) {
      patch.symbol_position =
        payload.symbol_position === 'after' ? 'after' : 'before';
    }
    if (payload.sequence !== undefined) {
      patch.sequence = Number(payload.sequence) || 100;
    }
    if (payload.notes !== undefined) patch.notes = payload.notes;
    if (payload.is_base !== undefined) patch.is_base = Boolean(payload.is_base);

    const { error } = await supabase
      .from('currencies')
      .update(patch)
      .eq('id', currencyId);

    if (error) return { error: error.message };
    return { ok: true as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update currency',
    };
  }
}

export async function archiveAccountingConfigCurrency(currencyId: string) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('currencies')
      .select('id, is_base')
      .eq('id', currencyId)
      .maybeSingle();
    if (!existing) return { error: 'Currency not found' };
    if (existing.is_base) {
      return { error: 'Cannot archive the base currency.' };
    }

    const { error } = await supabase
      .from('currencies')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
        updated_by: scope.session?.username || null,
      })
      .eq('id', currencyId);

    if (error) return { error: error.message };
    return { ok: true as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to archive currency',
    };
  }
}

export async function restoreAccountingConfigCurrency(currencyId: string) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('currencies')
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
        updated_by: scope.session?.username || null,
      })
      .eq('id', currencyId);

    if (error) return { error: error.message };
    return { ok: true as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to restore currency',
    };
  }
}

export async function upsertAccountingExchangeRate(payload: {
  currency_id: string;
  rate_date: string;
  rate_to_base: number;
  source?: string | null;
  rate_type?: ExchangeRateType;
}) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const rate = toFiniteAmount(payload.rate_to_base);
    if (rate <= 0) return { error: 'Exchange rate must be greater than zero.' };
    const rateDate = String(payload.rate_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rateDate)) {
      return { error: 'Rate date is required (YYYY-MM-DD).' };
    }

    const supabase = await createAdminClient();
    const { data: currency } = await supabase
      .from('currencies')
      .select('id, is_base')
      .eq('id', payload.currency_id)
      .maybeSingle();
    if (!currency) return { error: 'Currency not found' };
    if (currency.is_base) {
      return { error: 'Base currency rate is always 1 — no rate rows needed.' };
    }

    const actor = scope.session?.username || null;
    const { data, error } = await supabase
      .from('exchange_rates')
      .upsert(
        {
          currency_id: payload.currency_id,
          rate_date: rateDate,
          rate_to_base: rate,
          source: payload.source || 'manual',
          rate_type: payload.rate_type || 'manual',
          created_by: actor,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'currency_id,rate_date' }
      )
      .select('id')
      .single();

    if (error) {
      if (/exchange_rates|does not exist|column/i.test(error.message)) {
        return {
          error:
            'Run enhance_accounting_currencies_foundation.sql in Supabase first.',
        };
      }
      return { error: error.message };
    }

    return { rateId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to save exchange rate',
    };
  }
}

export async function deleteAccountingExchangeRate(rateId: string) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('exchange_rates')
      .delete()
      .eq('id', rateId);
    if (error) return { error: error.message };
    return { ok: true as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to delete exchange rate',
    };
  }
}

export async function ensureDefaultAccountingCurrencies() {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const defaults = [
      { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', is_base: true, sequence: 10 },
      { code: 'USD', name: 'US Dollar', symbol: '$', is_base: false, sequence: 20 },
      { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', is_base: false, sequence: 30 },
      { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', is_base: false, sequence: 40 },
    ];

    for (const d of defaults) {
      const { data: existing } = await supabase
        .from('currencies')
        .select('id')
        .eq('code', d.code)
        .maybeSingle();
      if (existing) continue;
      await supabase.from('currencies').insert({
        ...d,
        decimal_places: 2,
        rounding: 0.01,
        symbol_position: 'before',
        is_active: true,
      });
    }

    return { ok: true as const };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to ensure default currencies',
    };
  }
}

// ---------- Currency Engine runtime APIs (consumed by modules) ----------

export async function getBaseCurrency(): Promise<
  { currency: CurrencyDef } | { error: string }
> {
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('currencies')
      .select(
        'id, code, name, symbol, decimal_places, rounding, symbol_position, is_base, is_active, sequence'
      )
      .eq('is_base', true)
      .maybeSingle();

    if (error) {
      if (/currencies|does not exist/i.test(error.message)) {
        return {
          currency: {
            id: 'fallback-pkr',
            code: FALLBACK_BASE_CURRENCY,
            name: 'Pakistani Rupee',
            symbol: 'Rs',
            decimal_places: 2,
            rounding: 0.01,
            symbol_position: 'before',
            is_base: true,
            is_active: true,
            sequence: 10,
          },
        };
      }
      return { error: error.message };
    }

    if (!data) {
      return {
        currency: {
          id: 'fallback-pkr',
          code: FALLBACK_BASE_CURRENCY,
          name: 'Pakistani Rupee',
          symbol: 'Rs',
          decimal_places: 2,
          rounding: 0.01,
          symbol_position: 'before',
          is_base: true,
          is_active: true,
          sequence: 10,
        },
      };
    }

    return { currency: toCurrencyDef(mapCurrencyRow(data as Record<string, unknown>)) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load base currency',
    };
  }
}

export async function getOrganizationCurrency(
  organizationId?: string | null
): Promise<{ currency: CurrencyDef } | { error: string }> {
  try {
    if (!organizationId) return getBaseCurrency();

    const supabase = await createAdminClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('currency_id')
      .eq('id', organizationId)
      .maybeSingle();

    if (!org?.currency_id) return getBaseCurrency();

    const { data, error } = await supabase
      .from('currencies')
      .select(
        'id, code, name, symbol, decimal_places, rounding, symbol_position, is_base, is_active, sequence'
      )
      .eq('id', org.currency_id)
      .maybeSingle();

    if (error || !data) return getBaseCurrency();
    return { currency: toCurrencyDef(mapCurrencyRow(data as Record<string, unknown>)) };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load organization currency',
    };
  }
}

export async function setOrganizationCurrency(
  organizationId: string,
  currencyId: string
) {
  try {
    const scope = await resolveCurrencyScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: currency } = await supabase
      .from('currencies')
      .select('id, is_active')
      .eq('id', currencyId)
      .maybeSingle();
    if (!currency || currency.is_active === false) {
      return { error: 'Currency not found or inactive.' };
    }

    const { error } = await supabase
      .from('organizations')
      .update({ currency_id: currencyId })
      .eq('id', organizationId);

    if (error) {
      if (/currency_id|column/i.test(error.message)) {
        return {
          error:
            'Run enhance_accounting_currencies_foundation.sql in Supabase first.',
        };
      }
      return { error: error.message };
    }
    return { ok: true as const };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to set organization currency',
    };
  }
}

export async function getCurrencyByCode(code: string): Promise<
  { currency: CurrencyDef } | { error: string }
> {
  try {
    const normalized = normalizeCurrencyCode(code);
    if (!normalized) return { error: 'Currency code is required.' };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('currencies')
      .select(
        'id, code, name, symbol, decimal_places, rounding, symbol_position, is_base, is_active, sequence'
      )
      .eq('code', normalized)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: `Currency ${normalized} not found.` };
    return { currency: toCurrencyDef(mapCurrencyRow(data as Record<string, unknown>)) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load currency',
    };
  }
}

/**
 * Resolve rate_to_base for a currency on/before a date.
 * Uses DB RPC when available; falls back to direct query.
 */
export async function resolveExchangeRateToBase(
  currencyCode: string,
  rateDate?: string
): Promise<{ rate: number; rate_date: string } | { error: string }> {
  try {
    const code = normalizeCurrencyCode(currencyCode);
    const date = (rateDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!code) return { error: 'Currency code is required.' };

    const base = await getBaseCurrency();
    if ('error' in base) return { error: base.error };
    if (base.currency.code === code) return { rate: 1, rate_date: date };

    const supabase = await createAdminClient();
    const { data: rpcRate, error: rpcError } = await supabase.rpc(
      'get_exchange_rate',
      {
        p_currency_code: code,
        p_rate_date: date,
      }
    );

    if (!rpcError && rpcRate != null) {
      return { rate: toFiniteAmount(rpcRate), rate_date: date };
    }

    const { data: currency } = await supabase
      .from('currencies')
      .select('id')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (!currency) return { error: `Currency ${code} not found.` };

    const { data: rateRow, error } = await supabase
      .from('exchange_rates')
      .select('rate_to_base, rate_date')
      .eq('currency_id', currency.id)
      .lte('rate_date', date)
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!rateRow) {
      return {
        error: `Exchange rate not found for ${code} on or before ${date}.`,
      };
    }

    return {
      rate: toFiniteAmount(rateRow.rate_to_base),
      rate_date: String(rateRow.rate_date),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to resolve exchange rate',
    };
  }
}

export async function convertCurrencyAmount(args: {
  amount: number;
  fromCode: string;
  toCode: string;
  rateDate?: string;
}): Promise<MoneyConversionResult | { error: string }> {
  try {
    const from = normalizeCurrencyCode(args.fromCode);
    const to = normalizeCurrencyCode(args.toCode);
    const date = (args.rateDate || new Date().toISOString().slice(0, 10)).slice(
      0,
      10
    );
    const amount = toFiniteAmount(args.amount);

    if (!from || !to) return { error: 'From and to currency codes are required.' };
    if (from === to) {
      return buildConversionResult({
        amount,
        fromCode: from,
        toCode: to,
        fromRateToBase: 1,
        toRateToBase: 1,
        rateDate: date,
      });
    }

    const supabase = await createAdminClient();
    const { data: rpcAmount, error: rpcError } = await supabase.rpc(
      'convert_currency_amount',
      {
        p_amount: amount,
        p_from_code: from,
        p_to_code: to,
        p_rate_date: date,
      }
    );

    const fromRateRes = await resolveExchangeRateToBase(from, date);
    if ('error' in fromRateRes) return fromRateRes;
    const toRateRes = await resolveExchangeRateToBase(to, date);
    if ('error' in toRateRes) return toRateRes;

    const toCurrency = await getCurrencyByCode(to);
    const decimals =
      'currency' in toCurrency && toCurrency.currency
        ? toCurrency.currency.decimal_places
        : 2;

    if (!rpcError && rpcAmount != null) {
      return buildConversionResult({
        amount: roundCurrencyAmount(toFiniteAmount(rpcAmount), decimals),
        fromCode: from,
        toCode: to,
        fromRateToBase: fromRateRes.rate,
        toRateToBase: toRateRes.rate,
        rateDate: date,
        toDecimalPlaces: decimals,
      });
    }

    return buildConversionResult({
      amount,
      fromCode: from,
      toCode: to,
      fromRateToBase: fromRateRes.rate,
      toRateToBase: toRateRes.rate,
      rateDate: date,
      toDecimalPlaces: decimals,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to convert currency',
    };
  }
}

/** Convert document amount into organization/company currency. */
export async function convertToCompanyCurrency(args: {
  amount: number;
  documentCurrencyCode: string;
  organizationId?: string | null;
  rateDate?: string;
}) {
  const company = await getOrganizationCurrency(args.organizationId);
  if ('error' in company) return { error: company.error };

  const converted = await convertCurrencyAmount({
    amount: args.amount,
    fromCode: args.documentCurrencyCode,
    toCode: company.currency.code,
    rateDate: args.rateDate,
  });
  if ('error' in converted) return converted;

  return {
    ...converted,
    company_currency: company.currency,
    company_amount: converted.amount,
  };
}

export async function formatAccountingMoney(
  amount: number,
  currencyCode?: string | null
) {
  const code = normalizeCurrencyCode(currencyCode) || FALLBACK_BASE_CURRENCY;
  const res = await getCurrencyByCode(code);
  if ('currency' in res) {
    return formatCurrencyAmount(amount, res.currency);
  }
  return formatCurrencyAmount(amount, {
    code,
    symbol: code,
    decimal_places: 2,
    symbol_position: 'before',
  });
}

/** Snapshot fields to stamp on invoices/bills/payments at create/post time. */
export async function resolveDocumentCurrencyFields(args: {
  organizationId?: string | null;
  currencyCode?: string | null;
  rateDate?: string;
  totalAmount?: number;
}): Promise<
  | {
      currency_id: string;
      currency_code: string;
      exchange_rate: number;
      company_currency_code: string;
      company_exchange_rate: number;
      amount_total_company: number;
      currency: CurrencyDef;
      company_currency: CurrencyDef;
    }
  | { error: string }
> {
  const company = await getOrganizationCurrency(args.organizationId);
  if ('error' in company) return { error: company.error };

  const docCode =
    normalizeCurrencyCode(args.currencyCode) || company.currency.code;
  const docCurrency = await getCurrencyByCode(docCode);
  if ('error' in docCurrency) return { error: docCurrency.error || 'Currency not found.' };

  const date = (args.rateDate || new Date().toISOString().slice(0, 10)).slice(
    0,
    10
  );
  const rateRes = await resolveExchangeRateToBase(docCode, date);
  if ('error' in rateRes) return { error: rateRes.error };

  const companyRateRes = await resolveExchangeRateToBase(
    company.currency.code,
    date
  );
  if ('error' in companyRateRes) return { error: companyRateRes.error };

  const total = toFiniteAmount(args.totalAmount);
  const converted = await convertCurrencyAmount({
    amount: total,
    fromCode: docCode,
    toCode: company.currency.code,
    rateDate: date,
  });
  if ('error' in converted) return { error: converted.error };

  return {
    currency_id: docCurrency.currency.id,
    currency_code: docCurrency.currency.code,
    /** Document currency → system base (rate_to_base). */
    exchange_rate: rateRes.rate,
    company_currency_code: company.currency.code,
    company_exchange_rate: companyRateRes.rate,
    amount_total_company: converted.amount,
    currency: docCurrency.currency,
    company_currency: company.currency,
  };
}
