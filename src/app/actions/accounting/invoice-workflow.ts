'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import {
  getAccountingInvoiceDetail,
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
  product_id?: string | null;
  product_name: string;
  description?: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  discount: number;
  taxes: number;
  line_total: number;
  account?: string | null;
  account_id?: string | null;
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
  payment_term_id?: string | null;
  salesperson_name?: string | null;
  notes?: string | null;
  customer_notes?: string | null;
  bank_account_id?: string | null;
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

    const { getAccountingDocumentLockError } = await import('@/lib/accounting-lock-dates');
    const nextInvoiceDateEarly =
      payload.invoice_date !== undefined ? payload.invoice_date : row.invoice_date;
    const lockErr = await getAccountingDocumentLockError(
      row.organization_id ? String(row.organization_id) : null,
      nextInvoiceDateEarly ? String(nextInvoiceDateEarly) : null,
      'sale'
    );
    if (lockErr) return { error: lockErr };

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
    const nextTermId =
      payload.payment_term_id !== undefined
        ? payload.payment_term_id
        : (row as { payment_term_id?: string | null }).payment_term_id || null;
    let nextDueDate =
      payload.due_date !== undefined ? payload.due_date : row.due_date;
    // Auto due date when terms/date change and client didn't send an explicit due_date
    if (
      payload.due_date === undefined &&
      (payload.payment_terms !== undefined ||
        payload.payment_term_id !== undefined ||
        payload.invoice_date !== undefined)
    ) {
      const { computeAccountingDueDate } = await import(
        '@/app/actions/accounting/payment-terms'
      );
      const computed = await computeAccountingDueDate({
        documentDate: nextInvoiceDate ? String(nextInvoiceDate) : '',
        paymentTermId: nextTermId ? String(nextTermId) : null,
        paymentTermsText: nextTerms ? String(nextTerms) : null,
      });
      if (!('error' in computed) && computed.due_date) {
        nextDueDate = computed.due_date;
      }
    }

    const updatePayload: Record<string, unknown> = {
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
    };

    if (payload.payment_term_id !== undefined) {
      updatePayload.payment_term_id = payload.payment_term_id || null;
    }
    if (payload.bank_account_id !== undefined) {
      updatePayload.bank_account_id = payload.bank_account_id || null;
    }

    const { error: updError } = await supabase
      .from('accounting_customer_invoices')
      .update(updatePayload)
      .eq('id', invoiceId);

    if (updError) {
      if (/bank_account_id|column/i.test(updError.message) && updatePayload.bank_account_id !== undefined) {
        delete updatePayload.bank_account_id;
        const retryBank = await supabase
          .from('accounting_customer_invoices')
          .update(updatePayload)
          .eq('id', invoiceId);
        if (retryBank.error) {
          if (/payment_term_id|column/i.test(retryBank.error.message)) {
            delete updatePayload.payment_term_id;
            const retry = await supabase
              .from('accounting_customer_invoices')
              .update(updatePayload)
              .eq('id', invoiceId);
            if (retry.error) {
              if (/customer_notes|column/i.test(retry.error.message)) {
                return {
                  error:
                    'Run create_accounting_invoice_workflow_phase2.sql migration.',
                };
              }
              return { error: retry.error.message };
            }
          } else if (/customer_notes|column/i.test(retryBank.error.message)) {
            return {
              error:
                'Run create_accounting_invoice_workflow_phase2.sql migration.',
            };
          } else {
            return { error: retryBank.error.message };
          }
        }
      } else if (/payment_term_id|column/i.test(updError.message)) {
        delete updatePayload.payment_term_id;
        const retry = await supabase
          .from('accounting_customer_invoices')
          .update(updatePayload)
          .eq('id', invoiceId);
        if (retry.error) {
          if (/customer_notes|column/i.test(retry.error.message)) {
            return {
              error:
                'Run create_accounting_invoice_workflow_phase2.sql migration.',
            };
          }
          return { error: retry.error.message };
        }
      } else if (/customer_notes|column/i.test(updError.message)) {
        return {
          error:
            'Run create_accounting_invoice_workflow_phase2.sql migration.',
        };
      } else {
        return { error: updError.message };
      }
    }

    if (lines) {
      await supabase
        .from('accounting_customer_invoice_lines')
        .delete()
        .eq('invoice_id', invoiceId);
      if (lines.length) {
        const rows = lines.map((l, idx) => ({
          invoice_id: invoiceId,
          sequence: l.sequence || (idx + 1) * 10,
          product_id: l.product_id || null,
          product_name: l.product_name || '',
          description: l.description || null,
          quantity: Number(l.quantity) || 0,
          uom: l.uom || 'Units',
          unit_price: Number(l.unit_price) || 0,
          discount: Number(l.discount) || 0,
          taxes: Number(l.taxes) || 0,
          line_total: Number(l.line_total) || 0,
          account: String(l.account || 'Sales').trim() || 'Sales',
          account_id: l.account_id || null,
        }));
        const { error: lineErr } = await supabase
          .from('accounting_customer_invoice_lines')
          .insert(rows);
        if (lineErr && /product_id|account_id|account|column/i.test(lineErr.message)) {
          const stripProduct = /product_id/i.test(lineErr.message);
          const stripAccountId = /account_id/i.test(lineErr.message);
          const stripAccount = /account(?!_id)/i.test(lineErr.message);
          const retryRows = rows.map((r) => {
            const next: Record<string, unknown> = { ...r };
            if (stripProduct) delete next.product_id;
            if (stripAccountId) delete next.account_id;
            if (stripAccount) delete next.account;
            return next;
          });
          const retry = await supabase
            .from('accounting_customer_invoice_lines')
            .insert(retryRows);
          if (retry.error) {
            const bare = rows.map(
              ({ account: _a, account_id: _aid, product_id: _p, ...rest }) => rest
            );
            const bareRetry = await supabase
              .from('accounting_customer_invoice_lines')
              .insert(bare);
            if (bareRetry.error) return { error: bareRetry.error.message };
          }
        } else if (lineErr) {
          return { error: lineErr.message };
        }
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
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const loaded = await loadInvoiceRow(supabase, invoiceId);
    if ('error' in loaded) return { error: loaded.error };
    const row = loaded.invoice;

    if (String(row.status) !== 'draft') {
      return { error: `Cannot post from status "${row.status}"` };
    }
    const { getAccountingDocumentLockError } = await import('@/lib/accounting-lock-dates');
    const postLockErr = await getAccountingDocumentLockError(
      row.organization_id ? String(row.organization_id) : null,
      row.invoice_date ? String(row.invoice_date) : null,
      'sale'
    );
    if (postLockErr) return { error: postLockErr };

    if (!String(row.customer_name || '').trim() && !row.contact_id) {
      return { error: 'Customer is required before posting' };
    }

    const { data: lines } = await supabase
      .from('accounting_customer_invoice_lines')
      .select('product_name, quantity, line_total')
      .eq('invoice_id', invoiceId);

    const productLines = (lines || []).filter(
      (l) => String(l.product_name || '').trim() || Number(l.line_total) > 0
    );
    if (!productLines.length) {
      return { error: 'Add at least one invoice line before posting' };
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post invoice',
    };
  }

  const posted = await transitionStatus(invoiceId, 'posted', 'posted', {
    allowFrom: ['draft'],
  });
  if ('error' in posted && posted.error) return posted;

  try {
    const { postJournalEntryForCustomerInvoice } = await import(
      '@/app/actions/accounting/journal-entries'
    );
    const je = await postJournalEntryForCustomerInvoice(invoiceId);
    if ('error' in je && je.error) {
      const supabase = await createAdminClient();
      const { rollbackDocumentPostToDraft } = await import(
        '@/lib/accounting-je-lifecycle'
      );
      const scope = await resolveScope();
      const actor =
        !('error' in scope) && scope.session ? scope.session.username : 'system';
      await rollbackDocumentPostToDraft(
        supabase,
        'accounting_customer_invoices',
        invoiceId,
        actor
      );
      return {
        error: `Invoice not posted — journal entry failed: ${je.error}`,
      };
    }
    if ('journalEntryId' in je && je.journalEntryId && !je.alreadyExists) {
      const supabase = await createAdminClient();
      const scope = await resolveScope();
      if (!('error' in scope) || !scope.error) {
        await appendLog(supabase, {
          invoiceId,
          action: 'journal_entry_created',
          previousStatus: 'draft',
          newStatus: 'posted',
          performedBy:
            !('error' in scope) && scope.session
              ? scope.session.username
              : 'system',
          details: { journal_entry_id: je.journalEntryId },
        });
      }
    }
  } catch (err) {
    const supabase = await createAdminClient();
    const { rollbackDocumentPostToDraft } = await import(
      '@/lib/accounting-je-lifecycle'
    );
    const scope = await resolveScope();
    const actor =
      !('error' in scope) && scope.session ? scope.session.username : 'system';
    await rollbackDocumentPostToDraft(
      supabase,
      'accounting_customer_invoices',
      invoiceId,
      actor
    );
    return {
      error: `Invoice not posted — journal entry failed: ${
        err instanceof Error ? err.message : 'unknown error'
      }`,
    };
  }

  return getAccountingInvoiceDetail(invoiceId);
}

