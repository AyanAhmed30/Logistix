'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import { computePaymentState } from '@/lib/accounting-payments';

export type CustomerBalanceSummary = {
  contact_id: string;
  customer_name: string;
  customer_lead_id: string | null;
  organization_id: string | null;
  organization_name: string | null;
  current_balance: number;
  outstanding_balance: number;
  paid_amount: number;
  credit_balance: number;
  invoice_total: number;
  payment_total: number;
  credit_note_total: number;
  refund_total: number;
  outstanding_count: number;
  paid_count: number;
  overdue_count: number;
};

export type CustomerLedgerEntry = {
  id: string;
  date: string;
  reference: string;
  invoice_number: string | null;
  payment_reference: string | null;
  debit: number;
  credit: number;
  balance: number;
  status: string;
  type: 'invoice' | 'payment' | 'credit_note' | 'refund';
  document_id: string;
};

export type CustomerTimelineEvent = {
  id: string;
  at: string;
  action: string;
  label: string;
  user: string | null;
  organization: string | null;
  meta?: Record<string, unknown>;
};

async function resolveScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session || !sessionHasAccountingAccess(session)) {
    return { error: 'Unauthorized' as const };
  }

  if (!sessionUsesOrganizationScope(session.role)) {
    return { session, organizationId: null as string | null, isGlobalAdminView: false };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return {
        session,
        organizationId: null as string | null,
        isGlobalAdminView: false,
        empty: true as const,
      };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return { session: scope.session, organizationId: null, isGlobalAdminView: true };
  }

  if (!scope.organizationId) {
    return { error: 'Select an organization from the header switcher.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function getCustomerAccountingBalance(contactId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let contactQuery = supabase
      .from('contacts')
      .select('id, name, lead_id_formatted, organization_id')
      .eq('id', contactId);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      contactQuery = contactQuery.eq('organization_id', scope.organizationId);
    }
    const { data: contact, error: cErr } = await contactQuery.maybeSingle();
    if (cErr || !contact) return { error: cErr?.message || 'Customer not found' };

    let invQuery = supabase
      .from('accounting_customer_invoices')
      .select(
        'id, status, payment_state, total_amount, amount_paid, amount_residual, due_date, organization_id'
      )
      .eq('contact_id', contactId)
      .in('status', ['posted', 'paid']);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      invQuery = invQuery.eq('organization_id', scope.organizationId);
    }

    let cnQuery = supabase
      .from('accounting_credit_notes')
      .select('id, total_amount, amount_refunded, status')
      .eq('contact_id', contactId)
      .eq('status', 'posted');
    if (scope.organizationId && !scope.isGlobalAdminView) {
      cnQuery = cnQuery.eq('organization_id', scope.organizationId);
    }

    let refundQuery = supabase
      .from('accounting_refunds')
      .select('amount')
      .eq('contact_id', contactId);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      refundQuery = refundQuery.eq('organization_id', scope.organizationId);
    }

    const orgId =
      (contact.organization_id
        ? String(contact.organization_id)
        : scope.organizationId) ?? null;

    const [invRes, cnRes, refundRes, orgRes] = await Promise.all([
      invQuery,
      cnQuery,
      refundQuery,
      orgId
        ? supabase
            .from('organizations')
            .select('organization_name')
            .eq('id', orgId)
            .maybeSingle()
        : Promise.resolve({ data: null as { organization_name?: string } | null }),
    ]);

    const invRows = invRes.data || [];
    const invIds = invRows.map((i) => String(i.id));

    let paymentTotal = 0;
    if (invIds.length) {
      const { data: pays } = await supabase
        .from('accounting_invoice_payments')
        .select('amount, invoice_id')
        .in('invoice_id', invIds);
      paymentTotal = round2(
        (pays || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
      );
    }

    const cnRows = cnRes.data || [];
    const creditNoteTotal = round2(
      cnRows.reduce((acc, c) => acc + (Number(c.total_amount) || 0), 0)
    );
    const refundTotal = round2(
      (refundRes.data || []).reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
    );

    const invoiceTotal = round2(
      invRows.reduce((acc, i) => acc + (Number(i.total_amount) || 0), 0)
    );

    let outstanding = 0;
    let outstandingCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    for (const inv of invRows) {
      const computed = computePaymentState({
        total: Number(inv.total_amount) || 0,
        amountPaid: Number(inv.amount_paid) || 0,
        dueDate: inv.due_date ? String(inv.due_date) : null,
        workflowStatus: String(inv.status || ''),
      });
      if (computed.outstanding > 0.004) {
        outstanding += computed.outstanding;
        outstandingCount += 1;
        if (computed.paymentState === 'overdue') overdueCount += 1;
      } else {
        paidCount += 1;
      }
    }
    outstanding = round2(outstanding);

    const unappliedCredit = round2(
      Math.max(
        0,
        creditNoteTotal -
          cnRows.reduce((acc, c) => acc + (Number(c.amount_refunded) || 0), 0)
      )
    );

    const currentBalance = round2(outstanding - unappliedCredit);
    const paidAmount = paymentTotal;
    const organization_name = orgRes.data?.organization_name
      ? String(orgRes.data.organization_name)
      : null;

    const balance: CustomerBalanceSummary = {
      contact_id: String(contact.id),
      customer_name: String(contact.name || ''),
      customer_lead_id: contact.lead_id_formatted
        ? String(contact.lead_id_formatted)
        : null,
      organization_id: orgId,
      organization_name,
      current_balance: currentBalance,
      outstanding_balance: outstanding,
      paid_amount: paidAmount,
      credit_balance: unappliedCredit,
      invoice_total: invoiceTotal,
      payment_total: paymentTotal,
      credit_note_total: creditNoteTotal,
      refund_total: refundTotal,
      outstanding_count: outstandingCount,
      paid_count: paidCount,
      overdue_count: overdueCount,
    };

    return { balance };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load customer balance',
    };
  }
}

