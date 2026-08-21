/**
 * Shared AR/AP aging engine (Phase 3).
 *
 * Outstanding as-of is derived from posted source documents + payments
 * through the as-of date, and only includes documents with a posted journal entry.
 * Aging uses canonical document due_date (payment terms).
 */

import { createAdminClient } from '@/utils/supabase/server';
import { appliedPaymentAmount } from '@/lib/accounting-payments';
import { round2 } from '@/lib/accounting/financial-reporting/types';
import {
  DEFAULT_AGING_BUCKETS,
  resolveAgingBucket,
  type AgingBucketDef,
  type AgingBucketId,
} from '@/lib/accounting/financial-reporting/aging-buckets';

export type AgingSide = 'receivable' | 'payable';
export type {
  AgingBucketId,
  AgingBucketDef,
} from '@/lib/accounting/financial-reporting/aging-buckets';
export {
  DEFAULT_AGING_BUCKETS,
  daysBetween,
  resolveAgingBucket,
} from '@/lib/accounting/financial-reporting/aging-buckets';

export type AgingLine = {
  key: string;
  document_id: string;
  reference: string;
  partner_key: string;
  contact_id: string | null;
  partner_name: string;
  document_date: string;
  due_date: string;
  outstanding: number;
  days_overdue: number;
  bucket: AgingBucketId;
  amounts: Record<AgingBucketId, number>;
  currency: string;
  journal_entry_id: string | null;
};

export type AgingPartner = {
  partner_key: string;
  contact_id: string | null;
  partner_name: string;
  amounts: Record<AgingBucketId, number>;
  total: number;
  lines: AgingLine[];
};

export type AgingReport = {
  kind: 'aged_receivable' | 'aged_payable';
  side: AgingSide;
  asOf: string;
  organizationId: string | null;
  currency: string;
  bucketDays: number;
  buckets: AgingBucketDef[];
  partners: AgingPartner[];
  totals: Record<AgingBucketId, number>;
  grandTotal: number;
};

function emptyAmounts(buckets: AgingBucketDef[]): Record<AgingBucketId, number> {
  const o = {} as Record<AgingBucketId, number>;
  for (const b of buckets) o[b.id] = 0;
  return o;
}

type DocRow = {
  id: string;
  number: string;
  partner_name: string;
  contact_id: string | null;
  document_date: string;
  due_date: string | null;
  total_amount: number;
  status: string;
  journal_entry_id: string | null;
  currency: string | null;
};

type PayRow = {
  document_id: string;
  amount: number;
  payment_date: string;
  reconcile_status?: string | null;
  amount_reconciled?: number | null;
};

async function loadPostedSourceIds(
  organizationId: string | null,
  sourceType: string,
  sourceIds: string[]
): Promise<Set<string>> {
  const posted = new Set<string>();
  if (!sourceIds.length) return posted;
  const supabase = await createAdminClient();
  for (let i = 0; i < sourceIds.length; i += 200) {
    const chunk = sourceIds.slice(i, i + 200);
    let q = supabase
      .from('accounting_journal_entries')
      .select('source_id')
      .eq('status', 'posted')
      .eq('source_type', sourceType)
      .in('source_id', chunk);
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data } = await q;
    for (const r of data || []) {
      if (r.source_id) posted.add(String(r.source_id));
    }
  }
  return posted;
}

async function loadReceivableDocuments(
  organizationId: string | null
): Promise<{ docs: DocRow[]; payments: PayRow[] }> {
  const supabase = await createAdminClient();
  let q = supabase
    .from('accounting_customer_invoices')
    .select(
      'id, invoice_number, customer_name, contact_id, invoice_date, due_date, total_amount, status, journal_entry_id, organization_id'
    )
    .in('status', ['posted', 'paid']);
  if (organizationId) q = q.eq('organization_id', organizationId);

  const { data, error } = await q.limit(8000);
  if (error) throw new Error(error.message);

  const docs: DocRow[] = (data || []).map((r) => ({
    id: String(r.id),
    number: String(r.invoice_number || ''),
    partner_name: String(r.customer_name || 'Unknown'),
    contact_id: r.contact_id ? String(r.contact_id) : null,
    document_date: String(r.invoice_date || '').slice(0, 10),
    due_date: r.due_date ? String(r.due_date).slice(0, 10) : null,
    total_amount: Number(r.total_amount) || 0,
    status: String(r.status || ''),
    journal_entry_id: r.journal_entry_id ? String(r.journal_entry_id) : null,
    currency: null,
  }));

  const payments: PayRow[] = [];
  const ids = docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: pays, error: payErr } = await supabase
      .from('accounting_invoice_payments')
      .select('invoice_id, amount, payment_date, reconcile_status, amount_reconciled')
      .in('invoice_id', chunk);
    const payRows =
      payErr && /reconcile_status|amount_reconciled|column/i.test(payErr.message)
        ? (
            await supabase
              .from('accounting_invoice_payments')
              .select('invoice_id, amount, payment_date')
              .in('invoice_id', chunk)
          ).data
        : pays;
    for (const p of payRows || []) {
      payments.push({
        document_id: String(p.invoice_id),
        amount: Number(p.amount) || 0,
        payment_date: String(p.payment_date || '').slice(0, 10),
        reconcile_status:
          'reconcile_status' in p && p.reconcile_status
            ? String(p.reconcile_status)
            : null,
        amount_reconciled:
          'amount_reconciled' in p && p.amount_reconciled != null
            ? Number(p.amount_reconciled)
            : null,
      });
    }
  }
  return { docs, payments };
}

