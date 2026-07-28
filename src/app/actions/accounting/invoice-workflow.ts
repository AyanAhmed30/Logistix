'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import {
  getAccountingInvoiceDetail,
  type AccountingInvoiceDetail,
  type AccountingInvoiceStatus,
} from '@/app/actions/accounting/invoices';

export type AccountingInvoiceLog = {
  id: string;
  invoice_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  performed_by: string | null;
  performed_at: string;
  details: Record<string, unknown>;
};

export type AccountingInvoiceLineInput = {
  id?: string | null;
  sequence: number;
  product_name: string;
  description?: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  discount: number;
  taxes: number;
  line_total: number;
};

export type AccountingInvoiceUpdatePayload = {
  customer_name?: string;
  contact_id?: string | null;
  customer_lead_id?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  contact_person_name?: string | null;
  email?: string | null;
  phone?: string | null;
  invoice_date?: string;
  due_date?: string | null;
  payment_terms?: string | null;
  salesperson_name?: string | null;
  notes?: string | null;
  customer_notes?: string | null;
  lines?: AccountingInvoiceLineInput[];
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

async function loadInvoiceRow(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  invoiceId: string
) {
  const { data, error } = await supabase
    .from('accounting_customer_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error || !data) return { error: error?.message || 'Invoice not found' };
  return { invoice: data };
}

async function appendLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  opts: {
    invoiceId: string;
    action: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    performedBy: string;
    details?: Record<string, unknown>;
  }
) {
  await supabase.from('accounting_invoice_logs').insert([
    {
      invoice_id: opts.invoiceId,
      action: opts.action,
      previous_status: opts.previousStatus ?? null,
      new_status: opts.newStatus ?? null,
      performed_by: opts.performedBy,
      details: opts.details || {},
    },
  ]);
}

function computeTotals(lines: AccountingInvoiceLineInput[]) {
  let untaxed = 0;
  let tax = 0;
  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unit_price) || 0;
    const discount = Number(line.discount) || 0;
    const taxPct = Number(line.taxes) || 0;
    const base = qty * price * (1 - discount / 100);
    const taxAmt = base * (taxPct / 100);
    untaxed += base;
    tax += taxAmt;
  }
  return {
    untaxed_amount: Math.round(untaxed * 100) / 100,
    tax_amount: Math.round(tax * 100) / 100,
    total_amount: Math.round((untaxed + tax) * 100) / 100,
  };
}

