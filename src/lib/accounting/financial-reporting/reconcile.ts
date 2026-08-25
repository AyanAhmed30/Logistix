/**
 * Cross-report reconciliation from posted-journal builders.
 * Pure comparisons — does not invent accounting amounts.
 */

import { round2 } from '@/lib/accounting/financial-reporting/types';
import type {
  BalanceSheetReport,
  GeneralLedgerReport,
  PartnerLedgerReport,
  ProfitLossReport,
  TrialBalanceReport,
  CashFlowReport,
} from '@/lib/accounting/financial-reporting/types';
import type { AgingReport } from '@/lib/accounting/financial-reporting/aging';

export type ReconStatus = 'PASS' | 'FAIL';

export type ReconCheck = {
  id: string;
  label: string;
  status: ReconStatus;
  detail: string;
  delta: number;
};

const TOL = 0.05;

export function amountsEqual(a: number, b: number, tol = TOL) {
  return Math.abs(round2(a) - round2(b)) <= tol;
}

function check(
  id: string,
  label: string,
  left: number,
  right: number,
  extra = ''
): ReconCheck {
  const delta = round2(left - right);
  const pass = Math.abs(delta) <= TOL;
  return {
    id,
    label,
    status: pass ? 'PASS' : 'FAIL',
    detail: pass
      ? extra || `${round2(left)} = ${round2(right)}`
      : `${round2(left)} vs ${round2(right)}${extra ? ` — ${extra}` : ''}`,
    delta,
  };
}

export function reconcileTrialBalanceIdentity(tb: TrialBalanceReport): ReconCheck[] {
  const out: ReconCheck[] = [
    check(
      'tb-period-balanced',
      'Trial Balance period debit = period credit',
      tb.totalPeriodDebit,
      tb.totalPeriodCredit
    ),
  ];
  for (const g of tb.groups) {
    for (const row of g.accounts) {
      const expectedDebit = round2(row.opening_debit + row.period_debit);
      const expectedCredit = round2(row.opening_credit + row.period_credit);
      if (!amountsEqual(expectedDebit, row.closing_debit) || !amountsEqual(expectedCredit, row.closing_credit)) {
        out.push({
          id: `tb-open-period-close:${row.account_id}`,
          label: `${row.code} opening + period = closing`,
          status: 'FAIL',
          detail: `debit ${expectedDebit} vs ${row.closing_debit}; credit ${expectedCredit} vs ${row.closing_credit}`,
          delta: round2(expectedDebit - row.closing_debit),
        });
      }
    }
  }
  if (out.length === 1) {
    out.push({
      id: 'tb-open-period-close',
      label: 'Every Trial Balance account: opening + period = closing',
      status: 'PASS',
      detail: `${tb.groups.reduce((s, g) => s + g.accounts.length, 0)} accounts`,
      delta: 0,
    });
  }
  return out;
}

export function reconcileTrialBalanceToGeneralLedger(
  tb: TrialBalanceReport,
  gl: GeneralLedgerReport
): ReconCheck[] {
  const out: ReconCheck[] = [
    check(
      'tb-gl-period-debit',
      'Trial Balance period debit = General Ledger debit',
      tb.totalPeriodDebit,
      gl.totalDebit
    ),
    check(
      'tb-gl-period-credit',
      'Trial Balance period credit = General Ledger credit',
      tb.totalPeriodCredit,
      gl.totalCredit
    ),
  ];
  const glById = new Map(gl.accounts.map((a) => [a.account_id, a]));
  let mismatches = 0;
  for (const g of tb.groups) {
    for (const row of g.accounts) {
      const acc = glById.get(row.account_id);
      if (!acc) {
        if (
          Math.abs(row.period_debit) > TOL ||
          Math.abs(row.period_credit) > TOL ||
          Math.abs(row.end_balance) > TOL
        ) {
          mismatches += 1;
        }
        continue;
      }
      if (
        !amountsEqual(acc.period_debit, row.period_debit) ||
        !amountsEqual(acc.period_credit, row.period_credit) ||
        !amountsEqual(acc.opening_balance, row.initial_balance) ||
        !amountsEqual(acc.closing_balance, row.end_balance)
      ) {
        mismatches += 1;
        out.push({
          id: `tb-gl-account:${row.code}`,
          label: `${row.code} ${row.name}`,
          status: 'FAIL',
          detail: `TB end ${row.end_balance} vs GL close ${acc.closing_balance}`,
          delta: round2(row.end_balance - acc.closing_balance),
        });
      }
    }
  }
  if (mismatches === 0) {
    out.push({
      id: 'tb-gl-accounts',
      label: 'Trial Balance ↔ General Ledger account-by-account',
      status: 'PASS',
      detail: `${gl.accounts.length} ledger accounts`,
      delta: 0,
    });
  }
  return out;
}