async function loadPayableDocuments(
  organizationId: string | null
): Promise<{ docs: DocRow[]; payments: PayRow[] }> {
  const supabase = await createAdminClient();
  let q = supabase
    .from('accounting_vendor_bills')
    .select(
      'id, bill_number, vendor_name, contact_id, bill_date, due_date, total_amount, status, journal_entry_id, organization_id'
    )
    .in('status', ['posted', 'paid']);
  if (organizationId) q = q.eq('organization_id', organizationId);

  const { data, error } = await q.limit(8000);
  if (error) throw new Error(error.message);

  const docs: DocRow[] = (data || []).map((r) => ({
    id: String(r.id),
    number: String(r.bill_number || ''),
    partner_name: String(r.vendor_name || 'Unknown'),
    contact_id: r.contact_id ? String(r.contact_id) : null,
    document_date: String(r.bill_date || '').slice(0, 10),
    due_date: r.due_date ? String(r.due_date).slice(0, 10) : null,
    total_amount: Number(r.total_amount) || 0,
    status: String(r.status || ''),
    journal_entry_id: r.journal_entry_id ? String(r.journal_entry_id) : null,
    currency: null,
  }));

  const payments: PayRow[] = [];
  const ids = docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: pays } = await supabase
      .from('accounting_vendor_payments')
      .select('bill_id, amount, payment_date')
      .in('bill_id', chunk);
    for (const p of pays || []) {
      payments.push({
        document_id: String(p.bill_id),
        amount: Number(p.amount) || 0,
        payment_date: String(p.payment_date || '').slice(0, 10),
      });
    }
  }
  return { docs, payments };
}

async function loadDocumentAdjustments(opts: {
  table: 'accounting_credit_notes' | 'accounting_vendor_refunds';
  documentColumn: 'invoice_id' | 'bill_id';
  dateColumn: 'credit_note_date' | 'refund_date';
  documentIds: string[];
  organizationId: string | null;
  asOf: string;
}): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!opts.documentIds.length) return map;
  const supabase = await createAdminClient();
  for (let i = 0; i < opts.documentIds.length; i += 200) {
    const chunk = opts.documentIds.slice(i, i + 200);
    let q = supabase
      .from(opts.table)
      .select(`${opts.documentColumn}, total_amount, ${opts.dateColumn}, status`)
      .eq('status', 'posted')
      .in(opts.documentColumn, chunk)
      .lte(opts.dateColumn, opts.asOf);
    if (opts.organizationId) q = q.eq('organization_id', opts.organizationId);
    const { data, error } = await q;
    if (error) {
      if (/relation|schema cache|column/i.test(error.message)) continue;
      throw new Error(error.message);
    }
    for (const r of data || []) {
      const row = r as Record<string, unknown>;
      const id = row[opts.documentColumn]
        ? String(row[opts.documentColumn])
        : '';
      if (!id) continue;
      map.set(id, round2((map.get(id) || 0) + (Number(row.total_amount) || 0)));
    }
  }
  return map;
}

/**
 * Build Aged Receivable or Aged Payable as of a date.
 */