async function allocateNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null
): Promise<string> {
  if (organizationId) {
    try {
      const { data: seq } = await supabase
        .from('accounting_invoice_sequences')
        .select('prefix, next_number')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (seq) {
        const next = Math.max(1, Number(seq.next_number) || 1);
        const prefix = String(seq.prefix || 'INV');
        await supabase
          .from('accounting_invoice_sequences')
          .update({
            next_number: next + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);
        return `${prefix}${String(next).padStart(5, '0')}`;
      }

      await supabase.from('accounting_invoice_sequences').insert([
        { organization_id: organizationId, prefix: 'INV', next_number: 2 },
      ]);
      return 'INV00001';
    } catch {
      // fall through
    }
  }
  const year = new Date().getFullYear();
  return `INV/${year}/${String(Date.now()).slice(-4)}`;
}

export async function updateAccountingInvoice(
  invoiceId: string,
  payload: AccountingInvoiceUpdatePayload
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const loaded = await loadInvoiceRow(supabase, invoiceId);
    if ('error' in loaded) return { error: loaded.error };
    const row = loaded.invoice;

    if (String(row.status) !== 'draft') {
      return { error: 'Only draft invoices can be edited' };
    }

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Invoice not in the selected organization' };
    }

    const lines = payload.lines;
    const totals = lines ? computeTotals(lines) : null;

    const nextInvoiceDate =
      payload.invoice_date !== undefined ? payload.invoice_date : row.invoice_date;
    const nextTerms =
      payload.payment_terms !== undefined ? payload.payment_terms : row.payment_terms;
    let nextDueDate =
      payload.due_date !== undefined ? payload.due_date : row.due_date;
    // Auto due date when terms/date change and client didn't send an explicit due_date
    if (
      payload.due_date === undefined &&
      (payload.payment_terms !== undefined || payload.invoice_date !== undefined)
    ) {
      const { computeDueDateFromTerms } = await import('@/lib/accounting-due-dates');
      nextDueDate =
        computeDueDateFromTerms(
          nextInvoiceDate ? String(nextInvoiceDate) : null,
          nextTerms ? String(nextTerms) : null
        ) || nextDueDate;
    }

    const { error: updError } = await supabase
      .from('accounting_customer_invoices')
      .update({
        customer_name:
          payload.customer_name !== undefined
            ? payload.customer_name
            : row.customer_name,
        contact_id:
          payload.contact_id !== undefined ? payload.contact_id : row.contact_id,
        customer_lead_id:
          payload.customer_lead_id !== undefined
            ? payload.customer_lead_id
            : row.customer_lead_id,
        billing_address:
          payload.billing_address !== undefined
            ? payload.billing_address
            : row.billing_address,
        shipping_address:
          payload.shipping_address !== undefined
            ? payload.shipping_address
            : row.shipping_address,
        contact_person_name:
          payload.contact_person_name !== undefined
            ? payload.contact_person_name
            : row.contact_person_name,
        email: payload.email !== undefined ? payload.email : row.email,
        phone: payload.phone !== undefined ? payload.phone : row.phone,
        invoice_date: nextInvoiceDate,
        due_date: nextDueDate,
        payment_terms: nextTerms,
        salesperson_name:
          payload.salesperson_name !== undefined
            ? payload.salesperson_name
            : row.salesperson_name,
        notes: payload.notes !== undefined ? payload.notes : row.notes,
        customer_notes:
          payload.customer_notes !== undefined
            ? payload.customer_notes
            : row.customer_notes,
        ...(totals || {}),
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    if (updError) {
      if (/customer_notes|column/i.test(updError.message)) {
        return {
          error:
            'Run create_accounting_invoice_workflow_phase2.sql migration.',
        };
      }
      return { error: updError.message };
    }

    if (lines) {
      await supabase
        .from('accounting_customer_invoice_lines')
        .delete()
        .eq('invoice_id', invoiceId);
      if (lines.length) {
        await supabase.from('accounting_customer_invoice_lines').insert(
          lines.map((l, idx) => ({
            invoice_id: invoiceId,
            sequence: l.sequence || (idx + 1) * 10,
            product_name: l.product_name || '',
            description: l.description || null,
            quantity: Number(l.quantity) || 0,
            uom: l.uom || 'Units',
            unit_price: Number(l.unit_price) || 0,
            discount: Number(l.discount) || 0,
            taxes: Number(l.taxes) || 0,
            line_total: Number(l.line_total) || 0,
          }))
        );
      }
    }

    await appendLog(supabase, {
      invoiceId,
      action: 'updated',
      previousStatus: String(row.status),
      newStatus: String(row.status),
      performedBy: scope.session!.username,
      details: {
        total_amount: totals?.total_amount ?? row.total_amount,
        previous_total: row.total_amount,
      },
    });

    return getAccountingInvoiceDetail(invoiceId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to save invoice',
    };
  }
}

async function transitionStatus(
  invoiceId: string,
  to: AccountingInvoiceStatus,
  action: string,
  opts?: { allowFrom?: AccountingInvoiceStatus[]; details?: Record<string, unknown> }
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const loaded = await loadInvoiceRow(supabase, invoiceId);
    if ('error' in loaded) return { error: loaded.error };
    const row = loaded.invoice;
    const from = String(row.status) as AccountingInvoiceStatus;

    if (opts?.allowFrom && !opts.allowFrom.includes(from)) {
      return { error: `Cannot ${action} from status "${from}"` };
    }

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Invoice not in the selected organization' };
    }

    const patch: Record<string, unknown> = {
      status: to,
      updated_by: scope.session!.username,
      updated_at: new Date().toISOString(),
    };
    if (to === 'posted') patch.posted_at = new Date().toISOString();
    if (to === 'cancelled') patch.cancelled_at = new Date().toISOString();
    if (to === 'draft') {
      patch.posted_at = null;
      patch.cancelled_at = null;
    }

    const { error } = await supabase
      .from('accounting_customer_invoices')
      .update(patch)
      .eq('id', invoiceId);

    if (error) return { error: error.message };

    await appendLog(supabase, {
      invoiceId,
      action,
      previousStatus: from,
      newStatus: to,
      performedBy: scope.session!.username,
      details: opts?.details || {},
    });

    return getAccountingInvoiceDetail(invoiceId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : `Failed to ${action}`,
    };
  }
}

