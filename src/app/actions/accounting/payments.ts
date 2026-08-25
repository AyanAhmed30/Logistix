'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import { getAccountingInvoiceDetail } from '@/app/actions/accounting/invoices';
import type { AccountingInvoiceStatus } from '@/app/actions/accounting/invoices';
import {
  computePaymentState,
  outstandingFromComponents,
  paymentMethodLabel,
  type AccountingPaymentMethod,
  type AccountingPaymentState,
} from '@/lib/accounting-payments';
import {
  invoiceOpenAmount,
  sumPostedCreditNotesForInvoice,
} from '@/lib/accounting-document-outstanding';

export type AccountingInvoicePayment = {
  id: string;
  organization_id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: AccountingPaymentMethod;
  reference: string | null;
  notes: string | null;
  paid_by: string | null;
  created_by: string | null;
  created_at: string;
  organization_name: string | null;
};

export type RegisterAccountingPaymentInput = {
  payment_date: string;
  amount: number;
  payment_method: AccountingPaymentMethod;
  reference?: string | null;
  notes?: string | null;
  idempotency_key?: string | null;
  /** Odoo Pay wizard journal — Bank keeps In Payment; Cash marks Paid when settled. */
  journal?: 'bank' | 'cash' | null;
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
    return { error: 'Select an organization from the header switcher.' };
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

async function sumPayments(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  invoiceId: string
) {
  const { data } = await supabase
    .from('accounting_invoice_payments')
    .select('amount')
    .eq('invoice_id', invoiceId);
  const sum = (data || []).reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  return round2(sum);
}

async function applyPaymentTotals(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  invoiceId: string,
  username: string,
  opts?: { journal?: 'bank' | 'cash' | null }
) {
  const { data: inv } = await supabase
    .from('accounting_customer_invoices')
    .select('id, total_amount, due_date, status, payment_state, amount_paid, amount_residual')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv) return { error: 'Invoice not found' as const };

  const total = Number(inv.total_amount) || 0;
  const journal = opts?.journal ?? null;
  const workflowStatus = String(inv.status) as AccountingInvoiceStatus;
  const previousPaymentState = String(inv.payment_state || 'not_paid');
  const residualDue = await invoiceOpenAmount(supabase, {
    invoiceId,
    total,
  });
  const notes = await sumPostedCreditNotesForInvoice(supabase, invoiceId);
  const appliedPaid = round2(Math.max(0, total - residualDue - notes));
  const keepInPayment =
    residualDue > 0.004 &&
    (journal === 'bank' ||
      (journal == null && previousPaymentState === 'in_payment'));

  const computed = computePaymentState({
    total,
    amountPaid: appliedPaid,
    dueDate: inv.due_date ? String(inv.due_date) : null,
    workflowStatus: String(inv.status || ''),
    journal: keepInPayment ? 'bank' : journal === 'cash' ? 'cash' : null,
    preferInPayment: keepInPayment,
    amountResidual: residualDue,
  });

  let nextStatus = workflowStatus;
  if (workflowStatus === 'posted' || workflowStatus === 'paid') {
    nextStatus = computed.paymentState === 'paid' ? 'paid' : 'posted';
  }

  await supabase
    .from('accounting_customer_invoices')
    .update({
      amount_paid: computed.amountPaid,
      amount_residual: computed.outstanding,
      payment_state: computed.paymentState,
      status: nextStatus,
      updated_by: username,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  return {
    amountPaid: computed.amountPaid,
    outstanding: computed.outstanding,
    paymentState: computed.paymentState as AccountingPaymentState,
    previousPaymentState,
    previousStatus: workflowStatus,
    nextStatus,
  };
}

export async function registerAccountingPayment(
  invoiceId: string,
  input: RegisterAccountingPaymentInput
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Payment amount must be greater than zero' };
    }

    const method = input.payment_method;
    if (!['cash', 'bank_transfer', 'cheque'].includes(method)) {
      return { error: 'Invalid payment method' };
    }

    const journal =
      input.journal === 'cash' || input.journal === 'bank'
        ? input.journal
        : method === 'cash'
          ? ('cash' as const)
          : ('bank' as const);

    const paymentDate = String(input.payment_date || '').trim();
    if (!paymentDate) return { error: 'Payment date is required' };

    const supabase = await createAdminClient();
    const { data: inv, error: loadError } = await supabase
      .from('accounting_customer_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();

    if (loadError || !inv) return { error: loadError?.message || 'Invoice not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      inv.organization_id &&
      String(inv.organization_id) !== scope.organizationId
    ) {
      return { error: 'Invoice not in the selected organization' };
    }

    const status = String(inv.status);
    if (status !== 'posted' && status !== 'paid') {
      return { error: 'Payments can only be registered on Posted invoices' };
    }

    const orgId = inv.organization_id ? String(inv.organization_id) : scope.organizationId;
    if (!orgId) return { error: 'Invoice organization is missing' };

    const { getAccountingDocumentLockError } = await import(
      '@/lib/accounting-lock-dates'
    );
    const payLock = await getAccountingDocumentLockError(
      orgId,
      paymentDate,
      'sale'
    );
    if (payLock) return { error: payLock };

    const alreadyPaid = await sumPayments(supabase, invoiceId);
    const total = round2(Number(inv.total_amount) || 0);
    const creditNotes = await sumPostedCreditNotesForInvoice(supabase, invoiceId);
    const outstanding = outstandingFromComponents({
      total,
      amountPaid: alreadyPaid,
      adjustments: creditNotes,
    });

    if (amount - outstanding > 0.004) {
      return {
        error: `Payment amount cannot exceed outstanding balance (${outstanding.toFixed(2)})`,
      };
    }

    const since = new Date(Date.now() - 15_000).toISOString();
    const ref = String(input.reference || '').trim();
    const { data: recent } = await supabase
      .from('accounting_invoice_payments')
      .select('id, amount, payment_method, payment_date, reference, created_at')
      .eq('invoice_id', invoiceId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);

    const dup = (recent || []).find((p) => {
      const sameAmount = Math.abs(Number(p.amount) - amount) < 0.004;
      const sameMethod = String(p.payment_method) === method;
      const sameDate = String(p.payment_date) === paymentDate;
      const sameRef = String(p.reference || '').trim() === ref;
      return sameAmount && sameMethod && sameDate && sameRef;
    });
    if (dup) {
      return { error: 'Duplicate payment detected. Please wait before submitting again.' };
    }

    if (input.idempotency_key) {
      const { data: keyed } = await supabase
        .from('accounting_invoice_logs')
        .select('id')
        .eq('invoice_id', invoiceId)
        .eq('action', 'payment_registered')
        .contains('details', { idempotency_key: input.idempotency_key })
        .maybeSingle();
      if (keyed?.id) {
        return getAccountingInvoiceDetail(invoiceId);
      }
    }

    const { data: payment, error: payError } = await supabase
      .from('accounting_invoice_payments')
      .insert([
        {
          organization_id: orgId,
          invoice_id: invoiceId,
          payment_date: paymentDate,
          amount,
          payment_method: method,
          journal,
          reconcile_status: journal === 'cash' ? 'reconciled' : 'outstanding',
          amount_reconciled: journal === 'cash' ? amount : 0,
          reference: ref || null,
          notes: String(input.notes || '').trim() || null,
          paid_by: scope.session!.username,
          created_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (payError || !payment) {
      // Retry without Phase-2 reconcile columns if migration not applied yet.
      if (payError && /journal|reconcile_status|amount_reconciled|column/i.test(payError.message)) {
        const retry = await supabase
          .from('accounting_invoice_payments')
          .insert([
            {
              organization_id: orgId,
              invoice_id: invoiceId,
              payment_date: paymentDate,
              amount,
              payment_method: method,
              reference: ref || null,
              notes: String(input.notes || '').trim() || null,
              paid_by: scope.session!.username,
              created_by: scope.session!.username,
            },
          ])
          .select('id')
          .single();
        if (retry.error || !retry.data) {
          if (
            retry.error &&
            /accounting_invoice_payments|relation|schema cache/i.test(retry.error.message)
          ) {
            return {
              error:
                'Run create_accounting_payments_phase4.sql migration to enable payments.',
            };
          }
          return { error: retry.error?.message || 'Failed to register payment' };
        }
        // Continue with retry.data as payment
        const totals = await applyPaymentTotals(
          supabase,
          invoiceId,
          scope.session!.username,
          { journal }
        );
        if ('error' in totals && totals.error) return { error: totals.error };

        await supabase.from('accounting_invoice_logs').insert([
          {
            invoice_id: invoiceId,
            action: 'payment_registered',
            previous_status: totals.previousStatus,
            new_status: totals.nextStatus,
            performed_by: scope.session!.username,
            details: {
              payment_id: retry.data.id,
              amount,
              payment_method: method,
              payment_method_label: paymentMethodLabel(method),
              payment_date: paymentDate,
              reference: ref || null,
              outstanding: totals.outstanding,
              amount_paid: totals.amountPaid,
              payment_state: totals.paymentState,
              previous_payment_state: totals.previousPaymentState,
              journal,
              idempotency_key: input.idempotency_key || null,
            },
          },
        ]);

        try {
          const { postJournalEntryForCustomerPayment } = await import(
            '@/app/actions/accounting/journal-entries'
          );
          await postJournalEntryForCustomerPayment(String(retry.data.id));
        } catch {
          /* best-effort */
        }

        return getAccountingInvoiceDetail(invoiceId);
      }
      if (payError && /accounting_invoice_payments|relation|schema cache/i.test(payError.message)) {
        return {
          error:
            'Run create_accounting_payments_phase4.sql migration to enable payments.',
        };
      }
      return { error: payError?.message || 'Failed to register payment' };
    }

    const totals = await applyPaymentTotals(
      supabase,
      invoiceId,
      scope.session!.username,
      { journal }
    );
    if ('error' in totals && totals.error) return { error: totals.error };

    await supabase.from('accounting_invoice_logs').insert([
      {
        invoice_id: invoiceId,
        action: 'payment_registered',
        previous_status: totals.previousStatus,
        new_status: totals.nextStatus,
        performed_by: scope.session!.username,
        details: {
          payment_id: payment.id,
          amount,
          payment_method: method,
          payment_method_label: paymentMethodLabel(method),
          payment_date: paymentDate,
          reference: ref || null,
          outstanding: totals.outstanding,
          amount_paid: totals.amountPaid,
          payment_state: totals.paymentState,
          previous_payment_state: totals.previousPaymentState,
          idempotency_key: input.idempotency_key || null,
        },
      },
    ]);

    try {
      const { writeAccountingAuditLog } = await import(
        '@/app/actions/accounting/automation'
      );
      await writeAccountingAuditLog({
        organizationId: inv.organization_id ? String(inv.organization_id) : null,
        entityType: 'invoice',
        entityId: invoiceId,
        action: 'payment_registered',
        performedBy: scope.session!.username,
        previousValue: { payment_state: totals.previousPaymentState },
        newValue: {
          payment_state: totals.paymentState,
          amount_paid: totals.amountPaid,
        },
        details: { amount, payment_method: method },
      });
    } catch {
      // soft
    }

    try {
      const { postJournalEntryForCustomerPayment } = await import(
        '@/app/actions/accounting/journal-entries'
      );
      const je = await postJournalEntryForCustomerPayment(String(payment.id));
      if ('error' in je && je.error) {
        await supabase
          .from('accounting_invoice_payments')
          .delete()
          .eq('id', payment.id);
        // restore invoice payment totals
        const { computePaymentState } = await import('@/lib/accounting-payments');
        const { data: inv } = await supabase
          .from('accounting_customer_invoices')
          .select('id, total_amount, due_date, status')
          .eq('id', invoiceId)
          .maybeSingle();
        if (inv) {
          const residualDue = await invoiceOpenAmount(supabase, {
            invoiceId,
            total: Number(inv.total_amount) || 0,
          });
          const { data: pays } = await supabase
            .from('accounting_invoice_payments')
            .select('amount')
            .eq('invoice_id', invoiceId);
          const paid = Math.round(
            (pays || []).reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100
          ) / 100;
          const computed = computePaymentState({
            total: Number(inv.total_amount) || 0,
            amountPaid: paid,
            dueDate: inv.due_date ? String(inv.due_date) : null,
            workflowStatus: String(inv.status || ''),
            amountResidual: residualDue,
          });
          await supabase
            .from('accounting_customer_invoices')
            .update({
              amount_paid: computed.amountPaid,
              amount_residual: computed.outstanding,
              payment_state: computed.paymentState,
              status:
                String(inv.status) === 'posted' || String(inv.status) === 'paid'
                  ? computed.paymentState === 'paid'
                    ? 'paid'
                    : 'posted'
                  : inv.status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', invoiceId);
        }
        return {
          error: `Payment not registered — journal entry failed: ${je.error}`,
        };
      }
    } catch (err) {
      await supabase
        .from('accounting_invoice_payments')
        .delete()
        .eq('id', payment.id);
      return {
        error: `Payment not registered — journal entry failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      };
    }

    return getAccountingInvoiceDetail(invoiceId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to register payment',
    };
  }
}

export async function getAccountingInvoicePayments(
  invoiceId: string,
  filters: {
    search?: string;
    sortBy?: 'payment_date' | 'amount' | 'payment_method' | 'created_at';
    sortDir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  } = {}
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(50, Math.max(5, filters.pageSize || 10));
    const sortBy = filters.sortBy || 'payment_date';
    const ascending = filters.sortDir === 'asc';

    const { data: inv } = await supabase
      .from('accounting_customer_invoices')
      .select('id, organization_id')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!inv) return { error: 'Invoice not found' };
    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      inv.organization_id &&
      String(inv.organization_id) !== scope.organizationId
    ) {
      return { error: 'Invoice not found in the selected organization' };
    }

    let query = supabase
      .from('accounting_invoice_payments')
      .select('*', { count: 'exact' })
      .eq('invoice_id', invoiceId);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    const needle = String(filters.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `reference.ilike.${like},notes.ilike.${like},paid_by.ilike.${like},payment_method.ilike.${like}`
      );
    }

    query = query
      .order(sortBy, { ascending, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (/accounting_invoice_payments|relation/i.test(error.message)) {
        return { payments: [] as AccountingInvoicePayment[], total: 0, page, pageSize };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const orgIds = [
      ...new Set(rows.map((r) => String(r.organization_id || '')).filter(Boolean)),
    ];
    const orgMap = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, organization_name')
        .in('id', orgIds);
      for (const o of orgs || []) {
        orgMap.set(String(o.id), String(o.organization_name || ''));
      }
    }

    const payments: AccountingInvoicePayment[] = rows.map((r) => {
      const orgId = String(r.organization_id);
      return {
        id: String(r.id),
        organization_id: orgId,
        invoice_id: String(r.invoice_id),
        payment_date: String(r.payment_date || ''),
        amount: Number(r.amount) || 0,
        payment_method:
          (String(r.payment_method) as AccountingPaymentMethod) || 'bank_transfer',
        reference: r.reference ? String(r.reference) : null,
        notes: r.notes ? String(r.notes) : null,
        paid_by: r.paid_by ? String(r.paid_by) : null,
        created_by: r.created_by ? String(r.created_by) : null,
        created_at: String(r.created_at || ''),
        organization_name: orgMap.get(orgId) || null,
      };
    });

    return { payments, total: count ?? payments.length, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payments',
    };
  }
}

export type AccountingCustomerPaymentListItem = {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: AccountingPaymentMethod;
  reference: string | null;
  notes: string | null;
  status: 'posted';
  organization_id: string;
  organization_name: string | null;
  invoice_id: string;
  invoice_number: string | null;
  customer_name: string | null;
  customer_lead_id: string | null;
  contact_id: string | null;
  amount_residual: number | null;
  created_by: string | null;
  created_at: string;
};

/** Org-wide customer payments list (Accounting → Customers → Payments). */
export async function getAccountingCustomerPayments(filters: {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'payment_date' | 'amount' | 'created_at';
  sortDir?: 'asc' | 'desc';
} = {}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        payments: [] as AccountingCustomerPaymentListItem[],
        total: 0,
        page: 1,
        pageSize: 40,
      };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const sortBy = filters.sortBy || 'payment_date';
    const ascending = filters.sortDir === 'asc';

    const needle = String(filters.search || '').trim();
    let matchingInvoiceIds: string[] | null = null;
    if (needle) {
      const like = `%${needle}%`;
      let invQ = supabase
        .from('accounting_customer_invoices')
        .select('id')
        .or(
          `invoice_number.ilike.${like},customer_name.ilike.${like},customer_lead_id.ilike.${like}`
        );
      if (scope.organizationId && !scope.isGlobalAdminView) {
        invQ = invQ.eq('organization_id', scope.organizationId);
      }
      const { data: invHits } = await invQ.limit(200);
      matchingInvoiceIds = (invHits || []).map((i) => String(i.id));
    }

    let query = supabase
      .from('accounting_invoice_payments')
      .select('*', { count: 'exact' });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    if (needle) {
      const like = `%${needle}%`;
      if (matchingInvoiceIds && matchingInvoiceIds.length) {
        query = query.or(
          `reference.ilike.${like},notes.ilike.${like},paid_by.ilike.${like},invoice_id.in.(${matchingInvoiceIds.join(',')})`
        );
      } else {
        query = query.or(
          `reference.ilike.${like},notes.ilike.${like},paid_by.ilike.${like},payment_method.ilike.${like}`
        );
      }
    }

    query = query
      .order(sortBy, { ascending, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (/accounting_invoice_payments|relation/i.test(error.message)) {
        return {
          payments: [] as AccountingCustomerPaymentListItem[],
          total: 0,
          page,
          pageSize,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const invoiceIds = [
      ...new Set(rows.map((r) => String(r.invoice_id || '')).filter(Boolean)),
    ];
    const orgIds = [
      ...new Set(rows.map((r) => String(r.organization_id || '')).filter(Boolean)),
    ];

    const invMap = new Map<
      string,
      {
        invoice_number: string | null;
        customer_name: string | null;
        customer_lead_id: string | null;
        contact_id: string | null;
        amount_residual: number | null;
      }
    >();
    if (invoiceIds.length) {
      const { data: invoices } = await supabase
        .from('accounting_customer_invoices')
        .select(
          'id, invoice_number, customer_name, customer_lead_id, contact_id, amount_residual'
        )
        .in('id', invoiceIds);
      for (const inv of invoices || []) {
        invMap.set(String(inv.id), {
          invoice_number: inv.invoice_number ? String(inv.invoice_number) : null,
          customer_name: inv.customer_name ? String(inv.customer_name) : null,
          customer_lead_id: inv.customer_lead_id
            ? String(inv.customer_lead_id)
            : null,
          contact_id: inv.contact_id ? String(inv.contact_id) : null,
          amount_residual:
            inv.amount_residual != null ? Number(inv.amount_residual) : null,
        });
      }
    }

    const orgMap = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, organization_name')
        .in('id', orgIds);
      for (const o of orgs || []) {
        orgMap.set(String(o.id), String(o.organization_name || ''));
      }
    }

    const payments: AccountingCustomerPaymentListItem[] = rows.map((r) => {
      const inv = invMap.get(String(r.invoice_id)) || {
        invoice_number: null,
        customer_name: null,
        customer_lead_id: null,
        contact_id: null,
        amount_residual: null,
      };
      const id = String(r.id);
      return {
        id,
        payment_number: `PAY-${id.slice(0, 8).toUpperCase()}`,
        payment_date: String(r.payment_date || ''),
        amount: Number(r.amount) || 0,
        payment_method:
          (String(r.payment_method) as AccountingPaymentMethod) || 'bank_transfer',
        reference: r.reference ? String(r.reference) : null,
        notes: r.notes ? String(r.notes) : null,
        status: 'posted',
        organization_id: String(r.organization_id),
        organization_name: orgMap.get(String(r.organization_id)) || null,
        invoice_id: String(r.invoice_id),
        invoice_number: inv.invoice_number,
        customer_name: inv.customer_name,
        customer_lead_id: inv.customer_lead_id,
        contact_id: inv.contact_id,
        amount_residual: inv.amount_residual,
        created_by: r.created_by ? String(r.created_by) : null,
        created_at: String(r.created_at || ''),
      };
    });

    return {
      payments,
      total: count ?? payments.length,
      page,
      pageSize,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payments',
    };
  }
}

export async function getAccountingCustomerPaymentDetail(paymentId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_invoice_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();

    if (error || !row) return { error: error?.message || 'Payment not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Payment not found in the selected organization' };
    }

    const { data: inv } = await supabase
      .from('accounting_customer_invoices')
      .select(
        'id, invoice_number, customer_name, customer_lead_id, contact_id, amount_residual, total_amount, amount_paid, status, payment_state'
      )
      .eq('id', row.invoice_id)
      .maybeSingle();

    let organization_name: string | null = null;
    if (row.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('organization_name')
        .eq('id', row.organization_id)
        .maybeSingle();
      organization_name = org?.organization_name
        ? String(org.organization_name)
        : null;
    }

    const id = String(row.id);
    return {
      payment: {
        id,
        payment_number: `PAY-${id.slice(0, 8).toUpperCase()}`,
        payment_date: String(row.payment_date || ''),
        amount: Number(row.amount) || 0,
        payment_method:
          (String(row.payment_method) as AccountingPaymentMethod) ||
          'bank_transfer',
        reference: row.reference ? String(row.reference) : null,
        notes: row.notes ? String(row.notes) : null,
        status: 'posted' as const,
        organization_id: String(row.organization_id),
        organization_name,
        invoice_id: String(row.invoice_id),
        invoice_number: inv?.invoice_number ? String(inv.invoice_number) : null,
        customer_name: inv?.customer_name ? String(inv.customer_name) : null,
        customer_lead_id: inv?.customer_lead_id
          ? String(inv.customer_lead_id)
          : null,
        contact_id: inv?.contact_id ? String(inv.contact_id) : null,
        amount_residual:
          inv?.amount_residual != null ? Number(inv.amount_residual) : null,
        invoice_total: inv?.total_amount != null ? Number(inv.total_amount) : null,
        invoice_amount_paid:
          inv?.amount_paid != null ? Number(inv.amount_paid) : null,
        invoice_status: inv?.status ? String(inv.status) : null,
        journal: row.journal ? String(row.journal) : null,
        reconcile_status: row.reconcile_status
          ? String(row.reconcile_status)
          : null,
        journal_entry_id: row.journal_entry_id
          ? String(row.journal_entry_id)
          : null,
        created_by: row.created_by ? String(row.created_by) : null,
        created_at: String(row.created_at || ''),
        paid_by: row.paid_by ? String(row.paid_by) : null,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payment',
    };
  }
}
