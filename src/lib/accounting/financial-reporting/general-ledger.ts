import {
  dayBefore,
  loadChartAccounts,
  loadPostedLedgerFacts,
  rawDebitCreditBalance,
} from '@/lib/accounting/financial-reporting/ledger';
import {
  round2,
  type GeneralLedgerAccount,
  type GeneralLedgerLine,
  type GeneralLedgerReport,
} from '@/lib/accounting/financial-reporting/types';

/**
 * General Ledger — accounts with posted journal items in period (+ opening).
 * Running balance uses debit − credit (Odoo).
 */
export async function buildGeneralLedger(opts: {
  organizationId: string | null;
  dateFrom: string;
  dateTo: string;
  currency?: string;
  search?: string | null;
}): Promise<GeneralLedgerReport> {
  const accounts = await loadChartAccounts(opts.organizationId);
  const accountIndex = new Map(accounts.map((a) => [a.id, a]));

  const beforeFrom = dayBefore(opts.dateFrom);
  const openingFacts = beforeFrom
    ? await loadPostedLedgerFacts({
        organizationId: opts.organizationId,
        dateTo: beforeFrom,
      })
    : [];
  const periodFacts = await loadPostedLedgerFacts({
    organizationId: opts.organizationId,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
  });

  const openingByAccount = new Map<string, { debit: number; credit: number }>();
  for (const f of openingFacts) {
    const cur = openingByAccount.get(f.account_id) || { debit: 0, credit: 0 };
    cur.debit += f.debit;
    cur.credit += f.credit;
    openingByAccount.set(f.account_id, cur);
  }

  const linesByAccount = new Map<string, typeof periodFacts>();
  for (const f of periodFacts) {
    const list = linesByAccount.get(f.account_id) || [];
    list.push(f);
    linesByAccount.set(f.account_id, list);
  }

  const accountIds = new Set([
    ...openingByAccount.keys(),
    ...linesByAccount.keys(),
  ]);

  const search = String(opts.search || '')
    .trim()
    .toLowerCase();

  const resultAccounts: GeneralLedgerAccount[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const accountId of [...accountIds].sort((a, b) => {
    const ca = accountIndex.get(a)?.code || '';
    const cb = accountIndex.get(b)?.code || '';
    return ca.localeCompare(cb);
  })) {
    const meta = accountIndex.get(accountId);
    if (!meta || meta.type === 'view') continue;

    if (search) {
      const hay = `${meta.code} ${meta.name}`.toLowerCase();
      if (!hay.includes(search)) continue;
    }

    const open = openingByAccount.get(accountId) || { debit: 0, credit: 0 };
    const openingBalance = rawDebitCreditBalance(open.debit, open.credit);
    const facts = (linesByAccount.get(accountId) || []).slice().sort((a, b) => {
      const d = a.entry_date.localeCompare(b.entry_date);
      if (d !== 0) return d;
      return a.line_id.localeCompare(b.line_id);
    });

    let running = openingBalance;
    let periodDebit = 0;
    let periodCredit = 0;
    const lines: GeneralLedgerLine[] = [];

    for (const f of facts) {
      periodDebit = round2(periodDebit + f.debit);
      periodCredit = round2(periodCredit + f.credit);
      running = round2(running + f.debit - f.credit);
      lines.push({
        line_id: f.line_id,
        entry_id: f.entry_id,
        entry_date: f.entry_date,
        journal_code: f.journal_code,
        reference: f.reference || f.source_number || f.entry_number,
        partner_name: f.partner_name,
        label: f.label,
        debit: round2(f.debit),
        credit: round2(f.credit),
        balance: running,
      });
    }

    if (!lines.length && Math.abs(openingBalance) < 0.004) {
      continue;
    }

    totalDebit = round2(totalDebit + periodDebit);
    totalCredit = round2(totalCredit + periodCredit);

    resultAccounts.push({
      account_id: accountId,
      code: meta.code,
      name: meta.name,
      type: meta.type,
      opening_balance: openingBalance,
      period_debit: periodDebit,
      period_credit: periodCredit,
      closing_balance: running,
      lines,
    });
  }

  return {
    kind: 'general_ledger',
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    accounts: resultAccounts,
    totalDebit,
    totalCredit,
    totalBalance: rawDebitCreditBalance(totalDebit, totalCredit),
    balanced: Math.abs(totalDebit - totalCredit) < 0.05,
  };
}