export async function getCustomerLedger(
  contactId: string,
  filters: {
    search?: string;
    page?: number;
    pageSize?: number;
    sortDir?: 'asc' | 'desc';
  } = {}
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const ascending = filters.sortDir === 'asc';

    let invQuery = supabase
      .from('accounting_customer_invoices')
      .select(
        'id, invoice_number, invoice_date, status, payment_state, total_amount, organization_id'
      )
      .eq('contact_id', contactId)
      .in('status', ['posted', 'paid', 'cancelled']);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      invQuery = invQuery.eq('organization_id', scope.organizationId);
    }
    const { data: invoices } = await invQuery;

    const invRows = invoices || [];
    const invIds = invRows.map((i) => String(i.id));
    const invMap = new Map(invRows.map((i) => [String(i.id), i]));

    type Raw = {
      id: string;
      date: string;
      reference: string;
      invoice_number: string | null;
      payment_reference: string | null;
      debit: number;
      credit: number;
      status: string;
      type: CustomerLedgerEntry['type'];
      document_id: string;
      sortAt: string;
    };

    const raw: Raw[] = [];

    for (const inv of invRows) {
      if (String(inv.status) === 'cancelled') continue;
      raw.push({
        id: `inv-${inv.id}`,
        date: String(inv.invoice_date || ''),
        reference: String(inv.invoice_number || ''),
        invoice_number: String(inv.invoice_number || ''),
        payment_reference: null,
        debit: Number(inv.total_amount) || 0,
        credit: 0,
        status: String(inv.payment_state || inv.status || ''),
        type: 'invoice',
        document_id: String(inv.id),
        sortAt: String(inv.invoice_date || ''),
      });
    }

    if (invIds.length) {
      const { data: pays } = await supabase
        .from('accounting_invoice_payments')
        .select('*')
        .in('invoice_id', invIds);
      for (const p of pays || []) {
        const inv = invMap.get(String(p.invoice_id));
        raw.push({
          id: `pay-${p.id}`,
          date: String(p.payment_date || ''),
          reference: String(p.reference || inv?.invoice_number || 'Payment'),
          invoice_number: inv?.invoice_number ? String(inv.invoice_number) : null,
          payment_reference: p.reference ? String(p.reference) : String(p.id).slice(0, 8),
          debit: 0,
          credit: Number(p.amount) || 0,
          status: 'paid',
          type: 'payment',
          document_id: String(p.id),
          sortAt: `${p.payment_date || ''}T${p.created_at || ''}`,
        });
      }
    }

    let cnQuery = supabase
      .from('accounting_credit_notes')
      .select('*')
      .eq('contact_id', contactId)
      .eq('status', 'posted');
    if (scope.organizationId && !scope.isGlobalAdminView) {
      cnQuery = cnQuery.eq('organization_id', scope.organizationId);
    }
    const { data: cns } = await cnQuery;
    for (const cn of cns || []) {
      raw.push({
        id: `cn-${cn.id}`,
        date: String(cn.credit_note_date || ''),
        reference: String(cn.credit_note_number || ''),
        invoice_number: cn.invoice_number ? String(cn.invoice_number) : null,
        payment_reference: null,
        debit: 0,
        credit: Number(cn.total_amount) || 0,
        status: 'posted',
        type: 'credit_note',
        document_id: String(cn.id),
        sortAt: String(cn.credit_note_date || ''),
      });
    }

    let rfQuery = supabase
      .from('accounting_refunds')
      .select('*')
      .eq('contact_id', contactId);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      rfQuery = rfQuery.eq('organization_id', scope.organizationId);
    }
    const { data: refunds } = await rfQuery;
    for (const rf of refunds || []) {
      raw.push({
        id: `rf-${rf.id}`,
        date: String(rf.refund_date || ''),
        reference: String(rf.reference || 'Refund'),
        invoice_number: null,
        payment_reference: rf.reference ? String(rf.reference) : null,
        debit: Number(rf.amount) || 0,
        credit: 0,
        status: String(rf.refund_type || 'refund'),
        type: 'refund',
        document_id: String(rf.id),
        sortAt: String(rf.refund_date || ''),
      });
    }

    raw.sort((a, b) => {
      const cmp = a.sortAt.localeCompare(b.sortAt);
      return ascending ? cmp : -cmp;
    });

    // Running balance always chronologically ascending
    const chrono = [...raw].sort((a, b) => a.sortAt.localeCompare(b.sortAt));
    let running = 0;
    const balanceById = new Map<string, number>();
    for (const row of chrono) {
      running = round2(running + row.debit - row.credit);
      balanceById.set(row.id, running);
    }

    let filtered = raw;
    const needle = String(filters.search || '').trim().toLowerCase();
    if (needle) {
      filtered = raw.filter((r) =>
        [r.reference, r.invoice_number, r.payment_reference, r.status, r.type]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      );
    }

    const total = filtered.length;
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
    const entries: CustomerLedgerEntry[] = slice.map((r) => ({
      id: r.id,
      date: r.date,
      reference: r.reference,
      invoice_number: r.invoice_number,
      payment_reference: r.payment_reference,
      debit: r.debit,
      credit: r.credit,
      balance: balanceById.get(r.id) ?? 0,
      status: r.status,
      type: r.type,
      document_id: r.document_id,
    }));

    return { entries, total, page, pageSize, closing_balance: running };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load ledger',
    };
  }
}

