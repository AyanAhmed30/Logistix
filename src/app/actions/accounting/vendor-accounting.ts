'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { computePaymentState } from '@/lib/accounting-payments';
import { resolveVendorAccountingScope } from '@/lib/accounting-vendor-scope';

export type VendorBalanceSummary = {
  contact_id: string;
  vendor_name: string;
  vendor_lead_id: string | null;
  organization_id: string | null;
  organization_name: string | null;
  current_balance: number;
  outstanding_balance: number;
  paid_amount: number;
  credit_balance: number;
  bill_total: number;
  payment_total: number;
  refund_total: number;
  outstanding_count: number;
  paid_count: number;
  overdue_count: number;
};

export type VendorLedgerEntry = {
  id: string;
  date: string;
  reference: string;
  bill_number: string | null;
  payment_reference: string | null;
  debit: number;
  credit: number;
  balance: number;
  status: string;
  type: 'bill' | 'payment' | 'refund';
  document_id: string;
};

export type VendorTimelineEvent = {
  id: string;
  at: string;
  action: string;
  label: string;
  user: string | null;
  organization: string | null;
  meta?: Record<string, unknown>;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function getVendorAccountingBalance(contactId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, lead_id_formatted, organization_id')
      .eq('id', contactId)
      .maybeSingle();
    if (!contact) return { error: 'Vendor not found' };

    let billQ = supabase
      .from('accounting_vendor_bills')
      .select('*')
      .eq('contact_id', contactId)
      .neq('status', 'cancelled');
    if (scope.organizationId && !scope.isGlobalAdminView) {
      billQ = billQ.eq('organization_id', scope.organizationId);
    }
    const { data: bills, error } = await billQ;
    if (error) {
      if (/accounting_vendor_bills|relation/i.test(error.message)) {
        return {
          balance: {
            contact_id: contactId,
            vendor_name: String(contact.name || ''),
            vendor_lead_id: contact.lead_id_formatted
              ? String(contact.lead_id_formatted)
              : null,
            organization_id: contact.organization_id
              ? String(contact.organization_id)
              : null,
            organization_name: null,
            current_balance: 0,
            outstanding_balance: 0,
            paid_amount: 0,
            credit_balance: 0,
            bill_total: 0,
            payment_total: 0,
            refund_total: 0,
            outstanding_count: 0,
            paid_count: 0,
            overdue_count: 0,
          } satisfies VendorBalanceSummary,
        };
      }
      return { error: error.message };
    }

    const billRows = bills || [];
    const billIds = billRows.map((b) => String(b.id));

    let paymentTotal = 0;
    if (billIds.length) {
      const { data: pays } = await supabase
        .from('accounting_vendor_payments')
        .select('amount')
        .in('bill_id', billIds);
      paymentTotal = round2(
        (pays || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
      );
    }

    let refundQ = supabase
      .from('accounting_vendor_refunds')
      .select('total_amount, amount_refunded, status')
      .eq('contact_id', contactId)
      .eq('status', 'posted');
    if (scope.organizationId && !scope.isGlobalAdminView) {
      refundQ = refundQ.eq('organization_id', scope.organizationId);
    }
    const { data: refunds } = await refundQ;
    const refundTotal = round2(
      (refunds || []).reduce(
        (s, r) => s + (Number(r.amount_refunded || r.total_amount) || 0),
        0
      )
    );

    let billTotal = 0;
    let outstanding = 0;
    let paidAmount = 0;
    let outstandingCount = 0;
    let paidCount = 0;
    let overdueCount = 0;

    for (const b of billRows) {
      const total = Number(b.total_amount) || 0;
      billTotal += total;
      const paid = Number(b.amount_paid) || 0;
      paidAmount += paid;
      const state = computePaymentState({
        total,
        amountPaid: paid,
        dueDate: b.due_date ? String(b.due_date) : null,
        workflowStatus: String(b.status || ''),
      });
      outstanding += state.outstanding;
      if (state.paymentState === 'paid' || b.status === 'paid') paidCount += 1;
      else if (state.outstanding > 0.004) {
        outstandingCount += 1;
        if (state.paymentState === 'overdue') overdueCount += 1;
      }
    }

    billTotal = round2(billTotal);
    outstanding = round2(outstanding);
    paidAmount = round2(paidAmount);

    let organization_name: string | null = null;
    if (contact.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('organization_name')
        .eq('id', contact.organization_id)
        .maybeSingle();
      organization_name = org?.organization_name
        ? String(org.organization_name)
        : null;
    }

    const balance: VendorBalanceSummary = {
      contact_id: contactId,
      vendor_name: String(contact.name || ''),
      vendor_lead_id: contact.lead_id_formatted
        ? String(contact.lead_id_formatted)
        : null,
      organization_id: contact.organization_id
        ? String(contact.organization_id)
        : null,
      organization_name,
      current_balance: round2(outstanding - refundTotal),
      outstanding_balance: outstanding,
      paid_amount: paidAmount || paymentTotal,
      credit_balance: refundTotal,
      bill_total: billTotal,
      payment_total: paymentTotal,
      refund_total: refundTotal,
      outstanding_count: outstandingCount,
      paid_count: paidCount,
      overdue_count: overdueCount,
    };

    return { balance };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load balance',
    };
  }
}

