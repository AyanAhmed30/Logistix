/**
 * Tax Report (Phase 4) — Odoo-style Generic Tax report.
 *
 * Source of truth: posted journal entry tax lines (tax_label / tax accounts).
 * Document headers are not re-totalled independently.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { round2 } from '@/lib/accounting/financial-reporting/types';
import { loadChartAccounts } from '@/lib/accounting/financial-reporting/ledger';
import {
  aggregateTaxReportFromJournalLines,
  type TaxJournalLineInput,
  type TaxMasterForReport,
} from '@/lib/accounting/financial-reporting/tax-report-journal';

export type TaxReportLine = {
  key: string;
  label: string;
  tax_id: string | null;
  rate: number;
  net: number;
  tax: number;
};

export type TaxReportSection = {
  id: 'sales' | 'purchases';
  label: string;
  lines: TaxReportLine[];
  totalNet: number;
  totalTax: number;
};

export type TaxReport = {
  kind: 'tax_report';
  dateFrom: string;
  dateTo: string;
  organizationId: string | null;
  currency: string;
  sections: TaxReportSection[];
  totalNet: number;
  totalTax: number;
  /** True when journal queries hit row caps — totals may be incomplete. */
  truncated?: boolean;
};

async function loadTaxMasters(
  organizationId: string | null
): Promise<TaxMasterForReport[]> {
  const supabase = await createAdminClient();
  let q = supabase
    .from('taxes')
    .select(
      'id, type, rate_value, invoice_label, name, account_id, organization_id, is_active'
    )
    .eq('is_active', true);
  if (organizationId) {
    q = q.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  }
  const { data, error } = await q;
  if (error) return [];
  return (data || []).map((r) => ({
    id: String(r.id),
    type: String(r.type || ''),
    rate_value: Number(r.rate_value) || 0,
    invoice_label: String(r.invoice_label || r.name || 'Tax'),
    name: String(r.name || 'Tax'),
    account_id: r.account_id ? String(r.account_id) : null,
  }));
}

/**
 * Build Generic Tax Report for a period from posted journal items.
 */
export async function buildTaxReport(opts: {
  organizationId: string | null;
  dateFrom: string;
  dateTo: string;
  currency?: string;
}): Promise<TaxReport> {
  const supabase = await createAdminClient();
  const masters = await loadTaxMasters(opts.organizationId);

  const entryRows: { id: string; source_type: string | null }[] = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    let eq = supabase
      .from('accounting_journal_entries')
      .select('id, source_type, organization_id, entry_date, status')
      .eq('status', 'posted')
      .gte('entry_date', opts.dateFrom)
      .lte('entry_date', opts.dateTo)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (opts.organizationId) {
      eq = eq.eq('organization_id', opts.organizationId);
    }
    const { data: entries, error: eErr } = await eq;
    if (eErr) throw new Error(eErr.message);
    const batch = entries || [];
    for (const e of batch) {
      entryRows.push({
        id: String(e.id),
        source_type: e.source_type ? String(e.source_type) : null,
      });
    }
    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 500_000) break;
  }

  const truncated = from > 500_000;
  const sourceByEntry = new Map(
    entryRows.map((e) => [e.id, e.source_type])
  );

  const lines: TaxJournalLineInput[] = [];
  const ids = entryRows.map((e) => String(e.id));
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let lineFrom = 0;
    let select =
      'id, journal_entry_id, account_id, debit, credit, tax_label';
    for (;;) {
      const raw = await supabase
        .from('accounting_journal_entry_lines')
        .select(select)
        .in('journal_entry_id', chunk)
        .order('id', { ascending: true })
        .range(lineFrom, lineFrom + PAGE - 1);
      if (raw.error && /tax_label|column/i.test(raw.error.message)) {
        select = 'id, journal_entry_id, account_id, debit, credit';
        continue;
      }
      if (raw.error) throw new Error(raw.error.message);
      const batch = Array.isArray(raw.data)
        ? (raw.data as unknown as Record<string, unknown>[])
        : [];
      for (const row of batch) {
        const entryId = String(row.journal_entry_id || '');
        lines.push({
          id: String(row.id || ''),
          entry_id: entryId,
          account_id: String(row.account_id || ''),
          debit: Number(row.debit) || 0,
          credit: Number(row.credit) || 0,
          tax_label:
            'tax_label' in row && row.tax_label
              ? String(row.tax_label)
              : null,
          source_type: sourceByEntry.get(entryId) || null,
        });
      }
      if (batch.length < PAGE) break;
      lineFrom += PAGE;
      if (lineFrom > 500_000) break;
    }
  }

  const accounts = await loadChartAccounts(opts.organizationId);
  const accountClassById = new Map(
    accounts.map((a) => [a.id, String(a.type || '')])
  );
  const accountTypeById = new Map(
    accounts.map((a) => [a.id, a.account_type])
  );
  const aggregated = aggregateTaxReportFromJournalLines({
    lines,
    masters,
    accountClassById,
    accountTypeById,
  });

  const toSection = (
    id: 'sales' | 'purchases',
    label: string,
    sectionLines: TaxReportLine[]
  ): TaxReportSection => ({
    id,
    label,
    lines: sectionLines,
    totalNet: round2(sectionLines.reduce((s, l) => s + l.net, 0)),
    totalTax: round2(sectionLines.reduce((s, l) => s + l.tax, 0)),
  });

  const sections: TaxReportSection[] = [
    toSection('sales', 'Sales', aggregated.sales),
    toSection('purchases', 'Purchases', aggregated.purchases),
  ];

  return {
    kind: 'tax_report',
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    sections,
    totalNet: round2(sections.reduce((s, sec) => s + sec.totalNet, 0)),
    totalTax: round2(sections.reduce((s, sec) => s + sec.totalTax, 0)),
    truncated: truncated || undefined,
  };
}