export async function getCustomerStatement(contactId: string) {
  try {
    const balanceRes = await getCustomerAccountingBalance(contactId);
    if ('error' in balanceRes && balanceRes.error) return { error: balanceRes.error };
    const ledgerRes = await getCustomerLedger(contactId, {
      page: 1,
      pageSize: 500,
      sortDir: 'asc',
    });
    if ('error' in ledgerRes && ledgerRes.error) return { error: ledgerRes.error };

    const bal = balanceRes.balance!;
    return {
      statement: {
        ...bal,
        opening_balance: 0,
        closing_balance: ledgerRes.closing_balance ?? bal.current_balance,
        generated_at: new Date().toISOString(),
        entries: ledgerRes.entries ?? [],
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load statement',
    };
  }
}

export async function getCustomerAccountingInvoices(
  contactId: string,
  filter: 'outstanding' | 'paid' | 'overdue' | 'all' = 'all'
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let query = supabase
      .from('accounting_customer_invoices')
      .select(
        'id, invoice_number, customer_name, customer_lead_id, invoice_date, due_date, status, payment_state, total_amount, amount_paid, amount_residual, organization_id'
      )
      .eq('contact_id', contactId)
      .in('status', ['posted', 'paid']);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }
    query = query.order('invoice_date', { ascending: false });

    const { data, error } = await query;
    if (error) return { error: error.message };

    const rows = (data || []).map((r) => {
      const computed = computePaymentState({
        total: Number(r.total_amount) || 0,
        amountPaid: Number(r.amount_paid) || 0,
        dueDate: r.due_date ? String(r.due_date) : null,
        workflowStatus: String(r.status || ''),
      });
      return {
        id: String(r.id),
        invoice_number: String(r.invoice_number || ''),
        customer_name: String(r.customer_name || ''),
        customer_lead_id: r.customer_lead_id ? String(r.customer_lead_id) : null,
        invoice_date: String(r.invoice_date || ''),
        due_date: r.due_date ? String(r.due_date) : null,
        status: String(r.status || ''),
        payment_state: computed.paymentState,
        outstanding_amount: computed.outstanding,
        total_amount: Number(r.total_amount) || 0,
        amount_paid: computed.amountPaid,
        paid_date: computed.paymentState === 'paid' ? String(r.due_date || r.invoice_date || '') : null,
      };
    });

    let filtered = rows;
    if (filter === 'outstanding') {
      filtered = rows.filter((r) => r.outstanding_amount > 0.004);
    } else if (filter === 'paid') {
      filtered = rows.filter((r) => r.outstanding_amount <= 0.004);
    } else if (filter === 'overdue') {
      filtered = rows.filter((r) => r.payment_state === 'overdue');
    }

    return { invoices: filtered };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load invoices',
    };
  }
}