export async function buildAgingReport(opts: {
  side: AgingSide;
  organizationId: string | null;
  asOf: string;
  currency?: string;
  bucketDays?: number;
  search?: string | null;
}): Promise<AgingReport> {
  const asOf = String(opts.asOf).slice(0, 10);
  const buckets = DEFAULT_AGING_BUCKETS;
  const bucketDays = opts.bucketDays || 30;

  const { docs, payments } =
    opts.side === 'receivable'
      ? await loadReceivableDocuments(opts.organizationId)
      : await loadPayableDocuments(opts.organizationId);

  const sourceType =
    opts.side === 'receivable' ? 'customer_invoice' : 'vendor_bill';
  const postedIds = await loadPostedSourceIds(
    opts.organizationId,
    sourceType,
    docs.map((d) => d.id)
  );

  const paidByDoc = new Map<string, number>();
  for (const p of payments) {
    if (!p.payment_date || p.payment_date > asOf) continue;
    paidByDoc.set(
      p.document_id,
      round2(
        (paidByDoc.get(p.document_id) || 0) +
          appliedPaymentAmount({
            amount: p.amount,
            reconcile_status: p.reconcile_status,
            amount_reconciled: p.amount_reconciled,
          })
      )
    );
  }

  const adjustments =
    opts.side === 'receivable'
      ? await loadDocumentAdjustments({
          table: 'accounting_credit_notes',
          documentColumn: 'invoice_id',
          dateColumn: 'credit_note_date',
          documentIds: docs.map((d) => d.id),
          organizationId: opts.organizationId,
          asOf,
        })
      : await loadDocumentAdjustments({
          table: 'accounting_vendor_refunds',
          documentColumn: 'bill_id',
          dateColumn: 'refund_date',
          documentIds: docs.map((d) => d.id),
          organizationId: opts.organizationId,
          asOf,
        });

  const search = String(opts.search || '')
    .trim()
    .toLowerCase();
  const lines: AgingLine[] = [];

  for (const doc of docs) {
    if (!doc.document_date || doc.document_date > asOf) continue;
    // Must have a posted journal entry for this document
    if (!postedIds.has(doc.id)) continue;

    const paid = paidByDoc.get(doc.id) || 0;
    const adjusted = adjustments.get(doc.id) || 0;
    const outstanding = round2(Math.max(0, doc.total_amount - paid - adjusted));
    if (outstanding <= 0.004) continue;

    const dueDate = (doc.due_date || doc.document_date).slice(0, 10);
    const { bucket, daysOverdue } = resolveAgingBucket(dueDate, asOf, buckets);

    const partnerKey =
      doc.contact_id || `name:${doc.partner_name.toLowerCase()}`;
    if (search) {
      const hay = `${doc.partner_name} ${doc.number}`.toLowerCase();
      if (!hay.includes(search)) continue;
    }

    const amounts = emptyAmounts(buckets);
    amounts[bucket] = outstanding;

    lines.push({
      key: `${opts.side}:${doc.id}`,
      document_id: doc.id,
      reference: doc.number,
      partner_key: partnerKey,
      contact_id: doc.contact_id,
      partner_name: doc.partner_name,
      document_date: doc.document_date,
      due_date: dueDate,
      outstanding,
      days_overdue: daysOverdue,
      bucket,
      amounts,
      currency: doc.currency || opts.currency || 'PKR',
      journal_entry_id: doc.journal_entry_id,
    });
  }

  const byPartner = new Map<string, AgingLine[]>();
  for (const line of lines) {
    const list = byPartner.get(line.partner_key) || [];
    list.push(line);
    byPartner.set(line.partner_key, list);
  }

  const partners: AgingPartner[] = [];
  const totals = emptyAmounts(buckets);

  for (const [partnerKey, partnerLines] of [...byPartner.entries()].sort(
    (a, b) =>
      (a[1][0]?.partner_name || '').localeCompare(b[1][0]?.partner_name || '')
  )) {
    const amounts = emptyAmounts(buckets);
    let total = 0;
    const sorted = partnerLines.slice().sort((a, b) =>
      a.document_date.localeCompare(b.document_date)
    );
    for (const line of sorted) {
      for (const b of buckets) {
        amounts[b.id] = round2(amounts[b.id] + line.amounts[b.id]);
        totals[b.id] = round2(totals[b.id] + line.amounts[b.id]);
      }
      total = round2(total + line.outstanding);
    }
    partners.push({
      partner_key: partnerKey,
      contact_id: sorted[0]?.contact_id || null,
      partner_name: sorted[0]?.partner_name || 'Unknown',
      amounts,
      total,
      lines: sorted,
    });
  }

  const grandTotal = round2(
    buckets.reduce((s, b) => s + totals[b.id], 0)
  );

  return {
    kind: opts.side === 'receivable' ? 'aged_receivable' : 'aged_payable',
    side: opts.side,
    asOf,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    bucketDays,
    buckets,
    partners,
    totals,
    grandTotal,
  };
}

export async function buildAgedReceivable(opts: {
  organizationId: string | null;
  asOf: string;
  currency?: string;
  search?: string | null;
}) {
  return buildAgingReport({ ...opts, side: 'receivable' });
}

export async function buildAgedPayable(opts: {
  organizationId: string | null;
  asOf: string;
  currency?: string;
  search?: string | null;
}) {
  return buildAgingReport({ ...opts, side: 'payable' });
}
