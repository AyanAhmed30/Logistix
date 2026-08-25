import {
  loadChartAccounts,
  loadPostedLedgerFacts,
  rawDebitCreditBalance,
  splitFactsByPeriod,
} from '@/lib/accounting/financial-reporting/ledger';
import {
  round2,
  type TrialBalanceAccountRow,
  type TrialBalanceGroup,
  type TrialBalanceReport,
} from '@/lib/accounting/financial-reporting/types';
import type { CoaClassification } from '@/lib/accounting-chart-of-accounts';

const GROUP_META: {
  type: CoaClassification;
  sequence: number;
  label: string;
}[] = [
  { type: 'asset', sequence: 1, label: 'Assets' },
  { type: 'liability', sequence: 2, label: 'Liabilities' },
  { type: 'equity', sequence: 3, label: 'Equity' },
  { type: 'income', sequence: 4, label: 'Operating Income' },
  { type: 'expense', sequence: 5, label: 'Expenses' },
];

function emptyDc() {
  return { debit: 0, credit: 0 };
}

/**
 * Trial Balance from posted journal items.
 * Opening = activity before dateFrom; period = [dateFrom, dateTo]; closing = through dateTo.
 * Display balances use debit − credit (Odoo convention). Period debit/credit must balance.
 */
export async function buildTrialBalance(opts: {
  organizationId: string | null;
  dateFrom: string;
  dateTo: string;
  currency?: string;
}): Promise<TrialBalanceReport> {
  const accounts = await loadChartAccounts(opts.organizationId);
  const accountIndex = new Map(accounts.map((a) => [a.id, a]));

  const throughTo = await loadPostedLedgerFacts({
    organizationId: opts.organizationId,
    dateTo: opts.dateTo,
  });
  const { opening: openingFacts, period: periodFacts, closing: closingFacts } =
    splitFactsByPeriod(throughTo, opts.dateFrom, opts.dateTo);

  const opening = new Map<string, { debit: number; credit: number }>();
  const period = new Map<string, { debit: number; credit: number }>();
  const closing = new Map<string, { debit: number; credit: number }>();

  const bump = (
    map: Map<string, { debit: number; credit: number }>,
    accountId: string,
    debit: number,
    credit: number
  ) => {
    const cur = map.get(accountId) || emptyDc();
    cur.debit += debit;
    cur.credit += credit;
    map.set(accountId, cur);
  };

  for (const f of openingFacts)
    bump(opening, f.account_id || '__unmapped__', f.debit, f.credit);
  for (const f of periodFacts)
    bump(period, f.account_id || '__unmapped__', f.debit, f.credit);
  for (const f of closingFacts)
    bump(closing, f.account_id || '__unmapped__', f.debit, f.credit);

  const accountIds = new Set([
    ...opening.keys(),
    ...period.keys(),
    ...closing.keys(),
  ]);

  const rows: TrialBalanceAccountRow[] = [];
  for (const id of accountIds) {
    const meta = accountIndex.get(id);
    if (meta?.type === 'view') continue;
    const type = (meta?.type || 'asset') as CoaClassification;
    const o = opening.get(id) || emptyDc();
    const p = period.get(id) || emptyDc();
    const c = closing.get(id) || emptyDc();
    const od = round2(o.debit);
    const oc = round2(o.credit);
    const pd = round2(p.debit);
    const pc = round2(p.credit);
    const cd = round2(c.debit);
    const cc = round2(c.credit);
    if (
      Math.abs(od) < 0.004 &&
      Math.abs(oc) < 0.004 &&
      Math.abs(pd) < 0.004 &&
      Math.abs(pc) < 0.004 &&
      Math.abs(cd) < 0.004 &&
      Math.abs(cc) < 0.004
    ) {
      continue;
    }
    rows.push({
      account_id: id,
      code: meta?.code || 'UNMAPPED',
      name: meta?.name || `Unmapped account (${id.slice(0, 8)})`,
      type,
      account_type: meta?.account_type || null,
      opening_debit: od,
      opening_credit: oc,
      initial_balance: rawDebitCreditBalance(od, oc),
      period_debit: pd,
      period_credit: pc,
      closing_debit: cd,
      closing_credit: cc,
      end_balance: rawDebitCreditBalance(cd, cc),
    });
  }

  rows.sort((a, b) => a.code.localeCompare(b.code));

  const groups: TrialBalanceGroup[] = [];
  const groupedIds = new Set<string>();
  for (const g of GROUP_META) {
    const accountsInGroup = rows.filter((r) => r.type === g.type);
    if (!accountsInGroup.length) continue;
    for (const a of accountsInGroup) groupedIds.add(a.account_id);
    groups.push({
      key: g.type,
      label: `${g.sequence} ${g.label}`,
      sequence: g.sequence,
      initial_balance: round2(
        accountsInGroup.reduce((s, r) => s + r.initial_balance, 0)
      ),
      period_debit: round2(
        accountsInGroup.reduce((s, r) => s + r.period_debit, 0)
      ),
      period_credit: round2(
        accountsInGroup.reduce((s, r) => s + r.period_credit, 0)
      ),
      end_balance: round2(
        accountsInGroup.reduce((s, r) => s + r.end_balance, 0)
      ),
      accounts: accountsInGroup,
    });
  }
  const leftover = rows.filter((r) => !groupedIds.has(r.account_id));
  if (leftover.length) {
    groups.push({
      key: 'other',
      label: '6 Other',
      sequence: 6,
      initial_balance: round2(leftover.reduce((s, r) => s + r.initial_balance, 0)),
      period_debit: round2(leftover.reduce((s, r) => s + r.period_debit, 0)),
      period_credit: round2(leftover.reduce((s, r) => s + r.period_credit, 0)),
      end_balance: round2(leftover.reduce((s, r) => s + r.end_balance, 0)),
      accounts: leftover,
    });
  }

  const totalPeriodDebit = round2(rows.reduce((s, r) => s + r.period_debit, 0));
  const totalPeriodCredit = round2(rows.reduce((s, r) => s + r.period_credit, 0));

  return {
    kind: 'trial_balance',
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    groups,
    totalInitialBalance: round2(
      rows.reduce((s, r) => s + r.initial_balance, 0)
    ),
    totalPeriodDebit,
    totalPeriodCredit,
    totalEndBalance: round2(rows.reduce((s, r) => s + r.end_balance, 0)),
    balanced: Math.abs(totalPeriodDebit - totalPeriodCredit) < 0.05,
  };
}
