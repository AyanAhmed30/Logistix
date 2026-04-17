import { createAdminClient } from '@/utils/supabase/server';
import { createAndPostJournalEntry } from '@/app/actions/accounting_posting';

type TaxType = 'sales_tax' | 'purchase_tax' | 'withholding_tax';
type RateType = 'percentage' | 'fixed';

export type TaxDefinition = {
  id: string;
  name: string;
  code: string;
  type: TaxType;
  rate_type: RateType;
  rate_value: number;
  is_inclusive: boolean;
  account_id: string;
  is_active: boolean;
};

export type TaxInputLine = {
  lineKey: string;
  amount: number;
  currencyCode?: string | null;
  exchangeRate?: number | null;
  taxIds?: string[];
  taxCodes?: string[];
};

export type TaxBreakdown = {
  tax: TaxDefinition;
  baseAmount: number;
  taxAmount: number;
  grossAmount: number;
  foreignBaseAmount: number | null;
  foreignTaxAmount: number | null;
  foreignGrossAmount: number | null;
};

export type CalculatedTaxLine = {
  lineKey: string;
  netBaseAmount: number;
  grossBaseAmount: number;
  currencyCode: string | null;
  exchangeRate: number | null;
  netForeignAmount: number | null;
  grossForeignAmount: number | null;
  taxes: TaxBreakdown[];
};

function toAmount(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function ensureValidRate(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Exchange rate must be greater than zero.');
  }
}

function normalizeCode(code: string) {
  return String(code || '').trim().toUpperCase();
}

export async function getActiveTaxes(params: { ids?: string[]; codes?: string[]; type?: TaxType }) {
  const supabase = await createAdminClient();
  let query = supabase
    .from('taxes')
    .select('id, name, code, type, rate_type, rate_value, is_inclusive, account_id, is_active')
    .eq('is_active', true);

  if (params.type) query = query.eq('type', params.type);
  if (params.ids && params.ids.length > 0) query = query.in('id', params.ids);
  if (params.codes && params.codes.length > 0) query = query.in('code', params.codes.map(normalizeCode));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as TaxDefinition[];
}

export function calculate_tax(line: TaxInputLine, taxes: TaxDefinition[]): CalculatedTaxLine {
  const amount = toAmount(line.amount);
  if (amount < 0) throw new Error('Line amount cannot be negative.');
  const currencyCode = line.currencyCode ? normalizeCode(line.currencyCode) : null;
  const exchangeRate = currencyCode ? toAmount(line.exchangeRate) : null;
  if (currencyCode && (!exchangeRate || exchangeRate <= 0)) {
    throw new Error('Exchange rate must exist for foreign-currency tax calculation.');
  }

  const percentageInclusive = taxes.filter((t) => t.is_inclusive && t.rate_type === 'percentage');
  const fixedInclusive = taxes.filter((t) => t.is_inclusive && t.rate_type === 'fixed');
  const inclusiveRateSum = percentageInclusive.reduce((sum, t) => sum + toAmount(t.rate_value), 0);
  const fixedInclusiveTotal = fixedInclusive.reduce((sum, t) => sum + toAmount(t.rate_value), 0);

  const grossForeign = currencyCode ? amount : null;
  const grossBase = currencyCode ? round2(amount * (exchangeRate || 0)) : round2(amount);

  const netForeign = currencyCode
    ? round2((Math.max(amount - fixedInclusiveTotal, 0)) / (1 + inclusiveRateSum / 100))
    : null;
  const netBase = currencyCode
    ? round2((netForeign || 0) * (exchangeRate || 0))
    : round2((Math.max(amount - fixedInclusiveTotal, 0)) / (1 + inclusiveRateSum / 100));

  const baseForExclusive = netBase;
  const foreignForExclusive = netForeign;

  const taxRows: TaxBreakdown[] = [];
  for (const tax of taxes) {
    const rate = toAmount(tax.rate_value);
    if (rate < 0) throw new Error(`Invalid tax rate for ${tax.code}`);
    let taxForeign: number | null = null;
    let taxBase = 0;
    if (tax.is_inclusive) {
      if (tax.rate_type === 'percentage') {
        taxForeign = currencyCode ? round2((netForeign || 0) * (rate / 100)) : null;
        taxBase = round2(netBase * (rate / 100));
      } else {
        taxForeign = currencyCode ? round2(rate) : null;
        taxBase = currencyCode ? round2(rate * (exchangeRate || 0)) : round2(rate);
      }
    } else if (tax.rate_type === 'percentage') {
      taxForeign = currencyCode ? round2((foreignForExclusive || 0) * (rate / 100)) : null;
      taxBase = round2(baseForExclusive * (rate / 100));
    } else {
      taxForeign = currencyCode ? round2(rate) : null;
      taxBase = currencyCode ? round2(rate * (exchangeRate || 0)) : round2(rate);
    }
    const baseForThis = tax.is_inclusive ? netBase : baseForExclusive;
    const foreignBaseForThis = currencyCode ? (tax.is_inclusive ? (netForeign || 0) : (foreignForExclusive || 0)) : null;
    taxRows.push({
      tax,
      baseAmount: round2(baseForThis),
      taxAmount: round2(taxBase),
      grossAmount: round2(baseForThis + taxBase),
      foreignBaseAmount: foreignBaseForThis != null ? round2(foreignBaseForThis) : null,
      foreignTaxAmount: taxForeign != null ? round2(taxForeign) : null,
      foreignGrossAmount:
        foreignBaseForThis != null && taxForeign != null ? round2(foreignBaseForThis + taxForeign) : null,
    });
  }

  const exclusiveTaxBaseTotal = taxRows
    .filter((r) => !r.tax.is_inclusive)
    .reduce((sum, r) => sum + r.taxAmount, 0);
  const grossBaseFinal = round2(netBase + exclusiveTaxBaseTotal + taxRows.filter((r) => r.tax.is_inclusive).reduce((sum, r) => sum + r.taxAmount, 0));
  const grossForeignFinal = currencyCode
    ? round2((netForeign || 0) + taxRows.filter((r) => !r.tax.is_inclusive).reduce((sum, r) => sum + (r.foreignTaxAmount || 0), 0) + taxRows.filter((r) => r.tax.is_inclusive).reduce((sum, r) => sum + (r.foreignTaxAmount || 0), 0))
    : null;

  return {
    lineKey: line.lineKey,
    netBaseAmount: round2(netBase),
    grossBaseAmount: round2(grossBaseFinal || grossBase),
    currencyCode,
    exchangeRate,
    netForeignAmount: netForeign != null ? round2(netForeign) : null,
    grossForeignAmount: grossForeignFinal != null ? round2(grossForeignFinal) : grossForeign,
    taxes: taxRows,
  };
}