export async function getCustomerAccountingTimeline(contactId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const events: CustomerTimelineEvent[] = [];

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, created_at, created_by, organization_id')
      .eq('id', contactId)
      .maybeSingle();
    if (contact?.created_at) {
      events.push({
        id: `contact-${contact.id}`,
        at: String(contact.created_at),
        action: 'customer_created',
        label: 'Customer Created',
        user: contact.created_by ? String(contact.created_by) : null,
        organization: null,
      });
    }

    // CRM opportunities
    const { data: opps } = await supabase
      .from('crm_opportunities')
      .select('id, name, created_at, created_by')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(50);
    for (const o of opps || []) {
      events.push({
        id: `opp-${o.id}`,
        at: String(o.created_at),
        action: 'opportunity_created',
        label: `Opportunity Created${o.name ? `: ${o.name}` : ''}`,
        user: o.created_by ? String(o.created_by) : null,
        organization: null,
      });
    }

    // Quotations / SO
    let qQuery = supabase
      .from('quotations')
      .select('id, quotation_number, status, created_at, created_by, organization_id')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(50);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      qQuery = qQuery.eq('organization_id', scope.organizationId);
    }
    const { data: quotations } = await qQuery;
    for (const q of quotations || []) {
      const isSO = String(q.status) === 'sales_order';
      events.push({
        id: `q-${q.id}-${q.status}`,
        at: String(q.created_at),
        action: isSO ? 'sales_order_created' : 'quotation_created',
        label: isSO
          ? `Sales Order Created (${q.quotation_number || ''})`
          : `Quotation Created (${q.quotation_number || ''})`,
        user: q.created_by ? String(q.created_by) : null,
        organization: null,
      });
    }

    // Invoice logs + invoices
    let invQuery = supabase
      .from('accounting_customer_invoices')
      .select('id, invoice_number, created_at, created_by, status')
      .eq('contact_id', contactId);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      invQuery = invQuery.eq('organization_id', scope.organizationId);
    }
    const { data: invoices } = await invQuery;
    const invIds = (invoices || []).map((i) => String(i.id));
    for (const inv of invoices || []) {
      events.push({
        id: `inv-created-${inv.id}`,
        at: String(inv.created_at),
        action: 'invoice_created',
        label: `Invoice Created (${inv.invoice_number || ''})`,
        user: inv.created_by ? String(inv.created_by) : null,
        organization: null,
      });
    }

    if (invIds.length) {
      const { data: logs } = await supabase
        .from('accounting_invoice_logs')
        .select('*')
        .in('invoice_id', invIds)
        .order('performed_at', { ascending: true })
        .limit(200);
      for (const log of logs || []) {
        const action = String(log.action || '');
        let label = action.replace(/_/g, ' ');
        if (action === 'posted') label = 'Invoice Posted';
        if (action === 'payment_registered') {
          const amt = (log.details as { amount?: number })?.amount;
          label = `Payment Registered${amt != null ? ` (${amt})` : ''}`;
        }
        if (action === 'cancelled') label = 'Invoice Cancelled';
        events.push({
          id: `log-${log.id}`,
          at: String(log.performed_at),
          action,
          label,
          user: log.performed_by ? String(log.performed_by) : null,
          organization: null,
          meta: (log.details || {}) as Record<string, unknown>,
        });
      }
    }

    // Credit notes
    let cnQuery = supabase
      .from('accounting_credit_notes')
      .select('id, credit_note_number, status, created_at, created_by, posted_at')
      .eq('contact_id', contactId);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      cnQuery = cnQuery.eq('organization_id', scope.organizationId);
    }
    const { data: cns } = await cnQuery;
    for (const cn of cns || []) {
      events.push({
        id: `cn-${cn.id}`,
        at: String(cn.created_at),
        action: 'credit_note_created',
        label: `Credit Note Created (${cn.credit_note_number || ''})`,
        user: cn.created_by ? String(cn.created_by) : null,
        organization: null,
      });
      if (cn.posted_at) {
        events.push({
          id: `cn-posted-${cn.id}`,
          at: String(cn.posted_at),
          action: 'credit_note_posted',
          label: `Credit Note Posted (${cn.credit_note_number || ''})`,
          user: cn.created_by ? String(cn.created_by) : null,
          organization: null,
        });
      }
    }

    // Refunds
    let rfQuery = supabase
      .from('accounting_refunds')
      .select('*')
      .eq('contact_id', contactId);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      rfQuery = rfQuery.eq('organization_id', scope.organizationId);
    }
    const { data: refunds } = await rfQuery;
    for (const rf of refunds || []) {
      events.push({
        id: `rf-${rf.id}`,
        at: String(rf.created_at || rf.refund_date),
        action: 'refund_issued',
        label: `Refund Issued (${Number(rf.amount) || 0})`,
        user: rf.refunded_by ? String(rf.refunded_by) : null,
        organization: null,
      });
    }

    events.sort((a, b) => a.at.localeCompare(b.at));
    return { events };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load timeline',
    };
  }
}