export async function postAccountingInvoice(invoiceId: string) {
  return transitionStatus(invoiceId, 'posted', 'posted', {
    allowFrom: ['draft'],
  });
}

export async function cancelAccountingInvoice(invoiceId: string) {
  return transitionStatus(invoiceId, 'cancelled', 'cancelled', {
    allowFrom: ['draft', 'posted'],
  });
}

export async function resetAccountingInvoiceToDraft(invoiceId: string) {
  return transitionStatus(invoiceId, 'draft', 'reset_to_draft', {
    allowFrom: ['posted', 'cancelled'],
  });
}

/** @deprecated Use registerAccountingPayment from payments.ts */
export async function registerAccountingPaymentPlaceholder(
  invoiceId: string,
  opts?: { amount?: number; simulatePaid?: boolean }
) {
  const { registerAccountingPayment } = await import(
    '@/app/actions/accounting/payments'
  );
  const today = new Date().toISOString().slice(0, 10);
  return registerAccountingPayment(invoiceId, {
    payment_date: today,
    amount: opts?.amount || 0,
    payment_method: 'bank_transfer',
    reference: opts?.simulatePaid ? 'simulate' : 'placeholder',
  });
}

export async function getAccountingInvoicePdfPayload(invoiceId: string) {
  const detailRes = await getAccountingInvoiceDetail(invoiceId);
  if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
  return { invoice: detailRes.invoice! };
}

export async function duplicateAccountingInvoice(invoiceId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const detailRes = await getAccountingInvoiceDetail(invoiceId);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const source = detailRes.invoice!;
    if (!source.organization_id && !scope.organizationId) {
      return { error: 'Select an organization to duplicate' };
    }

    const supabase = await createAdminClient();
    const orgId = (source.organization_id || scope.organizationId) ?? null;
    const invoiceNumber = await allocateNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);

    const { data: created, error } = await supabase
      .from('accounting_customer_invoices')
      .insert([
        {
          organization_id: orgId,
          invoice_number: invoiceNumber,
          status: 'draft',
          contact_id: source.contact_id,
          customer_name: source.customer_name,
          customer_lead_id: source.customer_lead_id,
          sales_order_id: source.sales_order_id,
          sales_order_number: source.sales_order_number,
          quotation_number: source.quotation_number,
          salesperson_name: source.salesperson_name,
          payment_terms: source.payment_terms || 'Immediate',
          invoice_date: today,
          due_date: source.due_date,
          billing_address: source.billing_address,
          shipping_address: source.shipping_address,
          contact_person_name: source.contact_person_name,
          email: source.email,
          phone: source.phone,
          notes: source.notes,
          customer_notes: source.customer_notes,
          untaxed_amount: source.untaxed_amount,
          tax_amount: source.tax_amount,
          total_amount: source.total_amount,
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (error || !created) {
      if (error && /customer_notes|column/i.test(error.message)) {
        const retry = await supabase
          .from('accounting_customer_invoices')
          .insert([
            {
              organization_id: orgId,
              invoice_number: invoiceNumber,
              status: 'draft',
              contact_id: source.contact_id,
              customer_name: source.customer_name,
              customer_lead_id: source.customer_lead_id,
              sales_order_id: source.sales_order_id,
              sales_order_number: source.sales_order_number,
              quotation_number: source.quotation_number,
              salesperson_name: source.salesperson_name,
              payment_terms: source.payment_terms || 'Immediate',
              invoice_date: today,
              due_date: source.due_date,
              billing_address: source.billing_address,
              shipping_address: source.shipping_address,
              contact_person_name: source.contact_person_name,
              email: source.email,
              phone: source.phone,
              notes: source.customer_notes || source.notes,
              untaxed_amount: source.untaxed_amount,
              tax_amount: source.tax_amount,
              total_amount: source.total_amount,
              created_by: scope.session!.username,
              updated_by: scope.session!.username,
            },
          ])
          .select('id')
          .single();
        if (retry.error || !retry.data) {
          return { error: retry.error?.message || 'Failed to duplicate invoice' };
        }
        const createdId = String(retry.data.id);
        if (source.lines.length) {
          await supabase.from('accounting_customer_invoice_lines').insert(
            source.lines.map((l, idx) => ({
              invoice_id: createdId,
              sequence: l.sequence || (idx + 1) * 10,
              product_name: l.product_name,
              description: l.description,
              quantity: l.quantity,
              uom: l.uom,
              unit_price: l.unit_price,
              discount: l.discount,
              taxes: l.taxes,
              line_total: l.line_total,
            }))
          );
        }
        return { invoiceId: createdId };
      }
      return { error: error?.message || 'Failed to duplicate invoice' };
    }

    if (source.lines.length) {
      await supabase.from('accounting_customer_invoice_lines').insert(
        source.lines.map((l, idx) => ({
          invoice_id: created.id,
          sequence: l.sequence || (idx + 1) * 10,
          product_name: l.product_name,
          description: l.description,
          quantity: l.quantity,
          uom: l.uom,
          unit_price: l.unit_price,
          discount: l.discount,
          taxes: l.taxes,
          line_total: l.line_total,
        }))
      );
    }

    await appendLog(supabase, {
      invoiceId: String(created.id),
      action: 'created',
      previousStatus: null,
      newStatus: 'draft',
      performedBy: scope.session!.username,
      details: { duplicated_from: invoiceId, invoice_number: invoiceNumber },
    });

    await appendLog(supabase, {
      invoiceId,
      action: 'duplicated',
      previousStatus: source.status,
      newStatus: source.status,
      performedBy: scope.session!.username,
      details: { new_invoice_id: created.id, new_invoice_number: invoiceNumber },
    });

    return { invoiceId: String(created.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to duplicate invoice',
    };
  }
}

export async function getAccountingInvoiceActivity(invoiceId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_invoice_logs')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('performed_at', { ascending: false })
      .limit(200);

    if (error) {
      if (/accounting_invoice_logs|relation/i.test(error.message)) {
        return { logs: [] as AccountingInvoiceLog[] };
      }
      return { error: error.message };
    }

    const logs: AccountingInvoiceLog[] = (data || []).map((r) => ({
      id: String(r.id),
      invoice_id: String(r.invoice_id),
      action: String(r.action || ''),
      previous_status: r.previous_status ? String(r.previous_status) : null,
      new_status: r.new_status ? String(r.new_status) : null,
      performed_by: r.performed_by ? String(r.performed_by) : null,
      performed_at: String(r.performed_at || ''),
      details: (r.details || {}) as Record<string, unknown>,
    }));

    return { logs };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load activity',
    };
  }
}