export function reconcileTrialBalanceToBalanceSheet(
  tb: TrialBalanceReport,
  bs: BalanceSheetReport
): ReconCheck[] {
  const sumType = (type: string) =>
    round2(
      tb.groups
        .filter((g) => g.key === type)
        .reduce(
          (s, g) => s + g.accounts.reduce((a, r) => a + signedTb(r.type, r.end_balance), 0),
          0
        )
    );

  function signedTb(type: string, endBalanceDc: number) {
    if (type === 'asset' || type === 'expense') return endBalanceDc;
    return round2(-endBalanceDc);
  }

  const tbAssets = sumType('asset');
  const tbLiab = sumType('liability');
  const tbEquity = sumType('equity');
  const tbIncome = sumType('income');
  const tbExpense = sumType('expense');
  const foldedEquity = round2(tbEquity + tbIncome - tbExpense);

  return [
    check('tb-bs-assets', 'Trial Balance assets ↔ Balance Sheet assets', tbAssets, bs.totalAssets),
    check(
      'tb-bs-liabilities',
      'Trial Balance liabilities ↔ Balance Sheet liabilities',
      tbLiab,
      bs.totalLiabilities
    ),
    check(
      'tb-bs-equity-folded',
      'TB equity + P&L result ↔ Balance Sheet equity',
      foldedEquity,
      bs.totalEquity
    ),
    check(
      'bs-equation',
      'Assets = Liabilities + Equity',
      bs.totalAssets,
      bs.totalLiabilitiesAndEquity
    ),
  ];
}

export function reconcileTrialBalanceToProfitLoss(
  tb: TrialBalanceReport,
  pl: ProfitLossReport
): ReconCheck[] {
  const income = round2(
    (tb.groups.find((g) => g.key === 'income')?.accounts || []).reduce(
      (s, r) => s + signedTbPeriod(r.type, r.period_debit, r.period_credit),
      0
    )
  );
  const expense = round2(
    (tb.groups.find((g) => g.key === 'expense')?.accounts || []).reduce(
      (s, r) => s + signedTbPeriod(r.type, r.period_debit, r.period_credit),
      0
    )
  );
  const net = round2(income - expense);

  function signedTbPeriod(type: string, debit: number, credit: number) {
    if (type === 'asset' || type === 'expense') return round2(debit - credit);
    return round2(credit - debit);
  }

  return [
    check('tb-pl-income', 'Trial Balance income ↔ P&L total income', income, pl.totalIncome),
    check('tb-pl-expense', 'Trial Balance expense ↔ P&L total expenses', expense, pl.totalExpenses),
    check('tb-pl-net', 'Trial Balance net ↔ P&L net profit', net, pl.netProfit),
  ];
}

export function reconcileBalanceSheetToProfitLoss(
  bs: BalanceSheetReport,
  pl: ProfitLossReport
): ReconCheck[] {
  return [
    check(
      'bs-pl-cye',
      'Balance Sheet current-year earnings ↔ P&L net profit (same YTD window)',
      bs.currentYearEarnings,
      pl.netProfit
    ),
  ];
}

