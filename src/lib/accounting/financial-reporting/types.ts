/**
 * Financial Reporting Foundation — types
 * Source of truth: posted accounting_journal_entries / lines + CoA.
 */

import type { CoaAccountType, CoaClassification } from '@/lib/accounting-chart-of-accounts';

export type ReportPeriod = {
  /** Inclusive YYYY-MM-DD */
  dateFrom: string | null;
  /** Inclusive YYYY-MM-DD (as-of for Balance Sheet) */
  dateTo: string | null;
};

export type AccountMeta = {
  id: string;
  code: string;
  name: string;
  type: CoaClassification;
  account_type: CoaAccountType | null;
  parent_id: string | null;
  organization_id: string | null;
};

/** One posted journal item fact for aggregation. */
export type LedgerFact = {
  line_id: string;
  entry_id: string;
  entry_date: string;
  entry_number: string | null;
  reference: string | null;
  organization_id: string;
  account_id: string;
  debit: number;
  credit: number;
  label: string | null;
  source_type: string | null;
  source_number: string | null;
  journal_id: string | null;
  journal_code: string | null;
  journal_name: string | null;
  contact_id: string | null;
  partner_name: string | null;
  /** Line-level residual for reconciliation display (optional). */
  amount_residual: number | null;
  is_reconciled: boolean | null;
};

export type AccountBalance = {
  account_id: string;
  code: string;
  name: string;
  type: CoaClassification;
  account_type: CoaAccountType | null;
  debit: number;
  credit: number;
  /** Signed balance in account's normal sense (assets/expenses: debit−credit; others: credit−debit). */
  balance: number;
};

/** Visual / semantic role for Odoo-style statement rows. */
export type ReportLineVariant =
  | 'section' // ASSETS / LIABILITIES band
  | 'group' // Current Assets / Earnings
  | 'line' // leaf / detail
  | 'summary' // Gross Profit / Net Profit band
  | 'link'; // drill-down accent (e.g. Current Year Earnings)

export type ReportLine = {
  key: string;
  label: string;
  amount: number;
  level: number;
  account_id?: string;
  code?: string;
  isTotal?: boolean;
  isSection?: boolean;
  variant?: ReportLineVariant;
  /** Accent / drill-down style (Current Year Unallocated Earnings). */
  isLink?: boolean;
  expandable?: boolean;
  children?: ReportLine[];
};

export type BalanceSheetReport = {
  kind: 'balance_sheet';
  asOf: string;
  organizationId: string | null;
  currency: string;
  /** Flat Odoo-ordered rows including section bands and footer. */
  lines: ReportLine[];
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
  currentYearEarnings: number;
  priorYearEarnings: number;
};

