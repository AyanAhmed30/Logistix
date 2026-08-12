import {
  loadChartAccounts,
  loadPostedLedgerFacts,
  rawDebitCreditBalance,
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

  // Load period facts; prefer trade accounts, but also any lines with contact
  const periodFacts = await loadPostedLedgerFacts({
    organizationId: opts.organizationId,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    contactId: opts.contactId || null,
  });

  const relevant = periodFacts.filter((f) => {
    const meta = accountIndex.get(f.account_id);
    if (!meta) return false;
    const isTrade =
      TRADE_ACCOUNT_TYPES.has(String(meta.account_type || '')) ||
      tradeAccountIds.includes(f.account_id);
    const hasPartner = Boolean(f.contact_id || f.partner_name);
    return isTrade && hasPartner;
  });

  const search = String(opts.search || '')
    .trim()
    .toLowerCase();

  const byPartner = new Map<string, typeof relevant>();
  for (const f of relevant) {
    const key = f.contact_id || `name:${(f.partner_name || 'Unknown').toLowerCase()}`;
    const list = byPartner.get(key) || [];
    list.push(f);
    byPartner.set(key, list);
  }

  const partners: PartnerLedgerPartner[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const [partnerKey, facts] of [...byPartner.entries()].sort((a, b) => {
    const na = a[1][0]?.partner_name || '';
    const nb = b[1][0]?.partner_name || '';
    return na.localeCompare(nb);
  })) {
    const partnerName = facts[0]?.partner_name || 'Unknown Partner';
    const contactId = facts[0]?.contact_id || null;

    if (search) {
      const hay = partnerName.toLowerCase();
      if (!hay.includes(search) && !partnerKey.toLowerCase().includes(search)) {
        continue;
      }
    }

    const sorted = facts.slice().sort((a, b) => {
      const d = a.entry_date.localeCompare(b.entry_date);
      if (d !== 0) return d;
      return a.line_id.localeCompare(b.line_id);
    });

    let running = 0;
    let periodDebit = 0;
    let periodCredit = 0;
    const lines: PartnerLedgerLine[] = [];

    for (const f of sorted) {
      const meta = accountIndex.get(f.account_id);
      periodDebit = round2(periodDebit + f.debit);
      periodCredit = round2(periodCredit + f.credit);
      running = round2(running + f.debit - f.credit);
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
      partner_key: partnerKey,
      contact_id: contactId,
      partner_name: partnerName,
      period_debit: periodDebit,
      period_credit: periodCredit,
      balance: rawDebitCreditBalance(periodDebit, periodCredit),
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
