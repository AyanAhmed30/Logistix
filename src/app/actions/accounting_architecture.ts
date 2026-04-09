'use server';

import { getSession } from '@/lib/auth/session';
import { processAccountingEvent } from '@/lib/accounting/eventProcessor';
import { validateBusinessFlow } from '@/lib/accounting/flowValidators';
import type { AccountingEvent } from '@/lib/accounting/events';
import {
  getAPAging,
  getARAging,
  getBalanceSheet,
  getCashFlow,
  getCodOutstanding,
  getGeneralLedger,
  getProfitAndLoss,
  getShipmentProfitability,
  getTrialBalance,
} from '@/lib/accounting/reporting';
import {
  convert_to_base,
  get_exchange_rate,
} from '@/lib/accounting/multiCurrency';
import {
  apply_tax_to_invoice as applyTaxToInvoiceEngine,
  apply_tax_to_vendor_bill as applyTaxToVendorBillEngine,
  calculate_tax as calculateTaxEngine,
  calculate_withholding as calculateWithholdingEngine,
  getActiveTaxes,
  post_tax_entries as postTaxEntriesEngine,
} from '@/lib/accounting/taxEngine';

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') throw new Error('Unauthorized');
}

export async function publishAccountingEvent(event: AccountingEvent) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    const result = await processAccountingEvent(event);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to process accounting event' };
  }
}

export async function postInvoiceAccounting(input: {
  invoice_id: string;
  partner_id: string;
  invoice_lines: Array<{ charge_type: string; amount: number; tax_ids?: string[]; tax_codes?: string[]; line_key?: string }>;
  date?: string;
  currency_code?: string;
  exchange_rate?: number;
}) {
  const currencyCode = String(input.currency_code || 'PKR').toUpperCase();
  const rate =
    input.exchange_rate && input.exchange_rate > 0
      ? input.exchange_rate
      : await get_exchange_rate(currencyCode, input.date);
  const totalForeign = input.invoice_lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalBase = currencyCode === 'PKR' ? totalForeign : convert_to_base(totalForeign, rate);
  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: 'CUSTOMER_INVOICE_POSTED',
    reference_id: input.invoice_id,
    idempotency_key: `CUSTOMER_INVOICE_POSTED:${input.invoice_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'customer_billing',
    payload: {
      partner_id: input.partner_id,
      invoice_lines: input.invoice_lines,
      amount: totalBase,
      foreign_currency: currencyCode === 'PKR' ? null : currencyCode,
      foreign_amount: currencyCode === 'PKR' ? null : totalForeign,
      exchange_rate: currencyCode === 'PKR' ? null : rate,
      date: input.date,
      receivable_account_code: '1101',
    },
  });
}

export async function recordPaymentAccounting(input: {
  payment_id: string;
  partner_id: string;
  amount: number;
  payment_mode?: 'cod' | 'bank' | 'cash' | 'undeposited';
  date?: string;
  currency_code?: string;
  exchange_rate?: number;
}) {
  const currencyCode = String(input.currency_code || 'PKR').toUpperCase();
  const rate =
    input.exchange_rate && input.exchange_rate > 0
      ? input.exchange_rate
      : await get_exchange_rate(currencyCode, input.date);
  const baseAmount = currencyCode === 'PKR' ? input.amount : convert_to_base(input.amount, rate);
  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: 'PAYMENT_RECEIVED',
    reference_id: input.payment_id,
    idempotency_key: `PAYMENT_RECEIVED:${input.payment_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'payments',
    payload: {
      partner_id: input.partner_id,
      amount: baseAmount,
      foreign_currency: currencyCode === 'PKR' ? null : currencyCode,
      foreign_amount: currencyCode === 'PKR' ? null : input.amount,
      exchange_rate: currencyCode === 'PKR' ? null : rate,
      payment_mode: input.payment_mode || 'undeposited',
      date: input.date,
      receivable_account_code: '1101',
    },
  });
}

export async function settleBankAccounting(input: {
  settlement_id: string;
  amount: number;
  source: 'cod' | 'undeposited';
  available_amount?: number;
  date?: string;
}) {
  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: 'BANK_SETTLEMENT_POSTED',
    reference_id: input.settlement_id,
    idempotency_key: `BANK_SETTLEMENT_POSTED:${input.settlement_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'bank',
    payload: {
      amount: input.amount,
      available_amount: input.available_amount ?? input.amount,
      settlement_source: input.source,
      bank_account_code: '1002',
      settlement_source_account_code: input.source === 'cod' ? '1004' : '1003',
      date: input.date,
    },
  });
}

export async function postVendorBillAccounting(input: {
  bill_id: string;
  partner_id: string;
  bill_lines: Array<{ cost_type: string; amount: number; tax_ids?: string[]; tax_codes?: string[]; line_key?: string }>;
  payable_account_code?: '2001' | '2002' | '2003';
  date?: string;
  currency_code?: string;
  exchange_rate?: number;
}) {
  const currencyCode = String(input.currency_code || 'PKR').toUpperCase();
  const rate =
    input.exchange_rate && input.exchange_rate > 0
      ? input.exchange_rate
      : await get_exchange_rate(currencyCode, input.date);
  const totalForeign = input.bill_lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalBase = currencyCode === 'PKR' ? totalForeign : convert_to_base(totalForeign, rate);
  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: 'VENDOR_BILL_POSTED',
    reference_id: input.bill_id,
    idempotency_key: `VENDOR_BILL_POSTED:${input.bill_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'vendor_billing',
    payload: {
      partner_id: input.partner_id,
      bill_lines: input.bill_lines,
      amount: totalBase,
      foreign_currency: currencyCode === 'PKR' ? null : currencyCode,
      foreign_amount: currencyCode === 'PKR' ? null : totalForeign,
      exchange_rate: currencyCode === 'PKR' ? null : rate,
      payable_account_code: input.payable_account_code || '2001',
      date: input.date,
    },
  });
}

