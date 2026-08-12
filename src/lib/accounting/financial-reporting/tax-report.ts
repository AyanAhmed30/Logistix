/**
 * Tax Report (Phase 4) — Odoo-style Generic Tax report.
 *
 * Groups Net / Tax by tax rate for Sales and Purchases from posted documents
 * that have posted journal entries. Uses tax masters for display labels.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { formatTaxReportLabel } from '@/lib/accounting/financial-reporting/tax-label';
import { round2 } from '@/lib/accounting/financial-reporting/types';

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
  /** True when document queries hit row caps — totals may be incomplete. */
  truncated?: boolean;
};

type TaxMaster = {
  id: string;
  type: string;
  rate_value: number;
  invoice_label: string;
  name: string;
};

function pickTaxMaster(
  masters: TaxMaster[],
  kind: 'sales' | 'purchase',
  rateHint: number | null
): TaxMaster | null {
  const type = kind === 'sales' ? 'sales_tax' : 'purchase_tax';
  const pool = masters.filter((t) => t.type === type);
  if (!pool.length) return null;
  if (rateHint != null && Number.isFinite(rateHint)) {
    const match = pool.find((t) => Math.abs(t.rate_value - rateHint) < 0.05);
    if (match) return match;
  }
  // Never fall back to an unrelated tax master — wrong label/key is worse than generic.
  return null;
}

function bump(
  map: Map<string, TaxReportLine>,
  master: TaxMaster | null,
  rate: number,
  net: number,
  tax: number,
  fallbackLabel: string
) {
  const label = master
    ? formatTaxReportLabel(master.invoice_label || master.name, master.rate_value)
    : formatTaxReportLabel(fallbackLabel, rate);
  const key = master?.id || `rate:${rate.toFixed(2)}:${fallbackLabel}`;
  const cur = map.get(key) || {
    key,
    label,
    tax_id: master?.id || null,
    rate: master?.rate_value ?? rate,
    net: 0,
    tax: 0,
  };
  cur.net = round2(cur.net + net);
  cur.tax = round2(cur.tax + tax);
  map.set(key, cur);
}

async function loadTaxMasters(organizationId: string | null): Promise<TaxMaster[]> {
  const supabase = await createAdminClient();
  let q = supabase
    .from('taxes')
    .select('id, type, rate_value, invoice_label, name, organization_id, is_active')
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
  }));
}

async function postedDocIds(
  organizationId: string | null,
  sourceType: string,
  ids: string[]
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!ids.length) return set;
  const supabase = await createAdminClient();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let q = supabase
      .from('accounting_journal_entries')
      .select('source_id')
      .eq('status', 'posted')
      .eq('source_type', sourceType)
      .in('source_id', chunk);
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data } = await q;
    for (const r of data || []) {
      if (r.source_id) set.add(String(r.source_id));
    }
  }
  return set;
}

type TaxBucket = { rate: number; net: number; tax: number };

async function loadLineTaxBuckets(
  table: 'accounting_customer_invoice_lines' | 'accounting_vendor_bill_lines',
  fk: 'invoice_id' | 'bill_id',
  docIds: string[],
  headerById: Map<string, { untaxed: number; tax: number }>
): Promise<Map<string, TaxBucket[]>> {
  const result = new Map<string, TaxBucket[]>();
  if (!docIds.length) return result;
  const supabase = await createAdminClient();

  for (let i = 0; i < docIds.length; i += 200) {
    const chunk = docIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from(table)
      .select(`${fk}, taxes, quantity, unit_price, line_total`)
      .in(fk, chunk);
    if (error) continue;

    const byDoc = new Map<string, Map<number, number>>();
    for (const row of data || []) {
      const id = String((row as Record<string, unknown>)[fk] || '');
      if (!id) continue;
      const qty = Number(row.quantity) || 0;
      const price = Number(row.unit_price) || 0;
      const untaxed = Number(row.line_total) || round2(qty * price);
      const rate = round2(Number(row.taxes) || 0);
      const rateMap = byDoc.get(id) || new Map<number, number>();
      rateMap.set(rate, round2((rateMap.get(rate) || 0) + untaxed));
      byDoc.set(id, rateMap);
    }

    for (const [id, rateMap] of byDoc) {
      const header = headerById.get(id);
      const lineNet = round2([...rateMap.values()].reduce((s, n) => s + n, 0));
      const buckets: TaxBucket[] = [];
      for (const [rate, net] of rateMap) {
        let scaledNet = net;
        if (header && lineNet > 0.004 && Math.abs(header.untaxed - lineNet) > 0.02) {
          scaledNet = round2(net * (header.untaxed / lineNet));
        }
        const computedTax = round2(scaledNet * (rate / 100));
        buckets.push({ rate, net: scaledNet, tax: computedTax });
      }
      // Reconcile tax total to document header when present
      if (header && buckets.length) {
        const sumTax = round2(buckets.reduce((s, b) => s + b.tax, 0));
        const drift = round2(header.tax - sumTax);
        if (Math.abs(drift) >= 0.01) {
          const largest = buckets.reduce((a, b) =>
            Math.abs(a.net) >= Math.abs(b.net) ? a : b
          );
          largest.tax = round2(largest.tax + drift);
        }
        if (buckets.length === 1) {
          buckets[0].net = header.untaxed;
          buckets[0].tax = header.tax;
        }
      }
      result.set(id, buckets);
    }
  }

  // Docs with no lines: fall back to header as a single bucket
  for (const id of docIds) {
    if (result.has(id)) continue;
    const header = headerById.get(id);
    if (!header) continue;
    if (Math.abs(header.untaxed) < 0.004 && Math.abs(header.tax) < 0.004) continue;
    const rate =
      header.untaxed > 0.004
        ? round2((header.tax / header.untaxed) * 100)
        : 0;
    result.set(id, [{ rate, net: header.untaxed, tax: header.tax }]);
  }

  return result;
}