export async function getCustomerTransactionHistory(
  contactId: string,
  filters: { page?: number; pageSize?: number; search?: string } = {}
) {
  try {
    const timeline = await getCustomerAccountingTimeline(contactId);
    if ('error' in timeline && timeline.error) return { error: timeline.error };

    const accountingActions = new Set([
      'invoice_created',
      'posted',
      'payment_registered',
      'credit_note_created',
      'credit_note_posted',
      'refund_issued',
      'cancelled',
      'previewed',
      'printed',
      'sent',
    ]);

    let events = (timeline.events || []).filter(
      (e) =>
        accountingActions.has(e.action) ||
        e.action.includes('invoice') ||
        e.action.includes('payment') ||
        e.action.includes('credit') ||
        e.action.includes('refund')
    );

    const needle = String(filters.search || '').trim().toLowerCase();
    if (needle) {
      events = events.filter((e) =>
        [e.label, e.action, e.user].join(' ').toLowerCase().includes(needle)
      );
    }

    events = [...events].reverse();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(50, Math.max(10, filters.pageSize || 20));
    const total = events.length;
    const slice = events.slice((page - 1) * pageSize, page * pageSize);

    return { transactions: slice, total, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load transactions',
    };
  }
}

export async function logCustomerStatementGenerated(contactId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    // Soft log via first invoice of customer if any — else skip
    const supabase = await createAdminClient();
    let invQuery = supabase
      .from('accounting_customer_invoices')
      .select('id')
      .eq('contact_id', contactId)
      .limit(1);
    if (scope.organizationId && !scope.isGlobalAdminView) {
      invQuery = invQuery.eq('organization_id', scope.organizationId);
    }
    const { data: inv } = await invQuery.maybeSingle();
    if (inv?.id) {
      await supabase.from('accounting_invoice_logs').insert([
        {
          invoice_id: inv.id,
          action: 'statement_generated',
          performed_by: scope.session!.username,
          details: { contact_id: contactId, kind: 'customer_statement' },
        },
      ]);
    }
    return { ok: true as const };
  } catch {
    return { ok: true as const };
  }
}