async function resolveLineTaxes(line: TaxInputLine, expectedType: TaxType) {
  const byId = line.taxIds && line.taxIds.length > 0 ? await getActiveTaxes({ ids: line.taxIds, type: expectedType }) : [];
  const byCode =
    line.taxCodes && line.taxCodes.length > 0 ? await getActiveTaxes({ codes: line.taxCodes, type: expectedType }) : [];
  const map = new Map<string, TaxDefinition>();
  for (const t of [...byId, ...byCode]) map.set(t.id, t);
  return Array.from(map.values());
}

export async function apply_tax_to_invoice(lines: TaxInputLine[]) {
  const calculated: CalculatedTaxLine[] = [];
  for (const line of lines) {
    const taxes = await resolveLineTaxes(line, 'sales_tax');
    calculated.push(calculate_tax(line, taxes));
  }
  return calculated;
}

export async function apply_tax_to_vendor_bill(lines: TaxInputLine[]) {
  const calculated: CalculatedTaxLine[] = [];
  for (const line of lines) {
    const taxes = await resolveLineTaxes(line, 'purchase_tax');
    calculated.push(calculate_tax(line, taxes));
  }
  return calculated;
}

export async function calculate_withholding(params: {
  amount: number;
  currencyCode?: string | null;
  exchangeRate?: number | null;
  withholdingTaxId?: string;
  withholdingTaxCode?: string;
}) {
  const taxes = await getActiveTaxes({
    ids: params.withholdingTaxId ? [params.withholdingTaxId] : [],
    codes: params.withholdingTaxCode ? [params.withholdingTaxCode] : [],
    type: 'withholding_tax',
  });
  const tax = taxes[0];
  if (!tax) return null;
  const amount = toAmount(params.amount);
  const rate = toAmount(params.exchangeRate || 0);
  const currencyCode = params.currencyCode ? normalizeCode(params.currencyCode) : null;
  if (currencyCode) ensureValidRate(rate);

  const withheldForeign =
    tax.rate_type === 'percentage' ? round2(amount * (toAmount(tax.rate_value) / 100)) : round2(toAmount(tax.rate_value));
  const withheldBase = currencyCode ? round2(withheldForeign * rate) : round2(withheldForeign);
  const baseAmount = currencyCode ? round2(amount * rate) : round2(amount);
  return {
    tax,
    baseAmount,
    withheldBase,
    payableBase: round2(Math.max(baseAmount - withheldBase, 0)),
    withheldForeign: currencyCode ? withheldForeign : null,
    payableForeign: currencyCode ? round2(Math.max(amount - withheldForeign, 0)) : null,
  };
}

export async function post_tax_entries(params: {
  reference: string;
  entryDate: string;
  journalId: string;
  sourceType: 'invoice' | 'vendor_bill' | 'payment';
  sourceId: string;
  actor: string;
  taxLines: Array<{
    tax: TaxDefinition;
    lineKey: string;
    baseAmount: number;
    taxAmount: number;
    grossAmount: number;
    currencyCode?: string | null;
    exchangeRate?: number | null;
    foreignBaseAmount?: number | null;
    foreignTaxAmount?: number | null;
    foreignGrossAmount?: number | null;
  }>;
  journalLines: Array<{
    account_id: string;
    description: string;
    debit_amount: number;
    credit_amount: number;
    partner_reference?: string | null;
  }>;
}) {
  const supabase = await createAdminClient();
  const entryId = await createAndPostJournalEntry({
    reference: params.reference,
    entryDate: params.entryDate,
    journalId: params.journalId,
    lines: params.journalLines,
  });

  if (params.taxLines.length > 0) {
    const payload = params.taxLines.map((t) => ({
      source_type: params.sourceType,
      source_id: params.sourceId,
      source_line_key: t.lineKey,
      tax_id: t.tax.id,
      currency_code: t.currencyCode || null,
      exchange_rate: t.exchangeRate || null,
      base_amount: round2(t.baseAmount),
      tax_amount: round2(t.taxAmount),
      gross_amount: round2(t.grossAmount),
      foreign_base_amount: t.foreignBaseAmount || null,
      foreign_tax_amount: t.foreignTaxAmount || null,
      foreign_gross_amount: t.foreignGrossAmount || null,
      created_by: params.actor,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('tax_applications').insert(payload);
    if (error) throw new Error(error.message);
  }

  return { journal_entry_id: entryId };
}