export async function cancelAccountingInvoice(invoiceId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const loaded = await loadInvoiceRow(supabase, invoiceId);
    if ('error' in loaded) return { error: loaded.error };
    const row = loaded.invoice;

    const { getAccountingDocumentLockError } = await import(
      '@/lib/accounting-lock-dates'
    );
    const lockErr = await getAccountingDocumentLockError(
      row.organization_id ? String(row.organization_id) : scope.organizationId,
      row.invoice_date ? String(row.invoice_date) : null,
      'sale'
    );
    if (lockErr) return { error: lockErr };

    const amountPaid = Number(row.amount_paid) || 0;
    if (amountPaid > 0.004 && String(row.status) === 'posted') {
      return {
        error:
          'Cannot cancel a posted invoice with payments. Reset payments first or issue a credit note.',
      };
    }

    if (String(row.status) === 'posted') {
      const { cancelLinkedAccountingJournalEntry } = await import(
        '@/lib/accounting-je-lifecycle'
      );
      await cancelLinkedAccountingJournalEntry(supabase, {
        journalEntryId: row.journal_entry_id
          ? String(row.journal_entry_id)
          : null,
        sourceType: 'customer_invoice',
        sourceId: invoiceId,
        organizationId: row.organization_id
          ? String(row.organization_id)
          : scope.organizationId,
        performedBy: scope.session!.username,
        reason: 'invoice_cancelled',
      });
      await supabase
        .from('accounting_customer_invoices')
        .update({
          journal_entry_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to cancel invoice',
    };
  }
  return transitionStatus(invoiceId, 'cancelled', 'cancelled', {
    allowFrom: ['draft', 'posted'],
  });
}

export async function resetAccountingInvoiceToDraft(invoiceId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const loaded = await loadInvoiceRow(supabase, invoiceId);
    if ('error' in loaded) return { error: loaded.error };
    const row = loaded.invoice;
    const from = String(row.status) as AccountingInvoiceStatus;

    if (!['posted', 'cancelled'].includes(from)) {
      return { error: `Cannot reset to draft from status "${from}"` };
    }

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Invoice not in the selected organization' };
    }

    // Block when payments exist (Odoo: cannot reset paid / in-payment with payments).
    const amountPaid = Number(row.amount_paid) || 0;
    if (amountPaid > 0.004) {
      return { error: 'Cannot reset to draft while payments exist on this invoice.' };
    }

    const { getAccountingDocumentLockError } = await import(
      '@/lib/accounting-lock-dates'
    );
    const resetLockErr = await getAccountingDocumentLockError(
      row.organization_id ? String(row.organization_id) : scope.organizationId,
      row.invoice_date ? String(row.invoice_date) : null,
      'sale'
    );
    if (resetLockErr) return { error: resetLockErr };

    const previousJeId = row.journal_entry_id
      ? String(row.journal_entry_id)
      : null;
    let cancelledJeId: string | null = null;

    // Odoo: Reset to Draft removes the active journal entry from accounting.
    if (previousJeId) {
      const { data: je } = await supabase
        .from('accounting_journal_entries')
        .select('id, status')
        .eq('id', previousJeId)
        .maybeSingle();
      if (je && String(je.status) !== 'cancelled') {
        await supabase
          .from('accounting_journal_entries')
          .update({
            status: 'cancelled',
            updated_by: scope.session!.username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', previousJeId);
        cancelledJeId = previousJeId;
        try {
          await supabase.from('accounting_journal_entry_logs').insert([
            {
              journal_entry_id: previousJeId,
              organization_id: row.organization_id
                ? String(row.organization_id)
                : null,
              action: 'cancelled',
              performed_by: scope.session!.username,
              previous_status: String(je.status),
              new_status: 'cancelled',
              details: {
                reason: 'invoice_reset_to_draft',
                invoice_id: invoiceId,
              },
            },
          ]);
        } catch {
          /* best-effort log */
        }
      }
    } else {
      // Fallback: cancel any active JE linked by source.
      const { data: bySource } = await supabase
        .from('accounting_journal_entries')
        .select('id, status')
        .eq('source_type', 'customer_invoice')
        .eq('source_id', invoiceId)
        .neq('status', 'cancelled')
        .maybeSingle();
      if (bySource?.id) {
        await supabase
          .from('accounting_journal_entries')
          .update({
            status: 'cancelled',
            updated_by: scope.session!.username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bySource.id);
        cancelledJeId = String(bySource.id);
      }
    }

    const { error } = await supabase
      .from('accounting_customer_invoices')
      .update({
        status: 'draft',
        posted_at: null,
        cancelled_at: null,
        journal_entry_id: null,
        payment_state: 'not_paid',
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    if (error) {
      if (/payment_state|journal_entry_id|column/i.test(error.message)) {
        const retry = await supabase
          .from('accounting_customer_invoices')
          .update({
            status: 'draft',
            posted_at: null,
            cancelled_at: null,
            updated_by: scope.session!.username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', invoiceId);
        if (retry.error) return { error: retry.error.message };
        // Best-effort clear JE link separately.
        await supabase
          .from('accounting_customer_invoices')
          .update({ journal_entry_id: null })
          .eq('id', invoiceId);
      } else {
        return { error: error.message };
      }
    }

    await appendLog(supabase, {
      invoiceId,
      action: 'reset_to_draft',
      previousStatus: from,
      newStatus: 'draft',
      performedBy: scope.session!.username,
      details: {
        journal_entry_removed: Boolean(cancelledJeId || previousJeId),
        journal_entry_id: cancelledJeId || previousJeId,
      },
    });

    if (cancelledJeId || previousJeId) {
      await appendLog(supabase, {
        invoiceId,
        action: 'journal_entry_removed',
        previousStatus: from,
        newStatus: 'draft',
        performedBy: scope.session!.username,
        details: {
          journal_entry_id: cancelledJeId || previousJeId,
        },
      });
    }

    return getAccountingInvoiceDetail(invoiceId);
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to reset invoice to draft',
    };
  }
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
