'use server';

import { createAdminClient } from '@/utils/supabase/server';
import {
  allocateBillNumber,
  getAccountingBillDetail,
  type AccountingBillStatus,
} from '@/app/actions/accounting/bills';
import {
  computeBillTotals,
  resolveVendorAccountingScope,
} from '@/lib/accounting-vendor-scope';
import { computeBillLineTotal } from '@/lib/accounting-bill-math';

export type AccountingBillLog = {
  id: string;
  bill_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  performed_by: string | null;
  performed_at: string;
  details: Record<string, unknown>;
};

export type UpdateAccountingBillInput = {
  vendor_name?: string;
  contact_id?: string | null;
  vendor_lead_id?: string | null;
  billing_address?: string | null;
  contact_person_name?: string | null;
  email?: string | null;
  phone?: string | null;
  bill_date?: string;
  due_date?: string | null;
  payment_terms?: string | null;
  reference?: string | null;
  notes?: string | null;
  vendor_notes?: string | null;
  lines?: {
    sequence?: number;
    product_name: string;
    description?: string | null;
    quantity: number;
    uom?: string;
    unit_price: number;
    discount?: number;
    taxes?: number;
    line_total?: number;
  }[];
};

async function appendLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  opts: {
    billId: string;
    action: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    performedBy?: string | null;
    details?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('accounting_vendor_bill_logs').insert([
      {
        bill_id: opts.billId,
        action: opts.action,
        previous_status: opts.previousStatus ?? null,
        new_status: opts.newStatus ?? null,
        performed_by: opts.performedBy ?? null,
        details: opts.details || {},
      },
    ]);
  } catch {
    // optional
  }
}

export async function updateAccountingBill(
  billId: string,
  payload: UpdateAccountingBillInput
) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error: loadError } = await supabase
      .from('accounting_vendor_bills')
      .select('*')
      .eq('id', billId)
      .maybeSingle();

    if (loadError || !row) return { error: loadError?.message || 'Bill not found' };
    if (String(row.status) !== 'draft') {
      return { error: 'Only draft bills can be edited' };
    }
    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Bill not in the selected organization' };
    }

    const lines = payload.lines;
    const totals = lines ? computeBillTotals(lines) : null;

    const nextBillDate =
      payload.bill_date !== undefined ? payload.bill_date : row.bill_date;
    const nextTerms =
      payload.payment_terms !== undefined ? payload.payment_terms : row.payment_terms;
    let nextDueDate =
      payload.due_date !== undefined ? payload.due_date : row.due_date;

    if (
      payload.due_date === undefined &&
      (payload.payment_terms !== undefined || payload.bill_date !== undefined)
    ) {
      const { computeDueDateFromTerms } = await import('@/lib/accounting-due-dates');
      nextDueDate =
        computeDueDateFromTerms(
          nextBillDate ? String(nextBillDate) : null,
          nextTerms ? String(nextTerms) : null
        ) || nextDueDate;
    }

    const residual =
      totals != null
        ? Math.max(0, totals.total_amount - (Number(row.amount_paid) || 0))
        : undefined;

    const { error: updError } = await supabase
      .from('accounting_vendor_bills')
      .update({
        vendor_name:
          payload.vendor_name !== undefined ? payload.vendor_name : row.vendor_name,
        contact_id:
          payload.contact_id !== undefined ? payload.contact_id : row.contact_id,
        vendor_lead_id:
          payload.vendor_lead_id !== undefined
            ? payload.vendor_lead_id
            : row.vendor_lead_id,
        billing_address:
          payload.billing_address !== undefined
            ? payload.billing_address
            : row.billing_address,
        contact_person_name:
          payload.contact_person_name !== undefined
            ? payload.contact_person_name
            : row.contact_person_name,
        email: payload.email !== undefined ? payload.email : row.email,
        phone: payload.phone !== undefined ? payload.phone : row.phone,
        bill_date: nextBillDate,
        due_date: nextDueDate,
        payment_terms: nextTerms,
        reference:
          payload.reference !== undefined ? payload.reference : row.reference,
        notes: payload.notes !== undefined ? payload.notes : row.notes,
        vendor_notes:
          payload.vendor_notes !== undefined
            ? payload.vendor_notes
            : row.vendor_notes,
        ...(totals || {}),
        ...(residual != null ? { amount_residual: residual } : {}),
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId);

    if (updError) return { error: updError.message };

    if (lines) {
      await supabase.from('accounting_vendor_bill_lines').delete().eq('bill_id', billId);
      if (lines.length) {
        const { error: lineErr } = await supabase
          .from('accounting_vendor_bill_lines')
          .insert(
            lines.map((l, idx) => ({
              bill_id: billId,
              sequence: l.sequence || (idx + 1) * 10,
              product_name: l.product_name || '',
              description: l.description || null,
              quantity: Number(l.quantity) || 0,
              uom: l.uom || 'Units',
              unit_price: Number(l.unit_price) || 0,
              discount: Number(l.discount) || 0,
              taxes: Number(l.taxes) || 0,
              line_total:
                Number(l.line_total) ||
                computeBillLineTotal(l),
            }))
          );
        if (lineErr) return { error: lineErr.message };
      }
    }

    await appendLog(supabase, {
      billId,
      action: 'updated',
      previousStatus: String(row.status),
      newStatus: String(row.status),
      performedBy: scope.session!.username,
      details: {
        total_amount: totals?.total_amount ?? row.total_amount,
        previous_total: row.total_amount,
      },
    });

    return getAccountingBillDetail(billId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to save bill',
    };
  }
}