export async function postAccountingInvoiceNote(
  invoiceId: string,
  note: string,
  kind: 'note' | 'message' = 'note'
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const text = String(note || '').trim();
    if (!text) return { error: 'Note is required' };

    const supabase = await createAdminClient();
    await appendLog(supabase, {
      invoiceId,
      action: 'log_note',
      performedBy: scope.session!.username,
      details: { kind, note: text },
    });
    return getAccountingInvoiceActivity(invoiceId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post note',
    };
  }
}

export async function logAccountingInvoicePreview(
  invoiceId: string,
  kind: 'pdf' | 'print' | 'email'
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    await appendLog(supabase, {
      invoiceId,
      action: kind === 'print' ? 'printed' : kind === 'email' ? 'sent' : 'previewed',
      performedBy: scope.session!.username,
      details: { kind },
    });

    if (kind === 'email') {
      await supabase
        .from('accounting_customer_invoices')
        .update({
          sent_at: new Date().toISOString(),
          updated_by: scope.session!.username,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);
    }

    return { ok: true as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to log preview',
    };
  }
}

export async function prepareAccountingInvoiceEmail(invoiceId: string) {
  try {
    const detailRes = await getAccountingInvoiceDetail(invoiceId);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const inv = detailRes.invoice!;

    const subject = `Invoice ${inv.invoice_number}`;
    const body = [
      `Dear ${inv.contact_person_name || inv.customer_name || 'Customer'},`,
      '',
      `Please find attached invoice ${inv.invoice_number}.`,
      '',
      `Invoice Date: ${inv.invoice_date || '—'}`,
      `Due Date: ${inv.due_date || '—'}`,
      `Total: ${Number(inv.total_amount || 0).toFixed(2)}`,
      '',
      inv.customer_notes ? `Notes:\n${inv.customer_notes}` : '',
      '',
      'Best regards,',
      inv.organization_name || 'Logistix',
    ]
      .filter((l) => l !== undefined)
      .join('\n');

    await logAccountingInvoicePreview(invoiceId, 'email');

    return {
      email: {
        to: inv.email || '',
        subject,
        body,
        sendingReady: false as const,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to prepare email',
    };
  }
}