export async function payVendorAccounting(input: {
  payment_id: string;
  partner_id: string;
  amount: number;
  payable_account_code?: '2001' | '2002' | '2003';
  liquidity_account_code?: '1002' | '1001';
  date?: string;
  currency_code?: string;
  exchange_rate?: number;
  withholding_tax_id?: string;
  withholding_tax_code?: string;
}) {
  const currencyCode = String(input.currency_code || 'PKR').toUpperCase();
  const rate =
    input.exchange_rate && input.exchange_rate > 0
      ? input.exchange_rate
      : await get_exchange_rate(currencyCode, input.date);
  const baseAmount = currencyCode === 'PKR' ? input.amount : convert_to_base(input.amount, rate);
  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: 'PAYMENT_MADE',
    reference_id: input.payment_id,
    idempotency_key: `PAYMENT_MADE:${input.payment_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'payments',
    payload: {
      partner_id: input.partner_id,
      amount: baseAmount,
      foreign_currency: currencyCode === 'PKR' ? null : currencyCode,
      foreign_amount: currencyCode === 'PKR' ? null : input.amount,
      exchange_rate: currencyCode === 'PKR' ? null : rate,
      withholding_tax_id: input.withholding_tax_id || null,
      withholding_tax_code: input.withholding_tax_code || null,
      payable_account_code: input.payable_account_code || '2001',
      liquidity_account_code: input.liquidity_account_code || '1002',
      date: input.date,
    },
  });
}

export async function calculate_tax(input: {
  lineKey: string;
  amount: number;
  currencyCode?: string;
  exchangeRate?: number;
  taxIds?: string[];
  taxCodes?: string[];
}) {
  const taxes = await getActiveTaxes({
    ids: input.taxIds || [],
    codes: input.taxCodes || [],
  });
  return {
    data: calculateTaxEngine(
      {
        lineKey: input.lineKey,
        amount: input.amount,
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        taxIds: input.taxIds,
        taxCodes: input.taxCodes,
      },
      taxes
    ),
  };
}

export async function apply_tax_to_invoice(input: {
  lines: Array<{
    lineKey: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    taxIds?: string[];
    taxCodes?: string[];
  }>;
}) {
  return { data: await applyTaxToInvoiceEngine(input.lines) };
}

export async function apply_tax_to_vendor_bill(input: {
  lines: Array<{
    lineKey: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    taxIds?: string[];
    taxCodes?: string[];
  }>;
}) {
  return { data: await applyTaxToVendorBillEngine(input.lines) };
}

export async function calculate_withholding(input: {
  amount: number;
  currencyCode?: string;
  exchangeRate?: number;
  withholdingTaxId?: string;
  withholdingTaxCode?: string;
}) {
  return {
    data: await calculateWithholdingEngine({
      amount: input.amount,
      currencyCode: input.currencyCode,
      exchangeRate: input.exchangeRate,
      withholdingTaxId: input.withholdingTaxId,
      withholdingTaxCode: input.withholdingTaxCode,
    }),
  };
}

export async function post_tax_entries(input: Parameters<typeof postTaxEntriesEngine>[0]) {
  return { data: await postTaxEntriesEngine(input) };
}

export async function applyAdvanceAccounting(input: {
  application_id: string;
  partner_id: string;
  amount: number;
  date?: string;
}) {
  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: 'CUSTOMER_ADVANCE_APPLIED',
    reference_id: input.application_id,
    idempotency_key: `CUSTOMER_ADVANCE_APPLIED:${input.application_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'reconciliation',
    payload: {
      partner_id: input.partner_id,
      amount: input.amount,
      advance_account_code: '2004',
      receivable_account_code: '1101',
      date: input.date,
    },
  });
}