async function transitionStatus(
  billId: string,
  to: AccountingBillStatus,
  action: string,
  opts?: { allowFrom?: AccountingBillStatus[]; details?: Record<string, unknown> }
) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_vendor_bills')
      .select('*')
      .eq('id', billId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Bill not found' };

    const from = String(row.status) as AccountingBillStatus;
    if (opts?.allowFrom && !opts.allowFrom.includes(from)) {
      return { error: `Cannot ${action} from status "${from}"` };
    }
    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Bill not in the selected organization' };
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

    const { error: updError } = await supabase
      .from('accounting_vendor_bills')
      .update(patch)
      .eq('id', billId);
    if (updError) return { error: updError.message };

    await appendLog(supabase, {
      billId,
      action,
      previousStatus: from,
      newStatus: to,
      performedBy: scope.session!.username,
      details: opts?.details || {},
    });

    return getAccountingBillDetail(billId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : `Failed to ${action}`,
    };
  }
}

export async function postAccountingBill(billId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from('accounting_vendor_bills')
      .select('*')
      .eq('id', billId)
      .maybeSingle();
    if (!row) return { error: 'Bill not found' };
    if (String(row.status) !== 'draft') {
      return { error: `Cannot post from status "${row.status}"` };
    }
    if (!String(row.vendor_name || '').trim() && !row.contact_id) {
      return { error: 'Vendor is required before posting' };
    }

    const { data: lines } = await supabase
      .from('accounting_vendor_bill_lines')
      .select('product_name, quantity, line_total')
      .eq('bill_id', billId);

    const productLines = (lines || []).filter(
      (l) => String(l.product_name || '').trim() || Number(l.line_total) > 0
    );
    if (!productLines.length) {
      return { error: 'Add at least one bill line before posting' };
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post bill',
    };
  }

  return transitionStatus(billId, 'posted', 'posted', { allowFrom: ['draft'] });
}

export async function cancelAccountingBill(billId: string) {
  return transitionStatus(billId, 'cancelled', 'cancelled', {
    allowFrom: ['draft', 'posted'],
  });
}

export async function resetAccountingBillToDraft(billId: string) {
  return transitionStatus(billId, 'draft', 'reset_to_draft', {
    allowFrom: ['posted', 'cancelled'],
  });
}

export async function duplicateAccountingBill(billId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const detailRes = await getAccountingBillDetail(billId);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const source = detailRes.bill!;
    if (!source.organization_id && !scope.organizationId) {
      return { error: 'Select an organization to duplicate' };
    }

    const supabase = await createAdminClient();
    const orgId = (source.organization_id || scope.organizationId) ?? null;
    if (!orgId) return { error: 'Organization required' };

    const billNumber = await allocateBillNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);

    const { data: bill, error } = await supabase
      .from('accounting_vendor_bills')
      .insert([
        {
          organization_id: orgId,
          bill_number: billNumber,
          status: 'draft',
          payment_state: 'not_paid',
          contact_id: source.contact_id,
          vendor_name: source.vendor_name,
          vendor_lead_id: source.vendor_lead_id,
          reference: source.reference,
          payment_terms: source.payment_terms || 'Immediate',
          bill_date: today,
          due_date: source.due_date,
          billing_address: source.billing_address,
          contact_person_name: source.contact_person_name,
          email: source.email,
          phone: source.phone,
          notes: source.notes,
          vendor_notes: source.vendor_notes,
          untaxed_amount: source.untaxed_amount,
          tax_amount: source.tax_amount,
          total_amount: source.total_amount,
          amount_paid: 0,
          amount_residual: source.total_amount,
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (error || !bill) return { error: error?.message || 'Failed to duplicate' };

    if (source.lines.length) {
      await supabase.from('accounting_vendor_bill_lines').insert(
        source.lines.map((l, idx) => ({
          bill_id: bill.id,
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
      billId: String(bill.id),
      action: 'created',
      newStatus: 'draft',
      performedBy: scope.session!.username,
      details: {
        duplicated_from: billId,
        bill_number: billNumber,
      },
    });
    await appendLog(supabase, {
      billId,
      action: 'duplicated',
      previousStatus: source.status,
      newStatus: source.status,
      performedBy: scope.session!.username,
      details: { new_bill_id: bill.id, new_bill_number: billNumber },
    });

    return { billId: String(bill.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to duplicate bill',
    };
  }
}

export async function getAccountingBillActivity(billId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_vendor_bill_logs')
      .select('*')
      .eq('bill_id', billId)
      .order('performed_at', { ascending: false })
      .limit(200);

    if (error) {
      if (/accounting_vendor_bill_logs|relation/i.test(error.message)) {
        return { logs: [] as AccountingBillLog[] };
      }
      return { error: error.message };
    }

    const logs: AccountingBillLog[] = (data || []).map((r) => ({
      id: String(r.id),
      bill_id: String(r.bill_id),
      action: String(r.action || ''),
      previous_status: r.previous_status ? String(r.previous_status) : null,
      new_status: r.new_status ? String(r.new_status) : null,
      performed_by: r.performed_by ? String(r.performed_by) : null,
      performed_at: String(r.performed_at || ''),
      details: (r.details as Record<string, unknown>) || {},
    }));

    return { logs };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load activity',
    };
  }
}

export async function postAccountingBillNote(billId: string, note: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const text = String(note || '').trim();
    if (!text) return { error: 'Note is required' };

    const supabase = await createAdminClient();
    await appendLog(supabase, {
      billId,
      action: 'log_note',
      performedBy: scope.session!.username,
      details: { note: text },
    });
    return getAccountingBillActivity(billId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post note',
    };
  }
}

export async function logAccountingBillPdfAction(
  billId: string,
  action: 'previewed' | 'printed'
) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    await appendLog(supabase, {
      billId,
      action,
      performedBy: scope.session!.username,
    });
    return { ok: true as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to log action',
    };
  }
}