/**
 * Build Generic Tax Report for a period from posted invoices/bills/credit notes.
 */
export async function buildTaxReport(opts: {
  organizationId: string | null;
  dateFrom: string;
  dateTo: string;
  currency?: string;
}): Promise<TaxReport> {
  const supabase = await createAdminClient();
  const masters = await loadTaxMasters(opts.organizationId);
  const salesMap = new Map<string, TaxReportLine>();
  const purchaseMap = new Map<string, TaxReportLine>();
  let truncated = false;

  // --- Sales: invoices ---
  let invQ = supabase
    .from('accounting_customer_invoices')
    .select(
      'id, invoice_date, untaxed_amount, tax_amount, total_amount, status, organization_id'
    )
    .in('status', ['posted', 'paid'])
    .gte('invoice_date', opts.dateFrom)
    .lte('invoice_date', opts.dateTo);
  if (opts.organizationId) invQ = invQ.eq('organization_id', opts.organizationId);
  const { data: invoices, error: invErr } = await invQ.limit(8000);
  if (invErr) throw new Error(invErr.message);

  const invRows = invoices || [];
  if (invRows.length >= 8000) truncated = true;
  const invPosted = await postedDocIds(
    opts.organizationId,
    'customer_invoice',
    invRows.map((r) => String(r.id))
  );
  const postedInvIds = invRows
    .filter((r) => invPosted.has(String(r.id)))
    .map((r) => String(r.id));
  const invHeaders = new Map(
    postedInvIds.map((id) => {
      const inv = invRows.find((r) => String(r.id) === id)!;
      return [
        id,
        {
          untaxed: round2(Number(inv.untaxed_amount) || 0),
          tax: round2(Number(inv.tax_amount) || 0),
        },
      ] as const;
    })
  );
  const invBuckets = await loadLineTaxBuckets(
    'accounting_customer_invoice_lines',
    'invoice_id',
    postedInvIds,
    invHeaders
  );

  for (const id of postedInvIds) {
    const buckets = invBuckets.get(id) || [];
    for (const b of buckets) {
      if (Math.abs(b.net) < 0.004 && Math.abs(b.tax) < 0.004) continue;
      const master = pickTaxMaster(masters, 'sales', b.rate);
      bump(salesMap, master, b.rate, b.net, b.tax, 'Sales Tax');
    }
  }

  // --- Sales: credit notes (reduce) ---
  let cnQ = supabase
    .from('accounting_credit_notes')
    .select(
      'id, credit_note_date, untaxed_amount, tax_amount, status, organization_id'
    )
    .in('status', ['posted', 'paid'])
    .gte('credit_note_date', opts.dateFrom)
    .lte('credit_note_date', opts.dateTo);
  if (opts.organizationId) cnQ = cnQ.eq('organization_id', opts.organizationId);
  const { data: creditNotes, error: cnErr } = await cnQ.limit(4000);
  if (cnErr && !/relation|does not exist|column/i.test(cnErr.message)) {
    throw new Error(cnErr.message);
  }
  if (!cnErr && creditNotes?.length) {
    if (creditNotes.length >= 4000) truncated = true;
    const cnPosted = await postedDocIds(
      opts.organizationId,
      'credit_note',
      creditNotes.map((r) => String(r.id))
    );
    for (const cn of creditNotes) {
      const id = String(cn.id);
      if (!cnPosted.has(id)) continue;
      const untaxed = round2(Number(cn.untaxed_amount) || 0);
      const tax = round2(Number(cn.tax_amount) || 0);
      if (Math.abs(untaxed) < 0.004 && Math.abs(tax) < 0.004) continue;
      const rateHint =
        untaxed > 0.004 ? round2((tax / untaxed) * 100) : null;
      const master = pickTaxMaster(masters, 'sales', rateHint);
      bump(
        salesMap,
        master,
        rateHint ?? master?.rate_value ?? 0,
        -untaxed,
        -tax,
        'Sales Tax'
      );
    }
  }

  // --- Purchases: vendor bills ---
  let billQ = supabase
    .from('accounting_vendor_bills')
    .select(
      'id, bill_date, untaxed_amount, tax_amount, total_amount, status, organization_id'
    )
    .in('status', ['posted', 'paid'])
    .gte('bill_date', opts.dateFrom)
    .lte('bill_date', opts.dateTo);
  if (opts.organizationId) billQ = billQ.eq('organization_id', opts.organizationId);
  const { data: bills, error: billErr } = await billQ.limit(8000);
  if (billErr) throw new Error(billErr.message);

  const billRows = bills || [];
  if (billRows.length >= 8000) truncated = true;
  const billPosted = await postedDocIds(
    opts.organizationId,
    'vendor_bill',
    billRows.map((r) => String(r.id))
  );
  const postedBillIds = billRows
    .filter((r) => billPosted.has(String(r.id)))
    .map((r) => String(r.id));
  const billHeaders = new Map(
    postedBillIds.map((id) => {
      const bill = billRows.find((r) => String(r.id) === id)!;
      return [
        id,
        {
          untaxed: round2(Number(bill.untaxed_amount) || 0),
          tax: round2(Number(bill.tax_amount) || 0),
        },
      ] as const;
    })
  );
  const billBuckets = await loadLineTaxBuckets(
    'accounting_vendor_bill_lines',
    'bill_id',
    postedBillIds,
    billHeaders
  );

  for (const id of postedBillIds) {
    const buckets = billBuckets.get(id) || [];
    for (const b of buckets) {
      if (Math.abs(b.net) < 0.004 && Math.abs(b.tax) < 0.004) continue;
      const master = pickTaxMaster(masters, 'purchase', b.rate);
      bump(purchaseMap, master, b.rate, b.net, b.tax, 'Purchase Tax');
    }
  }

  // --- Purchases: vendor refunds (reduce) ---
  // Refunds currently post as documents without JE in all environments;
  // include status=posted and prefer JE gate when entries exist.
  let refQ = supabase
    .from('accounting_vendor_refunds')
    .select(
      'id, refund_date, untaxed_amount, tax_amount, status, organization_id'
    )
    .eq('status', 'posted')
    .gte('refund_date', opts.dateFrom)
    .lte('refund_date', opts.dateTo);
  if (opts.organizationId) {
    refQ = refQ.eq('organization_id', opts.organizationId);
  }
  const { data: refunds, error: refErr } = await refQ.limit(4000);
  if (refErr && !/relation|does not exist|column/i.test(refErr.message)) {
    throw new Error(refErr.message);
  }
  if (!refErr && refunds?.length) {
    if (refunds.length >= 4000) truncated = true;
    const refIds = refunds.map((r) => String(r.id));
    const refJe = await postedDocIds(
      opts.organizationId,
      'vendor_refund',
      refIds
    );
    const anyJe = refJe.size > 0;
    for (const ref of refunds) {
      const id = String(ref.id);
      if (anyJe && !refJe.has(id)) continue;
      const untaxed = round2(Number(ref.untaxed_amount) || 0);
      const tax = round2(Number(ref.tax_amount) || 0);
      if (Math.abs(untaxed) < 0.004 && Math.abs(tax) < 0.004) continue;
      const rateHint =
        untaxed > 0.004 ? round2((tax / untaxed) * 100) : null;
      const master = pickTaxMaster(masters, 'purchase', rateHint);
      bump(
        purchaseMap,
        master,
        rateHint ?? master?.rate_value ?? 0,
        -untaxed,
        -tax,
        'Purchase Tax'
      );
    }
  }

  const toSection = (
    id: 'sales' | 'purchases',
    label: string,
    map: Map<string, TaxReportLine>
  ): TaxReportSection => {
    const lines = [...map.values()]
      .filter((l) => Math.abs(l.net) > 0.004 || Math.abs(l.tax) > 0.004)
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      id,
      label,
      lines,
      totalNet: round2(lines.reduce((s, l) => s + l.net, 0)),
      totalTax: round2(lines.reduce((s, l) => s + l.tax, 0)),
    };
  };

  const sections: TaxReportSection[] = [
    toSection('sales', 'Sales', salesMap),
    toSection('purchases', 'Purchases', purchaseMap),
  ];

  const totalNet = round2(sections.reduce((s, sec) => s + sec.totalNet, 0));
  const totalTax = round2(sections.reduce((s, sec) => s + sec.totalTax, 0));

  return {
    kind: 'tax_report',
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    sections,
    totalNet,
    totalTax,
    truncated,
  };
}
