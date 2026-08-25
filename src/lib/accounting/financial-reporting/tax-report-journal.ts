/**
 * Tax Report grouping from posted journal items (not document headers).
 */

import { formatTaxReportLabel } from '@/lib/accounting/financial-reporting/tax-label';
import { round2 } from '@/lib/accounting/financial-reporting/types';
import type { TaxReportLine } from '@/lib/accounting/financial-reporting/tax-report';

export type TaxJournalLineInput = {
  id: string;
  entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  tax_label: string | null;
  source_type: string | null;
};

export type TaxMasterForReport = {
  id: string;
  type: string;
  rate_value: number;
  invoice_label: string;
  name: string;
  account_id: string | null;
};

function lineAbs(line: { debit: number; credit: number }) {
  return round2(Math.max(Number(line.debit) || 0, Number(line.credit) || 0));
}

const TAX_DOCUMENT_SOURCES = new Set([
  'customer_invoice',
  'credit_note',
  'vendor_bill',
  'vendor_refund',
]);

export function isTaxJournalLine(
  line: TaxJournalLineInput,
  taxAccountIds: Set<string>,
  opts?: {
    /** When true, only lines with tax_label count (sibling lines on the same JE are labeled). */
    requireLabel?: boolean;
    /** Account IDs that cannot be tax payable/receivable (P&L, AR/AP, bank/cash). */
    nonTaxAccountIds?: Set<string>;
  }
) {
  const accountId = String(line.account_id || '');
  if (opts?.nonTaxAccountIds?.has(accountId)) return false;
  const labeled = Boolean(String(line.tax_label || '').trim());
  if (opts?.requireLabel) return labeled;
  if (labeled) return true;
  const src = String(line.source_type || '');
  if (!TAX_DOCUMENT_SOURCES.has(src)) return false;
  return taxAccountIds.has(accountId);
}

export function taxSectionForLine(
  line: TaxJournalLineInput,
  salesAccountIds: Set<string>,
  purchaseAccountIds: Set<string>
): 'sales' | 'purchases' {
  const src = String(line.source_type || '');
  if (
    src === 'vendor_bill' ||
    src === 'vendor_refund' ||
    src === 'vendor_payment'
  ) {
    return 'purchases';
  }
  if (
    src === 'customer_invoice' ||
    src === 'credit_note' ||
    src === 'customer_payment'
  ) {
    return 'sales';
  }
  const onPurchase = purchaseAccountIds.has(line.account_id);
  const onSales = salesAccountIds.has(line.account_id);
  if (onPurchase && !onSales) return 'purchases';
  if (onSales && !onPurchase) return 'sales';
  if (onPurchase) return 'purchases';
  return 'sales';
}

export function signedTaxAmount(
  section: 'sales' | 'purchases',
  debit: number,
  credit: number
) {
  if (section === 'sales') return round2((Number(credit) || 0) - (Number(debit) || 0));
  return round2((Number(debit) || 0) - (Number(credit) || 0));
}

/** Untaxed base from the same JE: drop the AR/AP balancing line. */
export function taxableNetForSection(
  section: 'sales' | 'purchases',
  entryLines: TaxJournalLineInput[],
  taxLineIds: Set<string>
) {
  const taxAbs = round2(
    entryLines
      .filter((l) => taxLineIds.has(l.id))
      .reduce((s, l) => s + lineAbs(l), 0)
  );
  const nonTax = entryLines.filter((l) => !taxLineIds.has(l.id));
  if (!nonTax.length) return 0;

  const ranked = nonTax
    .slice()
    .sort((a, b) => lineAbs(b) - lineAbs(a));
  const counterpart = ranked[0];
  const baseLines = ranked.slice(1);
  const baseAbs = round2(baseLines.reduce((s, l) => s + lineAbs(l), 0));
  const counterpartLooksLikeBalance =
    Math.abs(lineAbs(counterpart) - round2(baseAbs + taxAbs)) < 0.05;

  const lines = counterpartLooksLikeBalance ? baseLines : nonTax;
  const signed = lines.reduce((s, l) => {
    const d = Number(l.debit) || 0;
    const c = Number(l.credit) || 0;
    return s + (section === 'sales' ? c - d : d - c);
  }, 0);
  return round2(signed);
}