export async function getVendorLedger(contactId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let billQ = supabase
      .from('accounting_vendor_bills')
      .select('id, bill_number, bill_date, total_amount, status, amount_paid')
      .eq('contact_id', contactId)
      .neq('status', 'cancelled');
    if (scope.organizationId && !scope.isGlobalAdminView) {
      billQ = billQ.eq('organization_id', scope.organizationId);
    }
    const { data: bills, error } = await billQ;
    if (error) {
      if (/accounting_vendor_bills|relation/i.test(error.message)) {
        return { entries: [] as VendorLedgerEntry[] };
      }
      return { error: error.message };
    }

    const billRows = bills || [];
    const billIds = billRows.map((b) => String(b.id));
    const events: Omit<VendorLedgerEntry, 'balance'>[] = [];

    for (const b of billRows) {
      events.push({
        id: `bill-${b.id}`,
        date: String(b.bill_date || ''),
        reference: String(b.bill_number || ''),
        bill_number: String(b.bill_number || ''),
        payment_reference: null,
        debit: Number(b.total_amount) || 0,
        credit: 0,
        status: String(b.status || ''),
        type: 'bill',
        document_id: String(b.id),
      });
    }

    if (billIds.length) {
      const { data: pays } = await supabase
        .from('accounting_vendor_payments')
        .select('id, bill_id, payment_date, amount, reference')
        .in('bill_id', billIds);
      const billNum = new Map(
        billRows.map((b) => [String(b.id), String(b.bill_number || '')])
      );
      for (const p of pays || []) {
        events.push({
          id: `pay-${p.id}`,
          date: String(p.payment_date || ''),
          reference: p.reference ? String(p.reference) : `Payment`,
          bill_number: billNum.get(String(p.bill_id)) || null,
          payment_reference: p.reference ? String(p.reference) : null,
          debit: 0,
          credit: Number(p.amount) || 0,
          status: 'posted',
          type: 'payment',
          document_id: String(p.id),
        });
      }
    }

    let refundQ = supabase
      .from('accounting_vendor_refunds')
      .select(
        'id, refund_number, refund_date, total_amount, amount_refunded, status, bill_number'
      )
      .eq('contact_id', contactId)
      .eq('status', 'posted');
    if (scope.organizationId && !scope.isGlobalAdminView) {
      refundQ = refundQ.eq('organization_id', scope.organizationId);
    }
    const { data: refunds } = await refundQ;
    for (const r of refunds || []) {
      events.push({
        id: `ref-${r.id}`,
        date: String(r.refund_date || ''),
        reference: String(r.refund_number || ''),
        bill_number: r.bill_number ? String(r.bill_number) : null,
        payment_reference: null,
        debit: 0,
        credit: Number(r.amount_refunded || r.total_amount) || 0,
        status: String(r.status || ''),
        type: 'refund',
        document_id: String(r.id),
      });
    }

    events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let running = 0;
    const entries: VendorLedgerEntry[] = events.map((e) => {
      running = round2(running + e.debit - e.credit);
      return { ...e, balance: running };
    });

    return { entries };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load ledger',
    };
  }
}

export async function getVendorStatement(contactId: string) {
  const balance = await getVendorAccountingBalance(contactId);
  if ('error' in balance && balance.error) return { error: balance.error };
  const ledger = await getVendorLedger(contactId);
  if ('error' in ledger && ledger.error) return { error: ledger.error };
  return {
    balance: balance.balance!,
    entries: ledger.entries ?? [],
  };
}

export async function getVendorAccountingTimeline(contactId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let billQ = supabase
      .from('accounting_vendor_bills')
      .select('id')
      .eq('contact_id', contactId);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      billQ = billQ.eq('organization_id', scope.organizationId);
    }
    const { data: bills } = await billQ;
    const billIds = (bills || []).map((b) => String(b.id));
    if (!billIds.length) return { events: [] as VendorTimelineEvent[] };

    const { data: logs } = await supabase
      .from('accounting_vendor_bill_logs')
      .select('*')
      .in('bill_id', billIds)
      .order('performed_at', { ascending: false })
      .limit(100);

    const events: VendorTimelineEvent[] = (logs || []).map((l) => ({
      id: String(l.id),
      at: String(l.performed_at || ''),
      action: String(l.action || ''),
      label: String(l.action || '').replace(/_/g, ' '),
      user: l.performed_by ? String(l.performed_by) : null,
      organization: null,
      meta: (l.details as Record<string, unknown>) || {},
    }));

    return { events };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load timeline',
    };
  }
}

export async function getVendorTransactionHistory(contactId: string) {
  return getVendorLedger(contactId);
}
