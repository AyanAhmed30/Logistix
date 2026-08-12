/**
 * Build balanced posting lines for ERP Accounting documents.
 * Uses chart_of_accounts codes with type fallbacks.
 */

import { createAdminClient } from '@/utils/supabase/server';
import {
  lineUntaxedAmount,
  splitAmountsByAccount,
} from '@/lib/product-accounting';
import { formatTaxReportLabel } from '@/lib/accounting/financial-reporting/tax-label';

export type AutoPostingLine = {
  account_id: string;
  label: string;
  partner_name?: string | null;
  contact_id?: string | null;
  debit: number;
  credit: number;
  /** Tax master display label for Tax Report (e.g. "GST 18% (18.0%)"). */
  tax_label?: string | null;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export { formatTaxReportLabel };

async function accountByCode(code: string, organizationId?: string | null) {
  const supabase = await createAdminClient();
  if (organizationId) {
    const { data: orgHit } = await supabase
      .from('chart_of_accounts')
      .select('id, code, name, type, organization_id')
      .eq('code', code)
      .eq('is_active', true)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (orgHit?.id) return orgHit;
  }
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, organization_id')
    .eq('code', code)
    .eq('is_active', true)
    .is('organization_id', null)
    .maybeSingle();
  if (data?.id) return data;
  // Legacy rows without organization_id column / mixed data
  const { data: anyHit } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type')
    .eq('code', code)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return anyHit;
}

async function accountByType(type: string, organizationId?: string | null) {
  const supabase = await createAdminClient();
  if (organizationId) {
    const { data: orgHit } = await supabase
      .from('chart_of_accounts')
      .select('id, code, name, type, organization_id')
      .eq('type', type)
      .eq('is_active', true)
      .eq('organization_id', organizationId)
      .order('code', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (orgHit?.id) return orgHit;
  }
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, organization_id')
    .eq('type', type)
    .eq('is_active', true)
    .is('organization_id', null)
    .order('code', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data?.id) return data;
  const { data: anyHit } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type')
    .eq('type', type)
    .eq('is_active', true)
    .order('code', { ascending: true })
    .limit(1)
    .maybeSingle();
  return anyHit;
}

async function resolveAccount(
  preferredCode: string,
  fallbackType: string,
  organizationId?: string | null
) {
  const byCode = await accountByCode(preferredCode, organizationId);
  if (byCode?.id) return byCode;
  const byType = await accountByType(fallbackType, organizationId);
  if (byType?.id) return byType;
  throw new Error(
    `Chart of Accounts missing account ${preferredCode} (or type ${fallbackType}). Seed CoA first.`
  );
}

/**
 * Resolve the active journal for a document type.
 * Prefers organization-specific journals, then shared (organization_id null).
 */
export async function getJournalIdByType(
  type: 'sales' | 'purchase' | 'bank' | 'cash' | 'general',
  organizationId?: string | null
) {
  const supabase = await createAdminClient();
  const selectCols =
    'id, code, name, type, currency, default_debit_account_id, default_credit_account_id';

  if (organizationId) {
    const { data: orgJournal, error: orgErr } = await supabase
      .from('journals')
      .select(selectCols)
      .eq('type', type)
      .eq('is_active', true)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!orgErr && orgJournal?.id) return orgJournal;
  }

  const { data: shared, error: sharedErr } = await supabase
    .from('journals')
    .select(selectCols)
    .eq('type', type)
    .eq('is_active', true)
    .is('organization_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!sharedErr && shared?.id) return shared;

  // Legacy fallback (pre-migration: no organization_id column / all rows)
  const { data: legacy, error: legacyErr } = await supabase
    .from('journals')
    .select('id, code, name, type')
    .eq('type', type)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (legacyErr || !legacy?.id) {
    throw new Error(
      legacyErr?.message ||
        sharedErr?.message ||
        `Active ${type} journal not found. Seed journals first.`
    );
  }
  return legacy;
}

/** Load product income/expense account splits for a document's lines. */
async function loadProductAccountSplits(opts: {
  lines: Array<{
    product_id?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    discount?: number | null;
    untaxed_amount?: number | null;
  }>;
  side: 'income' | 'expense';
  fallbackAccountId: string;
}): Promise<Array<{ accountId: string; amount: number }>> {
  const productIds = [
    ...new Set(
      opts.lines
        .map((l) => (l.product_id ? String(l.product_id) : ''))
        .filter(Boolean)
    ),
  ];
  const accountByProduct = new Map<string, string>();
  if (productIds.length) {
    const supabase = await createAdminClient();
    const col =
      opts.side === 'income' ? 'income_account_id' : 'expense_account_id';
    const { data } = await supabase
      .from('products')
      .select(`id, ${col}`)
      .in('id', productIds);
    for (const p of data || []) {
      const acc = (p as Record<string, unknown>)[col];
      if (acc) accountByProduct.set(String(p.id), String(acc));
    }
  }

  const rows = opts.lines.map((l) => ({
    accountId: l.product_id
      ? accountByProduct.get(String(l.product_id)) || null
      : null,
    amount: lineUntaxedAmount(l),
  }));

  const splits = splitAmountsByAccount(rows, opts.fallbackAccountId);
  const totalSplit = round2(splits.reduce((s, x) => s + x.amount, 0));
  if (totalSplit <= 0) {
    return [{ accountId: opts.fallbackAccountId, amount: 0 }];
  }
  return splits.filter((s) => s.amount > 0);
}

function scaleSplitsToTarget(
  splits: Array<{ accountId: string; amount: number }>,
  target: number
): Array<{ accountId: string; amount: number }> {
  const splitSum = round2(splits.reduce((s, x) => s + x.amount, 0));
  if (splitSum <= 0 || Math.abs(splitSum - target) <= 0.02) {
    return splits.length ? splits : [{ accountId: '', amount: target }];
  }
  const factor = target / splitSum;
  return splits.map((s, i) => ({
    accountId: s.accountId,
    amount:
      i === splits.length - 1
        ? round2(
            target -
              splits
                .slice(0, -1)
                .reduce((a, x) => a + round2(x.amount * factor), 0)
          )
        : round2(s.amount * factor),
  }));
}

/** Customer invoice: Dr Receivable / Cr Revenue (+ tax if any). */
export async function buildCustomerInvoiceLines(args: {
  untaxed: number;
  tax: number;
  total: number;
  partnerName: string;
  contactId?: string | null;
  invoiceNumber: string;
  organizationId?: string | null;
  taxAccountId?: string | null;
  /** When set, revenue is split by each product's income account. */
  invoiceId?: string | null;
}): Promise<{ journalId: string; lines: AutoPostingLine[] }> {
  const total = round2(args.total);
  if (total <= 0) throw new Error('Invoice total must be greater than zero');

  const journal = await getJournalIdByType('sales', args.organizationId);
  const receivable = await resolveAccount('1300', 'asset', args.organizationId);
  const revenue = await resolveAccount('4100', 'income', args.organizationId);
  const untaxed = round2(args.untaxed);
  const tax = round2(args.tax);

  let revenueSplits: Array<{ accountId: string; amount: number }> = [
    { accountId: revenue.id, amount: untaxed > 0 ? untaxed : total },
  ];

  if (args.invoiceId) {
    const supabase = await createAdminClient();
    let invLines: Array<Record<string, unknown>> | null = null;
    const withAccount = await supabase
      .from('accounting_customer_invoice_lines')
      .select('product_id, account_id, quantity, unit_price, discount')
      .eq('invoice_id', args.invoiceId);
    if (withAccount.error && /account_id|column/i.test(withAccount.error.message)) {
      const legacy = await supabase
        .from('accounting_customer_invoice_lines')
        .select('product_id, quantity, unit_price, discount')
        .eq('invoice_id', args.invoiceId);
      invLines = (legacy.data || []) as Array<Record<string, unknown>>;
    } else {
      invLines = (withAccount.data || []) as Array<Record<string, unknown>>;
    }

    // Prefer explicit line account_id (CoA), else product income account, else 4100
    const rows = (invLines || []).map((l) => ({
      product_id: l.product_id ? String(l.product_id) : null,
      account_id: l.account_id ? String(l.account_id) : null,
      quantity: Number(l.quantity) || 0,
      unit_price: Number(l.unit_price) || 0,
      discount: Number(l.discount) || 0,
    }));

    const productIds = [
      ...new Set(rows.map((r) => r.product_id).filter(Boolean) as string[]),
    ];
    const productIncome = new Map<string, string>();
    if (productIds.length) {
      const { data: products } = await supabase
        .from('products')
        .select('id, income_account_id')
        .in('id', productIds);
      for (const p of products || []) {
        if (p.income_account_id) {
          productIncome.set(String(p.id), String(p.income_account_id));
        }
      }
    }

    const splitRows = rows.map((r) => ({
      accountId:
        r.account_id ||
        (r.product_id ? productIncome.get(r.product_id) || null : null),
      amount: lineUntaxedAmount(r),
    }));
    const loaded = splitAmountsByAccount(splitRows, revenue.id).filter(
      (s) => s.amount > 0
    );
    if (loaded.some((s) => s.amount > 0)) {
      revenueSplits = scaleSplitsToTarget(
        loaded,
        untaxed > 0 ? untaxed : total
      ).map((s) => ({
        accountId: s.accountId || revenue.id,
        amount: s.amount,
      }));
    }
  }

  const lines: AutoPostingLine[] = [
    {
      account_id: receivable.id,
      label: `Invoice ${args.invoiceNumber}`,
      partner_name: args.partnerName,
      contact_id: args.contactId || null,
      debit: total,
      credit: 0,
    },
  ];

  if (tax > 0 && untaxed > 0) {
    for (const split of revenueSplits) {
      if (split.amount <= 0) continue;
      lines.push({
        account_id: split.accountId,
        label: `Revenue ${args.invoiceNumber}`,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: 0,
        credit: split.amount,
      });
    }
    let taxAccountId = args.taxAccountId || null;
    let taxDisplayLabel: string | null = null;
    if (!taxAccountId) {
      try {
        const { resolveDefaultTaxAccount } = await import(
          '@/app/actions/accounting/taxes'
        );
        const resolved = await resolveDefaultTaxAccount({
          organizationId: args.organizationId,
          kind: 'sales',
        });
        taxAccountId = resolved.accountId;
        taxDisplayLabel = formatTaxReportLabel(
          resolved.label,
          resolved.rateValue
        );
      } catch {
        taxAccountId = null;
      }
    }
    const taxAccount = taxAccountId
      ? { id: taxAccountId }
      : await resolveAccount('2200', 'liability', args.organizationId).catch(() =>
          resolveAccount('2100', 'liability', args.organizationId)
        );
    lines.push({
      account_id: taxAccount.id,
      label: `Tax ${args.invoiceNumber}`,
      tax_label: taxDisplayLabel || `Tax ${args.invoiceNumber}`,
      debit: 0,
      credit: tax,
    });
  } else {
    for (const split of revenueSplits) {
      const amt = untaxed > 0 ? split.amount : total;
      if (amt <= 0) continue;
      lines.push({
        account_id: split.accountId,
        label: `Revenue ${args.invoiceNumber}`,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: 0,
        credit: amt,
      });
    }
  }

  return { journalId: journal.id, lines };
}

/** Customer payment: Dr Bank/Cash / Cr Receivable. */
export async function buildCustomerPaymentLines(args: {
  amount: number;
  partnerName: string;
  contactId?: string | null;
  paymentNumber?: string;
  journalKind: 'bank' | 'cash';
  organizationId?: string | null;
}): Promise<{ journalId: string; lines: AutoPostingLine[] }> {
  const amount = round2(args.amount);
  if (amount <= 0) throw new Error('Payment amount must be greater than zero');

  const journal = await getJournalIdByType(args.journalKind, args.organizationId);
  const liquidityCode = args.journalKind === 'cash' ? '1010' : '1000';
  const liquidity = await resolveAccount(liquidityCode, 'asset', args.organizationId);
  const receivable = await resolveAccount('1300', 'asset', args.organizationId);
  const label = args.paymentNumber
    ? `Payment ${args.paymentNumber}`
    : 'Customer payment';

  return {
    journalId: journal.id,
    lines: [
      {
        account_id: liquidity.id,
        label,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: amount,
        credit: 0,
      },
      {
        account_id: receivable.id,
        label: `${label} settlement`,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: 0,
        credit: amount,
      },
    ],
  };
}

/** Credit note: reverse invoice impact — Dr Revenue / Cr Receivable. */
export async function buildCreditNoteLines(args: {
  untaxed: number;
  tax: number;
  total: number;
  partnerName: string;
  contactId?: string | null;
  creditNoteNumber: string;
  organizationId?: string | null;
  taxAccountId?: string | null;
  creditNoteId?: string | null;
}): Promise<{ journalId: string; lines: AutoPostingLine[] }> {
  const total = round2(args.total);
  if (total <= 0) throw new Error('Credit note total must be greater than zero');

  const journal = await getJournalIdByType('sales', args.organizationId);
  const receivable = await resolveAccount('1300', 'asset', args.organizationId);
  const revenue = await resolveAccount('4100', 'income', args.organizationId);
  const untaxed = round2(args.untaxed);
  const tax = round2(args.tax);

  let revenueSplits: Array<{ accountId: string; amount: number }> = [
    { accountId: revenue.id, amount: untaxed > 0 ? untaxed : total },
  ];
  if (args.creditNoteId) {
    const supabase = await createAdminClient();
    const { data: cnLines } = await supabase
      .from('accounting_credit_note_lines')
      .select('product_id, quantity, unit_price, discount')
      .eq('credit_note_id', args.creditNoteId);
    const loaded = await loadProductAccountSplits({
      lines: cnLines || [],
      side: 'income',
      fallbackAccountId: revenue.id,
    });
    if (loaded.some((s) => s.amount > 0)) {
      revenueSplits = scaleSplitsToTarget(
        loaded,
        untaxed > 0 ? untaxed : total
      ).map((s) => ({
        accountId: s.accountId || revenue.id,
        amount: s.amount,
      }));
    }
  }

  const lines: AutoPostingLine[] = [];

  if (tax > 0 && untaxed > 0) {
    for (const split of revenueSplits) {
      if (split.amount <= 0) continue;
      lines.push({
        account_id: split.accountId,
        label: `Credit note ${args.creditNoteNumber}`,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: split.amount,
        credit: 0,
      });
    }
    let taxAccountId = args.taxAccountId || null;
    let taxDisplayLabel: string | null = null;
    if (!taxAccountId) {
      try {
        const { resolveDefaultTaxAccount } = await import(
          '@/app/actions/accounting/taxes'
        );
        const resolved = await resolveDefaultTaxAccount({
          organizationId: args.organizationId,
          kind: 'sales',
        });
        taxAccountId = resolved.accountId;
        taxDisplayLabel = formatTaxReportLabel(
          resolved.label,
          resolved.rateValue
        );
      } catch {
        taxAccountId = null;
      }
    }
    const taxAccount = taxAccountId
      ? { id: taxAccountId }
      : await resolveAccount('2200', 'liability', args.organizationId).catch(() =>
          resolveAccount('2100', 'liability', args.organizationId)
        );
    lines.push({
      account_id: taxAccount.id,
      label: `Tax credit ${args.creditNoteNumber}`,
      tax_label: taxDisplayLabel || `Tax credit ${args.creditNoteNumber}`,
      debit: tax,
      credit: 0,
    });
  } else {
    for (const split of revenueSplits) {
      const amt = untaxed > 0 ? split.amount : total;
      if (amt <= 0) continue;
      lines.push({
        account_id: split.accountId,
        label: `Credit note ${args.creditNoteNumber}`,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: amt,
        credit: 0,
      });
    }
  }

  lines.push({
    account_id: receivable.id,
    label: `Credit note ${args.creditNoteNumber}`,
    partner_name: args.partnerName,
    contact_id: args.contactId || null,
    debit: 0,
    credit: total,
  });

  return { journalId: journal.id, lines };
}

/** Vendor bill: Dr Expense (+ recoverable tax) / Cr Payable. */
export async function buildVendorBillLines(args: {
  total: number;
  untaxed?: number;
  tax?: number;
  partnerName: string;
  contactId?: string | null;
  billNumber: string;
  organizationId?: string | null;
  taxAccountId?: string | null;
  billId?: string | null;
}): Promise<{ journalId: string; lines: AutoPostingLine[] }> {
  const total = round2(args.total);
  if (total <= 0) throw new Error('Bill total must be greater than zero');

  const journal = await getJournalIdByType('purchase', args.organizationId);
  const expense = await resolveAccount('5100', 'expense', args.organizationId);
  const payable = await resolveAccount('2100', 'liability', args.organizationId);
  const untaxed = round2(
    args.untaxed != null ? args.untaxed : Math.max(total - (args.tax || 0), 0)
  );
  const tax = round2(args.tax != null ? args.tax : Math.max(total - untaxed, 0));

  let expenseSplits: Array<{ accountId: string; amount: number }> = [
    { accountId: expense.id, amount: untaxed > 0 ? untaxed : total },
  ];
  if (args.billId) {
    const supabase = await createAdminClient();
    const { data: billLines } = await supabase
      .from('accounting_vendor_bill_lines')
      .select('product_id, quantity, unit_price, discount')
      .eq('bill_id', args.billId);
    const loaded = await loadProductAccountSplits({
      lines: billLines || [],
      side: 'expense',
      fallbackAccountId: expense.id,
    });
    if (loaded.some((s) => s.amount > 0)) {
      expenseSplits = scaleSplitsToTarget(
        loaded,
        untaxed > 0 ? untaxed : total
      ).map((s) => ({
        accountId: s.accountId || expense.id,
        amount: s.amount,
      }));
    }
  }

  const lines: AutoPostingLine[] = [];

  if (tax > 0 && untaxed > 0) {
    for (const split of expenseSplits) {
      if (split.amount <= 0) continue;
      lines.push({
        account_id: split.accountId,
        label: `Bill ${args.billNumber}`,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: split.amount,
        credit: 0,
      });
    }

    let taxAccountId = args.taxAccountId || null;
    let taxDisplayLabel: string | null = null;
    if (!taxAccountId) {
      try {
        const { resolveDefaultTaxAccount } = await import(
          '@/app/actions/accounting/taxes'
        );
        const resolved = await resolveDefaultTaxAccount({
          organizationId: args.organizationId,
          kind: 'purchase',
        });
        taxAccountId = resolved.accountId;
        taxDisplayLabel = formatTaxReportLabel(
          resolved.label,
          resolved.rateValue
        );
      } catch {
        taxAccountId = null;
      }
    }
    const taxAccount = taxAccountId
      ? { id: taxAccountId }
      : await resolveAccount('1400', 'asset', args.organizationId).catch(() =>
          resolveAccount('1300', 'asset', args.organizationId).catch(() => expense)
        );

    lines.push({
      account_id: taxAccount.id,
      label: `Tax ${args.billNumber}`,
      tax_label: taxDisplayLabel || `Tax ${args.billNumber}`,
      partner_name: args.partnerName,
      contact_id: args.contactId || null,
      debit: tax,
      credit: 0,
    });
  } else {
    for (const split of expenseSplits) {
      const amt = untaxed > 0 ? split.amount : total;
      if (amt <= 0) continue;
      lines.push({
        account_id: split.accountId,
        label: `Bill ${args.billNumber}`,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: amt,
        credit: 0,
      });
    }
  }

  lines.push({
    account_id: payable.id,
    label: `Bill ${args.billNumber}`,
    partner_name: args.partnerName,
    contact_id: args.contactId || null,
    debit: 0,
    credit: total,
  });

  return { journalId: journal.id, lines };
}

/** Vendor payment: Dr Payable / Cr Bank/Cash. */
export async function buildVendorPaymentLines(args: {
  amount: number;
  partnerName: string;
  contactId?: string | null;
  paymentReference?: string;
  journalKind: 'bank' | 'cash';
  organizationId?: string | null;
}): Promise<{ journalId: string; lines: AutoPostingLine[] }> {
  const amount = round2(args.amount);
  if (amount <= 0) throw new Error('Payment amount must be greater than zero');

  const journal = await getJournalIdByType(args.journalKind, args.organizationId);
  const liquidityCode = args.journalKind === 'cash' ? '1010' : '1000';
  const liquidity = await resolveAccount(liquidityCode, 'asset', args.organizationId);
  const payable = await resolveAccount('2100', 'liability', args.organizationId);
  const label = args.paymentReference
    ? `Vendor payment ${args.paymentReference}`
    : 'Vendor payment';

  return {
    journalId: journal.id,
    lines: [
      {
        account_id: payable.id,
        label: `${label} settlement`,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: amount,
        credit: 0,
      },
      {
        account_id: liquidity.id,
        label,
        partner_name: args.partnerName,
        contact_id: args.contactId || null,
        debit: 0,
        credit: amount,
      },
    ],
  };
}
