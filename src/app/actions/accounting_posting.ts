'use server';

import { createAdminClient } from '@/utils/supabase/server';

type JournalType = 'sales' | 'purchase' | 'bank' | 'cash' | 'general';
type PartnerKind = 'customer' | 'vendor' | 'agent';

type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'view';
  is_active: boolean;
  allow_reconciliation: boolean;
};

type JournalRow = {
  id: string;
  type: JournalType;
  name: string;
  code: string;
  is_active: boolean;
  default_debit_account_id: string | null;
  default_credit_account_id: string | null;
};

type PartnerRow = {
  id: string;
  name: string;
  partner_type: 'customer' | 'vendor' | 'agent' | 'both';
  status: 'active' | 'inactive';
};

type PostingLine = {
  account_id: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  partner_reference?: string | null;
};

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function ensureAmountPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function ensureLineSide(line: PostingLine, index: number) {
  if (line.debit_amount < 0 || line.credit_amount < 0) {
    throw new Error(`Line ${index + 1}: negative amounts are not allowed.`);
  }
  if (line.debit_amount > 0 && line.credit_amount > 0) {
    throw new Error(`Line ${index + 1}: debit and credit cannot both be greater than zero.`);
  }
  if (line.debit_amount === 0 && line.credit_amount === 0) {
    throw new Error(`Line ${index + 1}: either debit or credit must be greater than zero.`);
  }
}

function assertPartnerType(partner: PartnerRow, expected: PartnerKind) {
  const ok =
    expected === 'customer'
      ? partner.partner_type === 'customer' || partner.partner_type === 'both'
      : expected === 'vendor'
        ? partner.partner_type === 'vendor' || partner.partner_type === 'both'
        : partner.partner_type === 'agent';
  if (!ok) {
    throw new Error(`Partner "${partner.name}" is not a valid ${expected}.`);
  }
}

export async function getActivePartner(partnerId: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('partners')
    .select('id, name, partner_type, status')
    .eq('id', partnerId)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Active partner not found.');
  }
  return data as PartnerRow;
}

export async function getJournalByType(type: JournalType) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('journals')
    .select('id, type, name, code, is_active, default_debit_account_id, default_credit_account_id')
    .eq('type', type)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(error?.message || `Active ${type} journal not found.`);
  }
  return data as JournalRow;
}

export async function getAccountByCode(code: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, is_active, allow_reconciliation')
    .eq('code', code)
    .eq('is_active', true)
    .single();
  if (error || !data) {
    throw new Error(error?.message || `Active account ${code} not found.`);
  }
  return data as AccountRow;
}

export async function getFirstActiveAccountByType(type: AccountRow['type']) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, is_active, allow_reconciliation')
    .eq('type', type)
    .eq('is_active', true)
    .order('code', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(error?.message || `Active ${type} account not found.`);
  }
  return data as AccountRow;
}

export async function createAndPostJournalEntry(params: {
  reference: string;
  entryDate: string;
  journalId: string;
  lines: PostingLine[];
}) {
  const supabase = await createAdminClient();
  const lines = params.lines.map((line) => ({
    ...line,
    debit_amount: roundAmount(line.debit_amount),
    credit_amount: roundAmount(line.credit_amount),
  }));

  if (lines.length < 2) {
    throw new Error('At least 2 lines are required.');
  }

  let totalDebit = 0;
  let totalCredit = 0;
  lines.forEach((line, idx) => {
    ensureLineSide(line, idx);
    totalDebit += line.debit_amount;
    totalCredit += line.credit_amount;
  });
  totalDebit = roundAmount(totalDebit);
  totalCredit = roundAmount(totalCredit);
  if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
    throw new Error('Total debit must equal total credit and be greater than zero.');
  }

  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert([
      {
        reference: params.reference,
        entry_date: params.entryDate,
        journal_id: params.journalId,
        status: 'posted',
        total_debit: totalDebit,
        total_credit: totalCredit,
        updated_at: new Date().toISOString(),
      },
    ])
    .select('*')
    .single();

  if (entryError || !entry) {
    throw new Error(entryError?.message || 'Failed to create journal entry.');
  }

  const payload = lines.map((line, index) => ({
    journal_entry_id: entry.id,
    line_order: index + 1,
    account_id: line.account_id,
    partner_reference: line.partner_reference || null,
    description: line.description,
    debit_amount: line.debit_amount,
    credit_amount: line.credit_amount,
    updated_at: new Date().toISOString(),
  }));

  const { error: linesError } = await supabase.from('journal_entry_lines').insert(payload);
  if (linesError) {
    await supabase.from('journal_entries').delete().eq('id', entry.id);
    throw new Error(linesError.message);
  }

  return entry.id as string;
}

