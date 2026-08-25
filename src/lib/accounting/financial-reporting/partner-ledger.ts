import {
  loadChartAccounts,
  loadPostedLedgerFacts,
  rawDebitCreditBalance,
  splitFactsByPeriod,
} from '@/lib/accounting/financial-reporting/ledger';
import {
  round2,
  type PartnerLedgerLine,
  type PartnerLedgerPartner,
  type PartnerLedgerReport,
} from '@/lib/accounting/financial-reporting/types';

const TRADE_ACCOUNT_TYPES = new Set([
  'receivable',
  'payable',
]);

/**
 * Partner Ledger — posted journal items linked to contacts on receivable/payable
 * (and any line with a contact_id on trade accounts).
 */
export async function buildPartnerLedger(opts: {
  organizationId: string | null;
  dateFrom: string;
  dateTo: string;
  currency?: string;
  search?: string | null;
  contactId?: string | null;
}): Promise<PartnerLedgerReport> {
  const accounts = await loadChartAccounts(opts.organizationId);
  const accountIndex = new Map(accounts.map((a) => [a.id, a]));

  const tradeAccountIds = accounts
    .filter((a) => TRADE_ACCOUNT_TYPES.has(String(a.account_type || '')))
    .map((a) => a.id);

  const throughTo = await loadPostedLedgerFacts({
    organizationId: opts.organizationId,
    dateTo: opts.dateTo,
    contactId: opts.contactId || null,
  });
  const { opening: openingFactsRaw, period: periodFacts } = splitFactsByPeriod(
    throughTo,
    opts.dateFrom,
    opts.dateTo
  );

  const isTradePartner = (f: (typeof periodFacts)[number]) => {
    const meta = accountIndex.get(f.account_id);
    if (!meta) return tradeAccountIds.includes(f.account_id);
    return (
      TRADE_ACCOUNT_TYPES.has(String(meta.account_type || '')) ||
      tradeAccountIds.includes(f.account_id)
    );
  };

  const sideOf = (accountId: string): 'receivable' | 'payable' | null => {
    const meta = accountIndex.get(accountId);
    const at = String(meta?.account_type || '');
    if (at === 'receivable') return 'receivable';
    if (at === 'payable') return 'payable';
    return null;
  };

  const openingFacts = openingFactsRaw.filter(isTradePartner);

  const relevant = periodFacts.filter(isTradePartner);

  const search = String(opts.search || '')
    .trim()
    .toLowerCase();

  const partnerKey = (f: (typeof relevant)[number]) =>
    f.contact_id || `name:${(f.partner_name || 'Unknown').toLowerCase()}`;

  const byPartner = new Map<string, typeof relevant>();
  for (const f of relevant) {
    const key = partnerKey(f);
    const list = byPartner.get(key) || [];
    list.push(f);
    byPartner.set(key, list);
  }

  const openingByPartner = new Map<string, typeof openingFacts>();
  for (const f of openingFacts) {
    const key = partnerKey(f);
    const list = openingByPartner.get(key) || [];
    list.push(f);
    openingByPartner.set(key, list);
    if (!byPartner.has(key)) byPartner.set(key, []);
  }

  const partners: PartnerLedgerPartner[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const [key, facts] of [...byPartner.entries()].sort((a, b) => {
    const na =
      a[1][0]?.partner_name ||
      openingByPartner.get(a[0])?.[0]?.partner_name ||
      '';
    const nb =
      b[1][0]?.partner_name ||
      openingByPartner.get(b[0])?.[0]?.partner_name ||
      '';
    return na.localeCompare(nb);
  })) {
    const partnerName =
      facts[0]?.partner_name ||
      openingByPartner.get(key)?.[0]?.partner_name ||
      'Unknown Partner';
    const contactId =
      facts[0]?.contact_id ||
      openingByPartner.get(key)?.[0]?.contact_id ||
      null;

    if (search) {
      const hay = partnerName.toLowerCase();
      if (!hay.includes(search) && !key.toLowerCase().includes(search)) {
        continue;
      }
    }

    let openingDebit = 0;
    let openingCredit = 0;
    let recD = 0;
    let recC = 0;
    let payD = 0;
    let payC = 0;
    for (const f of openingByPartner.get(key) || []) {
      openingDebit = round2(openingDebit + f.debit);
      openingCredit = round2(openingCredit + f.credit);
      const side = sideOf(f.account_id);
      if (side === 'receivable') {
        recD = round2(recD + f.debit);
        recC = round2(recC + f.credit);
      } else if (side === 'payable') {
        payD = round2(payD + f.debit);
        payC = round2(payC + f.credit);
      }
    }
    const openingBalance = rawDebitCreditBalance(openingDebit, openingCredit);

    let running = openingBalance;
    let periodDebit = 0;
    let periodCredit = 0;
    const lines: PartnerLedgerLine[] = [];

    if (Math.abs(openingBalance) > 0.004) {
      lines.push({
        line_id: `opening:${key}`,
        entry_id: '',
        reference: 'Initial Balance',
        journal_code: null,
        account_code: '',
        account_name: '',
        entry_date: opts.dateFrom,
        due_date: opts.dateFrom,
        matching: null,
        debit: openingDebit > openingCredit ? openingBalance : 0,
        credit: openingCredit > openingDebit ? round2(-openingBalance) : 0,
        balance: openingBalance,
      });
    }

    const sorted = facts.slice().sort((a, b) => {
      const d = a.entry_date.localeCompare(b.entry_date);
      if (d !== 0) return d;
      return a.line_id.localeCompare(b.line_id);
    });

    for (const f of sorted) {
      const meta = accountIndex.get(f.account_id);
      periodDebit = round2(periodDebit + f.debit);
      periodCredit = round2(periodCredit + f.credit);
      running = round2(running + f.debit - f.credit);
      const side = sideOf(f.account_id);
      if (side === 'receivable') {
        recD = round2(recD + f.debit);
        recC = round2(recC + f.credit);
      } else if (side === 'payable') {
        payD = round2(payD + f.debit);
        payC = round2(payC + f.credit);
      }
      const matching =
        f.is_reconciled === true
          ? 'Matched'
          : f.amount_residual !== null &&
              Math.abs(f.amount_residual) < 0.004 &&
              (f.debit > 0 || f.credit > 0)
            ? 'Matched'
            : null;
      lines.push({
        line_id: f.line_id,
        entry_id: f.entry_id,
        reference: f.reference || f.source_number || f.entry_number,
        journal_code: f.journal_code,
        account_code: meta?.code || '',
        account_name: meta?.name || '',
        entry_date: f.entry_date,
        due_date: f.entry_date,
        matching,
        debit: round2(f.debit),
        credit: round2(f.credit),
        balance: running,
      });
    }

    totalDebit = round2(totalDebit + periodDebit);
    totalCredit = round2(totalCredit + periodCredit);

    partners.push({
      partner_key: key,
      contact_id: contactId,
      partner_name: partnerName,
      period_debit: periodDebit,
      period_credit: periodCredit,
      balance: running,
      receivable_outstanding: round2(recD - recC),
      payable_outstanding: round2(payC - payD),
      lines,
    });
  }

  return {
    kind: 'partner_ledger',
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    partners,
    totalDebit,
    totalCredit,
    totalBalance: rawDebitCreditBalance(totalDebit, totalCredit),
  };
}