export async function receiveAdvanceAccounting(input: {
  advance_id: string;
  partner_id: string;
  amount: number;
  date?: string;
}) {
  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: 'CUSTOMER_ADVANCE_RECEIVED',
    reference_id: input.advance_id,
    idempotency_key: `CUSTOMER_ADVANCE_RECEIVED:${input.advance_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'payments',
    payload: {
      partner_id: input.partner_id,
      amount: input.amount,
      bank_account_code: '1002',
      advance_account_code: '2004',
      date: input.date,
    },
  });
}

export async function handleDdpAccounting(input: {
  duty_event_id: string;
  amount: number;
  mode: 'recoverable' | 'cost';
  funding_mode?: 'bank' | 'payable';
  partner_id?: string;
  invoice_recovery?: boolean;
  date?: string;
}) {
  if (input.invoice_recovery) {
    if (!input.partner_id) return { error: 'partner_id is required for recoverable invoicing' };
    return publishAccountingEvent({
      event_id: crypto.randomUUID(),
      event_type: 'DDP_DUTY_RECOVERABLE_INVOICED',
      reference_id: input.duty_event_id,
      idempotency_key: `DDP_DUTY_RECOVERABLE_INVOICED:${input.duty_event_id}`,
      occurred_at: new Date().toISOString(),
      source_module: 'tax',
      payload: {
        partner_id: input.partner_id,
        amount: input.amount,
        receivable_account_code: '1101',
        recoverable_duty_account_code: '1206',
        date: input.date,
      },
    });
  }

  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: 'DUTY_PAID',
    reference_id: input.duty_event_id,
    idempotency_key: `DUTY_PAID:${input.duty_event_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'tax',
    payload: {
      amount: input.amount,
      ddp_mode: input.mode,
      duty_account_code: input.mode === 'recoverable' ? '1206' : '5002',
      funding_mode: input.funding_mode || 'bank',
      funding_account_code: (input.funding_mode || 'bank') === 'payable' ? '2001' : '1002',
      payable_account_code: '2001',
      date: input.date,
    },
  });
}

export async function processTradeflowAccounting(input: {
  case_id: string;
  event:
    | 'purchase'
    | 'move_to_transit'
    | 'delivery'
    | 'cogs'
    | 'repayment';
  amount: number;
  partner_id?: string;
  revenue_amount?: number;
  date?: string;
}) {
  const eventMap = {
    purchase: 'TRADEFLOW_PURCHASE',
    move_to_transit: 'TRADEFLOW_MOVE_TO_TRANSIT',
    delivery: 'TRADEFLOW_DELIVERY',
    cogs: 'TRADEFLOW_COGS_RECOGNIZED',
    repayment: 'TRADEFLOW_REPAYMENT',
  } as const;

  const eventType = eventMap[input.event];
  const payload: Record<string, unknown> = {
    amount: input.amount,
    date: input.date,
    inventory_account_code: '1201',
    transit_account_code: '1202',
    trade_receivable_account_code: '1102',
    trade_revenue_account_code: '4007',
    tradeflow_cogs_account_code: '5007',
    bank_account_code: '1002',
    funding_account_code: '2001',
  };
  if (input.partner_id) payload.partner_id = input.partner_id;
  if (input.revenue_amount != null) payload.revenue_amount = input.revenue_amount;

  return publishAccountingEvent({
    event_id: crypto.randomUUID(),
    event_type: eventType,
    reference_id: input.case_id,
    idempotency_key: `${eventType}:${input.case_id}`,
    occurred_at: new Date().toISOString(),
    source_module: 'tradeflow',
    payload,
  });
}

export async function validateIntegratedBusinessFlow(entityId: string, type: 'shipment' | 'invoice' | 'payment') {
  try {
    const session = await getSession();
    ensureAdmin(session);
    await validateBusinessFlow(entityId, type);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Flow validation failed' };
  }
}

export async function getFinancialReports(input: {
  report:
    | 'general_ledger'
    | 'trial_balance'
    | 'profit_and_loss'
    | 'balance_sheet'
    | 'cash_flow'
    | 'ar_aging'
    | 'ap_aging'
    | 'cod_outstanding'
    | 'shipment_profitability';
  from?: string;
  to?: string;
  account_id?: string;
  partner_reference?: string;
  shipment_reference?: string;
  shipment_id?: string;
  as_of?: string;
}) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    switch (input.report) {
      case 'general_ledger':
        return {
          data: await getGeneralLedger({
            from: input.from,
            to: input.to,
            account_id: input.account_id,
            partner_reference: input.partner_reference,
            shipment_reference: input.shipment_reference,
          }),
        };
      case 'trial_balance':
        return { data: await getTrialBalance(input.from, input.to) };
      case 'profit_and_loss':
        return { data: await getProfitAndLoss(input.from, input.to) };
      case 'balance_sheet':
        return { data: await getBalanceSheet(input.as_of) };
      case 'cash_flow':
        return { data: await getCashFlow(input.from, input.to) };
      case 'ar_aging':
        return { data: await getARAging(input.as_of) };
      case 'ap_aging':
        return { data: await getAPAging(input.as_of) };
      case 'cod_outstanding':
        return { data: await getCodOutstanding() };
      case 'shipment_profitability':
        if (!input.shipment_id) return { error: 'shipment_id is required' };
        return { data: await getShipmentProfitability(input.shipment_id) };
      default:
        return { error: 'Unsupported report type' };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load report' };
  }
}
