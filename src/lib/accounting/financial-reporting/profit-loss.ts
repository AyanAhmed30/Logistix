import {
  aggregateAccountBalances,
  loadChartAccounts,
  loadPostedLedgerFacts,
} from '@/lib/accounting/financial-reporting/ledger';
import {
  round2,
  type AccountBalance,
  type ProfitLossReport,
  type ReportLine,
} from '@/lib/accounting/financial-reporting/types';

function line(
  key: string,
  label: string,
  amount: number,
  level: number,
  extra?: Partial<ReportLine>
): ReportLine {
  return { key, label, amount: round2(amount), level, ...extra };
}

function sumMatching(
  rows: AccountBalance[],
  pred: (b: AccountBalance) => boolean
) {
  return round2(rows.filter(pred).reduce((s, b) => s + b.balance, 0));
}

/**
 * Profit & Loss — Odoo-style statement rows from posted income/expense.
 */
export async function buildProfitAndLoss(opts: {
  organizationId: string | null;
  dateFrom: string;
  dateTo: string;
  currency?: string;
}): Promise<ProfitLossReport> {
  const accounts = await loadChartAccounts(opts.organizationId);
  const facts = await loadPostedLedgerFacts({
    organizationId: opts.organizationId,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
  });
  const balances = aggregateAccountBalances(facts, accounts);
  const incomeRows = balances.filter((b) => b.type === 'income');
  const expenseRows = balances.filter((b) => b.type === 'expense');

  const revenue = sumMatching(
    incomeRows,
    (b) => !b.account_type || b.account_type === 'income'
  );
  const otherIncome = sumMatching(
    incomeRows,
    (b) => b.account_type === 'other_income'
  );
  const costOfRevenue = sumMatching(
    expenseRows,
    (b) => b.account_type === 'cost_of_revenue'
  );
  const operatingExpenses = sumMatching(expenseRows, (b) => {
    const at = String(b.account_type || '');
    return (
      !at ||
      at === 'expense' ||
      at === 'administrative' ||
      at === 'depreciation'
    );
  });
  const otherExpenses = 0;

  const grossProfit = round2(revenue - costOfRevenue);
  const operatingIncome = round2(grossProfit - operatingExpenses);
  const netProfit = round2(operatingIncome + otherIncome - otherExpenses);
  const allocations = 0;
  const netAfterAllocations = round2(netProfit - allocations);

  const incomeDetail: ReportLine[] = incomeRows
    .filter((b) => Math.abs(b.balance) > 0.004)
    .map((b) =>
      line(b.account_id, `${b.code} ${b.name}`, b.balance, 1, {
        variant: 'line',
        account_id: b.account_id,
        code: b.code,
      })
    );
  const expenseDetail: ReportLine[] = expenseRows
    .filter((b) => Math.abs(b.balance) > 0.004)
    .map((b) =>
      line(b.account_id, `${b.code} ${b.name}`, b.balance, 1, {
        variant: 'line',
        account_id: b.account_id,
        code: b.code,
      })
    );

  const lines: ReportLine[] = [
    line('pl:revenue', 'Revenue', revenue, 0, {
      variant: 'line',
      expandable: true,
    }),
    line('pl:cor', 'Costs of Revenue', costOfRevenue, 0, { variant: 'line' }),
    line('pl:gross', 'Gross Profit', grossProfit, 0, {
      variant: 'summary',
      isTotal: true,
    }),
    line('pl:opex', 'Operating Expenses', operatingExpenses, 0, {
      variant: 'line',
    }),
    line('pl:opinc', 'Operating Income (or Loss)', operatingIncome, 0, {
      variant: 'summary',
      isTotal: true,
    }),
    line('pl:oi', 'Other Income', otherIncome, 0, { variant: 'line' }),
    line('pl:oe', 'Other Expenses', otherExpenses, 0, { variant: 'line' }),
    line('pl:net', 'Net Profit', netProfit, 0, {
      variant: 'summary',
      isTotal: true,
    }),
    line('pl:alloc', 'Allocations and Withdrawals', allocations, 0, {
      variant: 'line',
    }),
    line(
      'pl:net_after',
      'Net Profit Left After Allocations and Withdrawals',
      netAfterAllocations,
      0,
      { variant: 'summary', isTotal: true }
    ),
  ];

  return {
    kind: 'profit_loss',
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    lines,
    income: incomeDetail,
    expenses: expenseDetail,
    totalIncome: round2(revenue + otherIncome),
    totalExpenses: round2(costOfRevenue + operatingExpenses + otherExpenses),
    netProfit,
    grossProfit,
    operatingIncome,
  };
}
