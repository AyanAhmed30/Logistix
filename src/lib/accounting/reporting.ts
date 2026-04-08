import { createAdminClient } from '@/utils/supabase/server';

function toAmount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type LedgerFilter = {
  from?: string;
  to?: string;
  account_id?: string;
  partner_reference?: string;
  shipment_reference?: string;
};

export async function getGeneralLedger(filter: LedgerFilter = {}) {
  const supabase = await createAdminClient();
  let query = supabase
    .from('journal_entry_lines')
    .select(`
      id,
      journal_entry_id,
      line_order,
      account_id,
      partner_reference,
      shipment_reference,
      description,
      debit_amount,
      credit_amount,
      created_at,
      journal_entries!inner(id, entry_date, reference, status)
    `)
    .eq('journal_entries.status', 'posted')
    .order('created_at', { ascending: true });

  if (filter.account_id) query = query.eq('account_id', filter.account_id);
  if (filter.partner_reference) query = query.ilike('partner_reference', `%${filter.partner_reference}%`);
  if (filter.shipment_reference) query = query.eq('shipment_reference', filter.shipment_reference);
  if (filter.from) query = query.gte('journal_entries.entry_date', filter.from);
  if (filter.to) query = query.lte('journal_entries.entry_date', filter.to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getTrialBalance(from?: string, to?: string) {
  const rows = await getGeneralLedger({ from, to });
  const byAccount = new Map<string, { debit: number; credit: number }>();
  for (const row of rows) {
    const key = String((row as { account_id?: string }).account_id || '');
    const current = byAccount.get(key) || { debit: 0, credit: 0 };
    current.debit += toAmount((row as { debit_amount?: number }).debit_amount);
    current.credit += toAmount((row as { credit_amount?: number }).credit_amount);
    byAccount.set(key, current);
  }
  return Array.from(byAccount.entries()).map(([account_id, totals]) => ({
    account_id,
    debit: Math.round(totals.debit * 100) / 100,
    credit: Math.round(totals.credit * 100) / 100,
    balance: Math.round((totals.debit - totals.credit) * 100) / 100,
  }));
}

export async function getProfitAndLoss(from?: string, to?: string) {
  const supabase = await createAdminClient();
  const { data: accounts, error: accountsError } = await supabase
    .from('chart_of_accounts')
    .select('id, type')
    .in('type', ['income', 'expense']);
  if (accountsError) throw new Error(accountsError.message);
  const accountType = new Map((accounts || []).map((a) => [a.id as string, a.type as string]));

  const rows = await getGeneralLedger({ from, to });
  let income = 0;
  let expense = 0;
  for (const row of rows as Array<{ account_id: string; debit_amount: number; credit_amount: number }>) {
    const type = accountType.get(row.account_id);
    if (type === 'income') income += toAmount(row.credit_amount) - toAmount(row.debit_amount);
    if (type === 'expense') expense += toAmount(row.debit_amount) - toAmount(row.credit_amount);
  }
  return {
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    net_profit: Math.round((income - expense) * 100) / 100,
  };
}

export async function getBalanceSheet(asOf?: string) {
  const supabase = await createAdminClient();
  const { data: accounts, error: accountsError } = await supabase
    .from('chart_of_accounts')
    .select('id, type')
    .in('type', ['asset', 'liability', 'equity']);
  if (accountsError) throw new Error(accountsError.message);
  const accountType = new Map((accounts || []).map((a) => [a.id as string, a.type as string]));
  const rows = await getGeneralLedger({ to: asOf });
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  for (const row of rows as Array<{ account_id: string; debit_amount: number; credit_amount: number }>) {
    const type = accountType.get(row.account_id);
    const delta = toAmount(row.debit_amount) - toAmount(row.credit_amount);
    if (type === 'asset') assets += delta;
    if (type === 'liability') liabilities += -delta;
    if (type === 'equity') equity += -delta;
  }
  return {
    assets: Math.round(assets * 100) / 100,
    liabilities: Math.round(liabilities * 100) / 100,
    equity: Math.round(equity * 100) / 100,
  };
}

export async function getCashFlow(from?: string, to?: string) {
  const supabase = await createAdminClient();
  const { data: cashAccounts, error } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .in('code', ['1000', '1400', '1450']);
  if (error) throw new Error(error.message);
  const cashSet = new Set((cashAccounts || []).map((a) => a.id as string));
  const rows = await getGeneralLedger({ from, to });
  let inflow = 0;
  let outflow = 0;
  for (const row of rows as Array<{ account_id: string; debit_amount: number; credit_amount: number }>) {
    if (!cashSet.has(row.account_id)) continue;
    inflow += toAmount(row.debit_amount);
    outflow += toAmount(row.credit_amount);
  }
  return {
    inflow: Math.round(inflow * 100) / 100,
    outflow: Math.round(outflow * 100) / 100,
    net_cash: Math.round((inflow - outflow) * 100) / 100,
  };
}

export async function getARAging(asOf?: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, due_date, invoice_date, outstanding_amount, partner_id, invoice_status')
    .in('invoice_status', ['posted', 'paid']);
  if (error) throw new Error(error.message);
  const now = new Date(asOf || new Date().toISOString().slice(0, 10)).getTime();
  return (data || []).map((row: {
    id: string;
    invoice_number: string;
    due_date?: string | null;
    invoice_date?: string | null;
    outstanding_amount?: number | null;
    partner_id?: string | null;
  }) => {
    const due = new Date(row.due_date || row.invoice_date || new Date()).getTime();
    const days = Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
    return {
      invoice_id: row.id,
      invoice_number: row.invoice_number,
      partner_id: row.partner_id,
      outstanding_amount: toAmount(row.outstanding_amount),
      overdue_days: days,
      bucket: days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+',
    };
  });
}

export async function getAPAging(asOf?: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('vendor_bills')
    .select('id, bill_number, due_date, bill_date, outstanding_amount, vendor_partner_id, status')
    .in('status', ['posted', 'paid']);
  if (error) throw new Error(error.message);
  const now = new Date(asOf || new Date().toISOString().slice(0, 10)).getTime();
  return (data || []).map((row: {
    id: string;
    bill_number: string;
    due_date?: string | null;
    bill_date?: string | null;
    outstanding_amount?: number | null;
    vendor_partner_id?: string | null;
  }) => {
    const due = new Date(row.due_date || row.bill_date || new Date()).getTime();
    const days = Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
    return {
      bill_id: row.id,
      bill_number: row.bill_number,
      partner_id: row.vendor_partner_id,
      outstanding_amount: toAmount(row.outstanding_amount),
      overdue_days: days,
      bucket: days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+',
    };
  });
}

export async function getCodOutstanding() {
  const supabase = await createAdminClient();
  const { data: codAccount, error: codErr } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('code', '1450')
    .eq('is_active', true)
    .single();
  if (codErr || !codAccount) throw new Error(codErr?.message || 'COD clearing account not found');
  const rows = await getGeneralLedger({ account_id: codAccount.id });
  const outstanding = (rows as Array<{ debit_amount: number; credit_amount: number }>).reduce((acc, row) => {
    return acc + toAmount(row.debit_amount) - toAmount(row.credit_amount);
  }, 0);
  return { cod_outstanding: Math.round(outstanding * 100) / 100 };
}

export async function getShipmentProfitability(shipmentId: string) {
  const rows = await getGeneralLedger({ shipment_reference: shipmentId });
  let revenue = 0;
  let cost = 0;
  for (const row of rows as Array<{ description: string; debit_amount: number; credit_amount: number }>) {
    const d = String(row.description || '').toLowerCase();
    if (d.includes('revenue')) revenue += toAmount(row.credit_amount) - toAmount(row.debit_amount);
    if (d.includes('expense') || d.includes('cost') || d.includes('duty')) cost += toAmount(row.debit_amount) - toAmount(row.credit_amount);
  }
  return {
    shipment_id: shipmentId,
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    profit: Math.round((revenue - cost) * 100) / 100,
  };
}
