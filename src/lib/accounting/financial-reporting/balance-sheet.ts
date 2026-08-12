import {
  aggregateAccountBalances,
  loadChartAccounts,
  loadPostedLedgerFacts,
  startOfCalendarYear,
} from '@/lib/accounting/financial-reporting/ledger';
import {
  round2,
  type AccountBalance,
  type BalanceSheetReport,
  type ReportLine,
} from '@/lib/accounting/financial-reporting/types';

function sumTypes(balances: AccountBalance[], types: string[]) {
  const set = new Set(types);
  return round2(
    balances
      .filter((b) => set.has(String(b.account_type || '')))
      .reduce((s, b) => s + b.balance, 0)
  );
}

function line(
  key: string,
  label: string,
  amount: number,
  level: number,
  extra?: Partial<ReportLine>
): ReportLine {
  return { key, label, amount: round2(amount), level, ...extra };
}

/**
 * Balance Sheet as of a date — Odoo-style hierarchy.
 * Unclosed P&L folded into Equity (Current / Previous Years Earnings).
 */
export async function buildBalanceSheet(opts: {
  organizationId: string | null;
  asOf: string;
  currency?: string;
}): Promise<BalanceSheetReport> {
  const asOf = opts.asOf;
  const accounts = await loadChartAccounts(opts.organizationId);
  const facts = await loadPostedLedgerFacts({
    organizationId: opts.organizationId,
    dateTo: asOf,
  });
  const balances = aggregateAccountBalances(facts, accounts);
  const assetsOnly = balances.filter((b) => b.type === 'asset');
  const liabOnly = balances.filter((b) => b.type === 'liability');
  const equityOnly = balances.filter((b) => b.type === 'equity');

  // --- Assets (Odoo buckets) ---
  const bankCash = sumTypes(assetsOnly, ['bank', 'cash']);
  const receivables = sumTypes(assetsOnly, ['receivable']);
  const currentAssetsLeaf = sumTypes(assetsOnly, ['current_assets']);
  const prepayments = sumTypes(assetsOnly, ['prepayments']);
  const fixedAssets = sumTypes(assetsOnly, ['fixed_assets']);
  const nonCurrentAssets = sumTypes(assetsOnly, ['non_current_assets']);
  // Untyped assets → current assets leaf
  const untypedAssets = round2(
    assetsOnly
      .filter((b) => !b.account_type)
      .reduce((s, b) => s + b.balance, 0)
  );
  const currentAssetsTotal = round2(
    bankCash +
      receivables +
      currentAssetsLeaf +
      prepayments +
      untypedAssets
  );
  const totalAssets = round2(
    currentAssetsTotal + fixedAssets + nonCurrentAssets
  );

  // --- Liabilities ---
  const currentLiabLeaf = sumTypes(liabOnly, ['current_liabilities']);
  const creditCard = sumTypes(liabOnly, ['credit_card']);
  const payables = sumTypes(liabOnly, ['payable']);
  const nonCurrentLiab = sumTypes(liabOnly, ['non_current_liabilities']);
  const untypedLiab = round2(
    liabOnly
      .filter((b) => !b.account_type)
      .reduce((s, b) => s + b.balance, 0)
  );
  const currentLiabTotal = round2(
    currentLiabLeaf + creditCard + payables + untypedLiab
  );
  const totalLiabilities = round2(currentLiabTotal + nonCurrentLiab);

  // --- Equity base + earnings ---
  const equityAccounts = round2(
    sumTypes(equityOnly, ['equity', 'retained_earnings', 'current_year_earnings']) +
      equityOnly
        .filter((b) => !b.account_type)
        .reduce((s, b) => s + b.balance, 0)
  );

  const yearStart = startOfCalendarYear(asOf);
  const ytd = aggregateAccountBalances(
    await loadPostedLedgerFacts({
      organizationId: opts.organizationId,
      dateFrom: yearStart,
      dateTo: asOf,
    }),
    accounts
  );

  const netFromBalances = (rows: AccountBalance[]) => {
    let income = 0;
    let expense = 0;
    for (const b of rows) {
      if (b.type === 'income') income = round2(income + b.balance);
      if (b.type === 'expense') expense = round2(expense + b.balance);
    }
    return round2(income - expense);
  };

  const currentYearEarnings = netFromBalances(ytd);
  const cumulativeEarnings = netFromBalances(balances);
  // Avoid double-counting if CoA already has current_year_earnings / retained
  const priorYearEarnings = round2(cumulativeEarnings - currentYearEarnings);
  const earningsTotal = round2(currentYearEarnings + priorYearEarnings);
  const totalEquity = round2(equityAccounts + earningsTotal);
  const totalLiabilitiesAndEquity = round2(totalLiabilities + totalEquity);

  const assetsLines: ReportLine[] = [
    line('asset:current', 'Current Assets', currentAssetsTotal, 1, {
      variant: 'group',
      isSection: true,
    }),
    line('asset:bank_cash', 'Bank and Cash Accounts', bankCash, 2, {
      variant: 'line',
    }),
    line('asset:receivables', 'Receivables', receivables, 2, {
      variant: 'line',
    }),
    line(
      'asset:current_leaf',
      'Current Assets',
      round2(currentAssetsLeaf + untypedAssets),
      2,
      { variant: 'line' }
    ),
    line('asset:prepayments', 'Prepayments', prepayments, 2, {
      variant: 'line',
    }),
    line('asset:fixed', 'Fixed Assets', fixedAssets, 1, { variant: 'group' }),
    line('asset:non_current', 'Non-current Assets', nonCurrentAssets, 1, {
      variant: 'group',
    }),
  ];

  const liabilityLines: ReportLine[] = [
    line('liab:current', 'Current Liabilities', currentLiabTotal, 1, {
      variant: 'group',
      isSection: true,
    }),
    line(
      'liab:current_leaf',
      'Current Liabilities',
      round2(currentLiabLeaf + untypedLiab),
      2,
      { variant: 'line' }
    ),
    line('liab:credit_card', 'Credit Card', creditCard, 2, { variant: 'line' }),
    line('liab:payables', 'Payables', payables, 2, { variant: 'line' }),
    line('liab:non_current', 'Non-current Liabilities', nonCurrentLiab, 1, {
      variant: 'group',
    }),
  ];

  const equityLines: ReportLine[] = [
    line('eq:equity', 'Equity', equityAccounts, 1, {
      variant: 'group',
      isSection: true,
    }),
    line('eq:earnings', 'Earnings', earningsTotal, 1, {
      variant: 'group',
      isSection: true,
    }),
    line(
      'eq:cye',
      'Current Year Unallocated Earnings',
      currentYearEarnings,
      2,
      { variant: 'link', isLink: true }
    ),
    line('eq:pye', 'Previous Years Earnings', priorYearEarnings, 2, {
      variant: 'line',
    }),
  ];

  const lines: ReportLine[] = [
    line('sec:assets', 'ASSETS', totalAssets, 0, {
      variant: 'section',
      isSection: true,
      isTotal: true,
    }),
    ...assetsLines,
    line('sec:liabilities', 'LIABILITIES', totalLiabilities, 0, {
      variant: 'section',
      isSection: true,
      isTotal: true,
    }),
    ...liabilityLines,
    line('sec:equity', 'EQUITY (& EARNINGS)', totalEquity, 0, {
      variant: 'section',
      isSection: true,
      isTotal: true,
    }),
    ...equityLines,
    line(
      'sec:liab_eq',
      'LIABILITIES + EQUITY',
      totalLiabilitiesAndEquity,
      0,
      { variant: 'section', isSection: true, isTotal: true }
    ),
  ];

  return {
    kind: 'balance_sheet',
    asOf,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    lines,
    assets: assetsLines,
    liabilities: liabilityLines,
    equity: equityLines,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity,
    balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.05,
    currentYearEarnings,
    priorYearEarnings,
  };
}