export type ProfitLossReport = {
  kind: 'profit_loss';
  dateFrom: string;
  dateTo: string;
  organizationId: string | null;
  currency: string;
  /** Flat Odoo P&L statement rows. */
  lines: ReportLine[];
  income: ReportLine[];
  expenses: ReportLine[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  grossProfit: number;
  operatingIncome: number;
};

export type CashFlowSection = {
  id: 'operating' | 'investing' | 'financing' | 'unclassified' | 'cash';
  label: string;
  lines: ReportLine[];
  total: number;
};

export type CashFlowReport = {
  kind: 'cash_flow';
  dateFrom: string;
  dateTo: string;
  organizationId: string | null;
  currency: string;
  openingCash: number;
  closingCash: number;
  netChange: number;
  sections: CashFlowSection[];
  /** Flat Odoo cash-flow rows for the statement table. */
  lines: ReportLine[];
  /** Reconciles statement net change to actual cash movement. */
  actualCashMovement: number;
};

export function round2(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

export function signedBalance(
  type: CoaClassification,
  debit: number,
  credit: number
): number {
  if (type === 'asset' || type === 'expense') {
    return round2(debit - credit);
  }
  // liability, equity, income (and view → treat as 0 elsewhere)
  return round2(credit - debit);
}

export function isLiquidityAccount(account: {
  type: string;
  account_type?: string | null;
  code?: string;
}) {
  const at = String(account.account_type || '').toLowerCase();
  if (at === 'cash' || at === 'bank') return true;
  const code = String(account.code || '');
  return code === '1100' || code === '1200';
}

export function groupLabelForAccountType(
  type: CoaClassification,
  accountType: string | null | undefined
): string {
  const at = String(accountType || '');
  const map: Record<string, string> = {
    receivable: 'Receivables',
    bank: 'Bank',
    cash: 'Cash',
    current_assets: 'Current Assets',
    fixed_assets: 'Fixed Assets',
    non_current_assets: 'Non-current Assets',
    prepayments: 'Prepayments',
    deferred_revenue: 'Deferred Revenue',
    payable: 'Payables',
    credit_card: 'Credit Cards',
    current_liabilities: 'Current Liabilities',
    non_current_liabilities: 'Non-current Liabilities',
    equity: 'Equity',
    retained_earnings: 'Retained Earnings',
    current_year_earnings: 'Current Year Earnings',
    income: 'Operating Income',
    other_income: 'Other Income',
    cost_of_revenue: 'Cost of Revenue',
    expense: 'Operating Expenses',
    administrative: 'Administrative Expenses',
    depreciation: 'Depreciation',
  };
  if (map[at]) return map[at];
  if (type === 'asset') return 'Other Assets';
  if (type === 'liability') return 'Other Liabilities';
  if (type === 'equity') return 'Other Equity';
  if (type === 'income') return 'Income';
  if (type === 'expense') return 'Expenses';
  return 'Other';
}

/** Sum balances whose account_type is in the given set (or null treated as fallback). */
export function sumByAccountTypes(
  balances: AccountBalance[],
  accountTypes: string[],
  fallbackClassification?: CoaClassification
): number {
  const set = new Set(accountTypes);
  return round2(
    balances
      .filter((b) => {
        const at = String(b.account_type || '');
        if (set.has(at)) return true;
        if (
          !at &&
          fallbackClassification &&
          b.type === fallbackClassification &&
          accountTypes.includes('_untyped')
        ) {
          return true;
        }
        return false;
      })
      .reduce((s, b) => s + b.balance, 0)
  );
}

/* ---------- Phase 2: Ledger reports ---------- */

export type TrialBalanceAccountRow = {
  account_id: string;
  code: string;
  name: string;
  type: CoaClassification;
  account_type: CoaAccountType | null;
  /** Opening: debit − credit (Odoo display). */
  initial_balance: number;
  period_debit: number;
  period_credit: number;
  /** Closing: debit − credit through period end. */
  end_balance: number;
  opening_debit: number;
  opening_credit: number;
  closing_debit: number;
  closing_credit: number;
};

export type TrialBalanceGroup = {
  key: string;
  label: string;
  /** 1 Assets, 2 Liabilities, … */
  sequence: number;
  initial_balance: number;
  period_debit: number;
  period_credit: number;
  end_balance: number;
  accounts: TrialBalanceAccountRow[];
};

export type TrialBalanceReport = {
  kind: 'trial_balance';
  dateFrom: string;
  dateTo: string;
  organizationId: string | null;
  currency: string;
  groups: TrialBalanceGroup[];
  totalInitialBalance: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalEndBalance: number;
  /** Period debit === period credit within tolerance. */
  balanced: boolean;
};

export type GeneralLedgerLine = {
  line_id: string;
  entry_id: string;
  entry_date: string;
  journal_code: string | null;
  reference: string | null;
  partner_name: string | null;
  label: string | null;
  debit: number;
  credit: number;
  /** Running balance (debit − credit) after this line. */
  balance: number;
};

export type GeneralLedgerAccount = {
  account_id: string;
  code: string;
  name: string;
  type: CoaClassification;
  opening_balance: number;
  period_debit: number;
  period_credit: number;
  closing_balance: number;
  lines: GeneralLedgerLine[];
};

export type GeneralLedgerReport = {
  kind: 'general_ledger';
  dateFrom: string;
  dateTo: string;
  organizationId: string | null;
  currency: string;
  accounts: GeneralLedgerAccount[];
  totalDebit: number;
  totalCredit: number;
  totalBalance: number;
  balanced: boolean;
};

export type PartnerLedgerLine = {
  line_id: string;
  entry_id: string;
  reference: string | null;
  journal_code: string | null;
  account_code: string;
  account_name: string;
  entry_date: string;
  due_date: string | null;
  matching: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type PartnerLedgerPartner = {
  partner_key: string;
  contact_id: string | null;
  partner_name: string;
  period_debit: number;
  period_credit: number;
  balance: number;
  lines: PartnerLedgerLine[];
};

export type PartnerLedgerReport = {
  kind: 'partner_ledger';
  dateFrom: string;
  dateTo: string;
  organizationId: string | null;
  currency: string;
  partners: PartnerLedgerPartner[];
  totalDebit: number;
  totalCredit: number;
  totalBalance: number;
};