function parseRateFromLabel(label: string | null): number | null {
  const m = String(label || '').match(/\(([\d.]+)\s*%\)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? round2(n) : null;
}

export function aggregateTaxReportFromJournalLines(opts: {
  lines: TaxJournalLineInput[];
  masters: TaxMasterForReport[];
  /** CoA classification by account id — income/expense/AR/AP cannot be tax accounts. */
  accountClassById?: Map<string, string>;
  accountTypeById?: Map<string, string | null>;
}): { sales: TaxReportLine[]; purchases: TaxReportLine[] } {
  const TRADE_OR_PNL = new Set([
    'income',
    'expense',
    'equity',
    'view',
    'receivable',
    'payable',
    'bank',
    'cash',
    'other_income',
    'cost_of_revenue',
    'depreciation',
    'administrative',
    'fixed_assets',
  ]);
  const nonTaxAccountIds = new Set<string>();
  if (opts.accountClassById) {
    for (const [id, cls] of opts.accountClassById) {
      if (TRADE_OR_PNL.has(cls)) nonTaxAccountIds.add(id);
    }
  }
  if (opts.accountTypeById) {
    for (const [id, at] of opts.accountTypeById) {
      if (at && TRADE_OR_PNL.has(at)) nonTaxAccountIds.add(id);
    }
  }

  const salesAccountIds = new Set(
    opts.masters
      .filter(
        (m) =>
          m.type === 'sales_tax' &&
          m.account_id &&
          !nonTaxAccountIds.has(String(m.account_id))
      )
      .map((m) => String(m.account_id))
  );
  const purchaseAccountIds = new Set(
    opts.masters
      .filter(
        (m) =>
          m.type === 'purchase_tax' &&
          m.account_id &&
          !nonTaxAccountIds.has(String(m.account_id))
      )
      .map((m) => String(m.account_id))
  );
  const taxAccountIds = new Set([...salesAccountIds, ...purchaseAccountIds]);

  const byEntry = new Map<string, TaxJournalLineInput[]>();
  for (const line of opts.lines) {
    const list = byEntry.get(line.entry_id) || [];
    list.push(line);
    byEntry.set(line.entry_id, list);
  }

  const salesMap = new Map<string, TaxReportLine>();
  const purchaseMap = new Map<string, TaxReportLine>();

  const bump = (
    map: Map<string, TaxReportLine>,
    key: string,
    label: string,
    taxId: string | null,
    rate: number,
    net: number,
    tax: number
  ) => {
    const cur = map.get(key) || {
      key,
      label,
      tax_id: taxId,
      rate,
      net: 0,
      tax: 0,
    };
    cur.net = round2(cur.net + net);
    cur.tax = round2(cur.tax + tax);
    map.set(key, cur);
  };

  for (const [, entryLines] of byEntry) {
    const anyLabel = entryLines.some((l) =>
      Boolean(String(l.tax_label || '').trim())
    );
    const taxLines = entryLines.filter((l) =>
      isTaxJournalLine(l, taxAccountIds, {
        requireLabel: anyLabel,
        nonTaxAccountIds,
      })
    );
    if (!taxLines.length) continue;
    const taxIds = new Set(taxLines.map((l) => l.id));
    const taxAbsTotal = round2(taxLines.reduce((s, l) => s + lineAbs(l), 0));

    const bySection = new Map<'sales' | 'purchases', TaxJournalLineInput[]>();
    for (const tl of taxLines) {
      const section = taxSectionForLine(
        tl,
        salesAccountIds,
        purchaseAccountIds
      );
      const list = bySection.get(section) || [];
      list.push(tl);
      bySection.set(section, list);
    }

    for (const [section, sectionTaxLines] of bySection) {
      const net = taxableNetForSection(section, entryLines, taxIds);
      const map = section === 'sales' ? salesMap : purchaseMap;
      const sectionTaxAbs = round2(
        sectionTaxLines.reduce((s, l) => s + lineAbs(l), 0)
      );

      for (const tl of sectionTaxLines) {
        const tax = signedTaxAmount(section, tl.debit, tl.credit);
        if (Math.abs(tax) < 0.004 && Math.abs(net) < 0.004) continue;
        const share =
          taxAbsTotal > 0.004 && sectionTaxAbs > 0.004
            ? lineAbs(tl) / sectionTaxAbs
            : 1;
        const lineNet = round2(net * share);
        const computedRate =
          Math.abs(lineNet) > 0.004
            ? round2((Math.abs(tax) / Math.abs(lineNet)) * 100)
            : null;
        const labeledRate = parseRateFromLabel(tl.tax_label);
        const rateHint = computedRate ?? labeledRate;
        const type = section === 'sales' ? 'sales_tax' : 'purchase_tax';
        const master =
          (rateHint != null
            ? opts.masters.find(
                (m) =>
                  m.type === type &&
                  Math.abs(m.rate_value - rateHint) < 0.05
              )
            : null) ||
          opts.masters.find(
            (m) => m.type === type && m.account_id === tl.account_id
          ) ||
          null;
        const label = master
          ? formatTaxReportLabel(
              master.invoice_label || master.name,
              master.rate_value
            )
          : String(tl.tax_label || '').trim() ||
            formatTaxReportLabel(
              section === 'sales' ? 'Sales Tax' : 'Purchase Tax',
              rateHint
            );
        const key = master?.id || `label:${label}`;
        bump(
          map,
          key,
          label,
          master?.id || null,
          master?.rate_value ?? rateHint ?? 0,
          lineNet,
          tax
        );
      }
    }
  }

  const finalize = (map: Map<string, TaxReportLine>) =>
    [...map.values()]
      .filter((l) => Math.abs(l.net) > 0.004 || Math.abs(l.tax) > 0.004)
      .sort((a, b) => a.label.localeCompare(b.label));

  return { sales: finalize(salesMap), purchases: finalize(purchaseMap) };
}
