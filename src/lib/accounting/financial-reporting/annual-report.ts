/**
 * Annual Report — composed from posted journal entries via existing statement builders.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { buildBalanceSheet } from '@/lib/accounting/financial-reporting/balance-sheet';
import { buildProfitAndLoss } from '@/lib/accounting/financial-reporting/profit-loss';
import { buildCashFlow } from '@/lib/accounting/financial-reporting/cash-flow';
import { buildTrialBalance } from '@/lib/accounting/financial-reporting/trial-balance';
import type { BalanceSheetReport, CashFlowReport, ProfitLossReport } from '@/lib/accounting/financial-reporting/types';

export type AnnualReportFiscalYear = {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  status: string;
};

export type AnnualReport = {
  fiscal_year: AnnualReportFiscalYear | null;
  date_from: string;
  date_to: string;
  currency: string;
  profit_and_loss: ProfitLossReport;
  balance_sheet: BalanceSheetReport;
  cash_flow: CashFlowReport;
  trial_balance_total_debit: number;
  trial_balance_total_credit: number;
  trial_balance_balanced: boolean;
};

export async function loadFiscalYearsForOrg(
  organizationId: string
): Promise<AnnualReportFiscalYear[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('accounting_fiscal_years')
    .select('id, name, date_from, date_to, status')
    .eq('organization_id', organizationId)
    .order('date_from', { ascending: false });

  return (data || []).map((y) => ({
    id: String(y.id),
    name: String(y.name || ''),
    date_from: String(y.date_from || '').slice(0, 10),
    date_to: String(y.date_to || '').slice(0, 10),
    status: String(y.status || 'open'),
  }));
}

export async function buildAnnualReport(opts: {
  organizationId: string | null;
  dateFrom: string;
  dateTo: string;
  fiscalYear?: AnnualReportFiscalYear | null;
}): Promise<AnnualReport> {
  const dateFrom = opts.dateFrom.slice(0, 10);
  const dateTo = opts.dateTo.slice(0, 10);

  const [profit_and_loss, balance_sheet, cash_flow, trial_balance] =
    await Promise.all([
      buildProfitAndLoss({
        organizationId: opts.organizationId,
        dateFrom,
        dateTo,
      }),
      buildBalanceSheet({
        organizationId: opts.organizationId,
        asOf: dateTo,
      }),
      buildCashFlow({
        organizationId: opts.organizationId,
        dateFrom,
        dateTo,
      }),
      buildTrialBalance({
        organizationId: opts.organizationId,
        dateFrom,
        dateTo,
      }),
    ]);

  const tbDebit = trial_balance.totalPeriodDebit ?? 0;
  const tbCredit = trial_balance.totalPeriodCredit ?? 0;

  return {
    fiscal_year: opts.fiscalYear ?? null,
    date_from: dateFrom,
    date_to: dateTo,
    currency: profit_and_loss.currency || 'PKR',
    profit_and_loss,
    balance_sheet,
    cash_flow,
    trial_balance_total_debit: tbDebit,
    trial_balance_total_credit: tbCredit,
    trial_balance_balanced: trial_balance.balanced,
  };
}