export function reconcileCashFlowToLiquidity(
  tb: TrialBalanceReport,
  cf: CashFlowReport
): ReconCheck[] {
  const liq = (tb.groups.find((g) => g.key === 'asset')?.accounts || []).filter(
    (a) =>
      a.account_type === 'bank' ||
      a.account_type === 'cash' ||
      a.code === '1100' ||
      a.code === '1200'
  );
  const opening = round2(liq.reduce((s, a) => s + a.initial_balance, 0));
  const closing = round2(liq.reduce((s, a) => s + a.end_balance, 0));
  return [
    check('cf-opening', 'Cash Flow opening ↔ Trial Balance bank/cash opening', cf.openingCash, opening),
    check('cf-closing', 'Cash Flow closing ↔ Trial Balance bank/cash closing', cf.closingCash, closing),
    check(
      'cf-movement',
      'Cash Flow net change ↔ closing − opening',
      cf.actualCashMovement,
      round2(cf.closingCash - cf.openingCash)
    ),
  ];
}

export function reconcilePartnerLedgerToAging(
  partner: PartnerLedgerReport,
  aging: AgingReport,
  side: 'receivable' | 'payable'
): ReconCheck[] {
  const agingByPartner = new Map(aging.partners.map((p) => [p.partner_key, p.total]));
  let mismatches = 0;
  const details: ReconCheck[] = [];

  for (const p of partner.partners) {
    const gl =
      side === 'receivable' ? p.receivable_outstanding : p.payable_outstanding;
    const aged = agingByPartner.get(p.partner_key);
    if (aged == null) {
      if (Math.abs(gl) > TOL) {
        mismatches += 1;
        details.push({
          id: `pl-aging-missing:${p.partner_key}`,
          label: p.partner_name,
          status: 'FAIL',
          detail: `Partner ledger ${gl} has no aging row`,
          delta: gl,
        });
      }
      continue;
    }
    if (!amountsEqual(gl, aged)) {
      mismatches += 1;
      details.push({
        id: `pl-aging:${p.partner_name}`,
        label: p.partner_name,
        status: 'FAIL',
        detail: `Ledger ${gl} vs aging ${aged}`,
        delta: round2(gl - aged),
      });
    }
  }

  const agingTotal = aging.grandTotal;
  const partnerTotal = round2(
    partner.partners.reduce(
      (s, p) =>
        s +
        (side === 'receivable' ? p.receivable_outstanding : p.payable_outstanding),
      0
    )
  );

  const summary: ReconCheck[] = [
    check(
      `pl-aging-total-${side}`,
      side === 'receivable'
        ? 'Partner Ledger ↔ Aged Receivable totals'
        : 'Partner Ledger ↔ Aged Payable totals',
      partnerTotal,
      agingTotal
    ),
  ];
  if (mismatches === 0) {
    summary.push({
      id: `pl-aging-partners-${side}`,
      label: 'Partner-by-partner aging matches ledger residual',
      status: 'PASS',
      detail: `${aging.partners.length} partners`,
      delta: 0,
    });
  }
  return [...summary, ...details.slice(0, 12)];
}

export function reconcileAgingToTrialBalance(
  tb: TrialBalanceReport,
  aging: AgingReport,
  side: 'receivable' | 'payable'
): ReconCheck {
  const rows = (tb.groups.find((g) => g.key === (side === 'receivable' ? 'asset' : 'liability'))
    ?.accounts || []).filter((a) => a.account_type === side);
  const tbOutstanding = round2(
    rows.reduce((s, a) => {
      // TB end_balance is debit − credit
      return s + (side === 'receivable' ? a.end_balance : -a.end_balance);
    }, 0)
  );
  return check(
    `tb-aging-${side}`,
    side === 'receivable'
      ? 'Trial Balance receivables ↔ Aged Receivable'
      : 'Trial Balance payables ↔ Aged Payable',
    tbOutstanding,
    aging.grandTotal
  );
}

export function summarizeRecon(checks: ReconCheck[]): {
  passed: number;
  failed: number;
  status: ReconStatus;
} {
  const failed = checks.filter((c) => c.status === 'FAIL').length;
  const passed = checks.filter((c) => c.status === 'PASS').length;
  return { passed, failed, status: failed === 0 ? 'PASS' : 'FAIL' };
}
