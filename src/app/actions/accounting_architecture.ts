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
