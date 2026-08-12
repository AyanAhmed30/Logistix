/**
 * Accounting Financial Reporting Foundation
 *
 * Source of truth: posted accounting_journal_entries + lines + chart_of_accounts.
 * Does NOT use legacy journal_entries / invoice KPI reporting.
 */

export * from '@/lib/accounting/financial-reporting/types';
export {
  loadChartAccounts,
  loadPostedLedgerFacts,
  aggregateAccountBalances,
  dayBefore,
  startOfCalendarYear,
  rawDebitCreditBalance,
} from '@/lib/accounting/financial-reporting/ledger';
export {
  resolveDatePeriod,
  formatPeriodRange,
  formatMonthYear,
  todayIso,
  DATE_PERIOD_PRESETS,
  type DatePeriod,
  type DatePeriodPreset,
} from '@/lib/accounting/financial-reporting/periods';
export { buildBalanceSheet } from '@/lib/accounting/financial-reporting/balance-sheet';
export { buildProfitAndLoss } from '@/lib/accounting/financial-reporting/profit-loss';
export { buildCashFlow } from '@/lib/accounting/financial-reporting/cash-flow';
export { buildTrialBalance } from '@/lib/accounting/financial-reporting/trial-balance';
export { buildGeneralLedger } from '@/lib/accounting/financial-reporting/general-ledger';
export { buildPartnerLedger } from '@/lib/accounting/financial-reporting/partner-ledger';
export {
  buildAgingReport,
  buildAgedReceivable,
  buildAgedPayable,
  resolveAgingBucket,
  DEFAULT_AGING_BUCKETS,
  type AgingReport,
  type AgingPartner,
  type AgingLine,
  type AgingBucketId,
  type AgingBucketDef,
  type AgingSide,
} from '@/lib/accounting/financial-reporting/aging';
export {
  buildTaxReport,
  type TaxReport,
  type TaxReportSection,
  type TaxReportLine,
} from '@/lib/accounting/financial-reporting/tax-report';
export { formatTaxReportLabel } from '@/lib/accounting/financial-reporting/tax-label';