export async function buildInvoicePosting(args: {
  amount: number;
  partnerId: string;
  invoiceNumber: string;
  entryDate: string;
}) {
  ensureAmountPositive(args.amount, 'Invoice amount');
  const partner = await getActivePartner(args.partnerId);
  assertPartnerType(partner, 'customer');

  const salesJournal = await getJournalByType('sales');
  const receivable = await getAccountByCode('1300');
  if (receivable.type !== 'asset' || !receivable.allow_reconciliation) {
    throw new Error('Accounts Receivable (1300) must be active and reconciliation-enabled.');
  }
  const revenue = await getAccountByCode('4100');
  if (revenue.type !== 'income') {
    throw new Error('Revenue account (4100) must be an income account.');
  }

  return {
    journalId: salesJournal.id,
    lines: [
      {
        account_id: receivable.id,
        description: `Invoice ${args.invoiceNumber} receivable`,
        debit_amount: roundAmount(args.amount),
        credit_amount: 0,
        partner_reference: `customer:${partner.name}`,
      },
      {
        account_id: revenue.id,
        description: `Invoice ${args.invoiceNumber} revenue`,
        debit_amount: 0,
        credit_amount: roundAmount(args.amount),
      },
    ] satisfies PostingLine[],
  };
}

export async function buildVendorBillPosting(args: {
  amount: number;
  partnerId: string;
  billNumber: string;
  entryDate: string;
  expenseAccountId?: string | null;
  payableAccountId?: string | null;
}) {
  ensureAmountPositive(args.amount, 'Bill amount');
  const partner = await getActivePartner(args.partnerId);
  assertPartnerType(partner, 'vendor');

  const purchaseJournal = await getJournalByType('purchase');
  const payable = args.payableAccountId
    ? await (async () => {
        const supabase = await createAdminClient();
        const { data, error } = await supabase
          .from('chart_of_accounts')
          .select('id, code, name, type, is_active, allow_reconciliation')
          .eq('id', args.payableAccountId)
          .eq('is_active', true)
          .single();
        if (error || !data) throw new Error(error?.message || 'Payable account not found.');
        return data as AccountRow;
      })()
    : await getAccountByCode('2100');
  if (payable.type !== 'liability' || !payable.allow_reconciliation) {
    throw new Error('Accounts Payable (2100) must be active and reconciliation-enabled.');
  }
  const expense = args.expenseAccountId
    ? await (async () => {
        const supabase = await createAdminClient();
        const { data, error } = await supabase
          .from('chart_of_accounts')
          .select('id, code, name, type, is_active, allow_reconciliation')
          .eq('id', args.expenseAccountId)
          .eq('is_active', true)
          .single();
        if (error || !data) throw new Error(error?.message || 'Expense account not found.');
        return data as AccountRow;
      })()
    : await getAccountByCode('5100');
  if (expense.type !== 'expense' && expense.type !== 'asset') {
    throw new Error('Expense account (5100) must be expense or asset.');
  }

  return {
    journalId: purchaseJournal.id,
    lines: [
      {
        account_id: expense.id,
        description: `Bill ${args.billNumber} expense`,
        debit_amount: roundAmount(args.amount),
        credit_amount: 0,
      },
      {
        account_id: payable.id,
        description: `Bill ${args.billNumber} payable`,
        debit_amount: 0,
        credit_amount: roundAmount(args.amount),
        partner_reference: `vendor:${partner.name}`,
      },
    ] satisfies PostingLine[],
  };
}

export async function buildPaymentPosting(args: {
  amount: number;
  partnerId: string;
  partnerName: string;
  paymentType: 'inbound' | 'outbound';
  liquidityAccountId: string;
}) {
  ensureAmountPositive(args.amount, 'Payment amount');

  const receivable = await getAccountByCode('1300');
  const payable = await getAccountByCode('2100');

  if (args.paymentType === 'inbound') {
    return [
      {
        account_id: args.liquidityAccountId,
        description: 'Customer payment received',
        debit_amount: roundAmount(args.amount),
        credit_amount: 0,
      },
      {
        account_id: receivable.id,
        description: 'Customer payment settlement',
        debit_amount: 0,
        credit_amount: roundAmount(args.amount),
        partner_reference: `customer:${args.partnerName}`,
      },
    ] satisfies PostingLine[];
  }

  return [
    {
      account_id: payable.id,
      description: 'Vendor payment settlement',
      debit_amount: roundAmount(args.amount),
      credit_amount: 0,
      partner_reference: `vendor:${args.partnerName}`,
    },
    {
      account_id: args.liquidityAccountId,
      description: 'Vendor payment disbursed',
      debit_amount: 0,
      credit_amount: roundAmount(args.amount),
    },
  ] satisfies PostingLine[];
}
