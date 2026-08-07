'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getAccountingInvoiceDetail } from '@/app/actions/accounting/invoices';

export type CreditNoteStatus = 'draft' | 'posted' | 'cancelled';

export type AccountingCreditNoteLine = {
  id: string;
  sequence: number;
  invoice_line_id: string | null;
  product_id?: string | null;
  product_name: string;
  description: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  discount: number;
  taxes: number;
  line_total: number;
};

export type AccountingCreditNoteDetail = {
  id: string;
  credit_note_number: string;
  status: CreditNoteStatus;
  payment_state: 'not_paid' | 'in_payment' | 'partial' | 'paid';
  invoice_id: string | null;
  invoice_number: string | null;
  contact_id: string | null;
  customer_name: string;
  customer_lead_id: string | null;
  reason: string | null;
  refund_type: 'full' | 'partial';
  salesperson_name: string | null;
  credit_note_date: string;
  billing_address: string | null;
  shipping_address: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  customer_notes: string | null;
  untaxed_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_refunded: number;
  organization_id: string | null;
  organization_name: string | null;
  company_address: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_website: string | null;
  logo_url: string | null;
  lines: AccountingCreditNoteLine[];
};

export type AccountingRefundListItem = {
  id: string;
  refund_date: string;
  amount: number;
  refund_type: string;
  payment_method: string;
  reference: string | null;
  refunded_by: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  credit_note_id: string | null;
  credit_note_number: string | null;
  organization_name: string | null;
  created_at: string;
};

async function resolveScope(opts?: { creditNotes?: boolean; refunds?: boolean }) {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const { requireAccountingActionAccess } = await import('@/lib/accounting-page-access');
  const gate = await requireAccountingActionAccess({
    creditNotes: opts?.creditNotes,
    refunds: opts?.refunds,
  });
  if ('error' in gate) return { error: gate.error };

  const session = gate.session!;
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

async function allocateCreditNoteNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null
) {
  const now = new Date();
  const y = now.getFullYear();
  const fy = `${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;

  if (organizationId) {
    try {
      const { data: seq } = await supabase
        .from('accounting_credit_note_sequences')
        .select('prefix, next_number')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (seq) {
        const next = Math.max(1, Number(seq.next_number) || 1);
        const prefix = String(seq.prefix || 'RINV');
        await supabase
          .from('accounting_credit_note_sequences')
          .update({ next_number: next + 1, updated_at: new Date().toISOString() })
          .eq('organization_id', organizationId);
        return `${prefix}/${fy}/${String(next).padStart(4, '0')}`;
      }
      await supabase.from('accounting_credit_note_sequences').insert([
        { organization_id: organizationId, prefix: 'RINV', next_number: 2 },
      ]);
      return `RINV/${fy}/0001`;
    } catch {
      // fall through
    }
  }
  return `RINV/${fy}/${String(Date.now()).slice(-4)}`;
}

function mapCreditNoteDetail(
  cn: Record<string, unknown>,
  lines: Record<string, unknown>[],
  org: {
    organization_name?: string | null;
    company_address?: string | null;
    company_email?: string | null;
    company_phone?: string | null;
    company_website?: string | null;
    logo_url?: string | null;
  }
): AccountingCreditNoteDetail {
  return {
    id: String(cn.id),
    credit_note_number: String(cn.credit_note_number || ''),
    status: (String(cn.status || 'draft') as CreditNoteStatus) || 'draft',
    payment_state: (['not_paid', 'in_payment', 'partial', 'paid'].includes(
      String(cn.payment_state || '')
    )
      ? String(cn.payment_state)
      : Number(cn.amount_refunded) > 0.004
        ? Number(cn.amount_refunded) >= (Number(cn.total_amount) || 0) - 0.004
          ? 'paid'
          : 'partial'
        : 'not_paid') as AccountingCreditNoteDetail['payment_state'],
    invoice_id: cn.invoice_id ? String(cn.invoice_id) : null,
    invoice_number: cn.invoice_number ? String(cn.invoice_number) : null,
    contact_id: cn.contact_id ? String(cn.contact_id) : null,
    customer_name: String(cn.customer_name || ''),
    customer_lead_id: cn.customer_lead_id ? String(cn.customer_lead_id) : null,
    reason: cn.reason ? String(cn.reason) : null,
    refund_type: (String(cn.refund_type || 'full') as 'full' | 'partial') || 'full',
    salesperson_name: cn.salesperson_name ? String(cn.salesperson_name) : null,
    credit_note_date: String(cn.credit_note_date || ''),
    billing_address: cn.billing_address ? String(cn.billing_address) : null,
    shipping_address: cn.shipping_address ? String(cn.shipping_address) : null,
    contact_person_name: cn.contact_person_name
      ? String(cn.contact_person_name)
      : null,
    email: cn.email ? String(cn.email) : null,
    phone: cn.phone ? String(cn.phone) : null,
    notes: cn.notes ? String(cn.notes) : null,
    customer_notes: cn.customer_notes ? String(cn.customer_notes) : null,
    untaxed_amount: Number(cn.untaxed_amount) || 0,
    tax_amount: Number(cn.tax_amount) || 0,
    total_amount: Number(cn.total_amount) || 0,
    amount_refunded: Number(cn.amount_refunded) || 0,
    organization_id: cn.organization_id ? String(cn.organization_id) : null,
    organization_name: org.organization_name || null,
    company_address: org.company_address || null,
    company_email: org.company_email || null,
    company_phone: org.company_phone || null,
    company_website: org.company_website || null,
    logo_url: org.logo_url || null,
    lines: lines.map((l) => ({
      id: String(l.id),
      sequence: Number(l.sequence) || 0,
      invoice_line_id: l.invoice_line_id ? String(l.invoice_line_id) : null,
      product_id: (l as { product_id?: string | null }).product_id
        ? String((l as { product_id?: string | null }).product_id)
        : null,
      product_name: String(l.product_name || ''),
      description: l.description ? String(l.description) : null,
      quantity: Number(l.quantity) || 0,
      uom: String(l.uom || 'Units'),
      unit_price: Number(l.unit_price) || 0,
      discount: Number(l.discount) || 0,
      taxes: Number(l.taxes) || 0,
      line_total: Number(l.line_total) || 0,
    })),
  };
}

async function loadOrgBrand(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null
) {
  if (!organizationId) {
    return {
      organization_name: null as string | null,
      company_address: null as string | null,
      company_email: null as string | null,
      company_phone: null as string | null,
      company_website: null as string | null,
      logo_url: null as string | null,
    };
  }
  const { data: org } = await supabase
    .from('organizations')
    .select(
      'organization_name, email, phone, address, street, city, country, website, logo_url'
    )
    .eq('id', organizationId)
    .maybeSingle();
  if (!org) {
    return {
      organization_name: null,
      company_address: null,
      company_email: null,
      company_phone: null,
      company_website: null,
      logo_url: null,
    };
  }
  const addrParts = [org.address || org.street, org.city, org.country]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return {
    organization_name: org.organization_name ? String(org.organization_name) : null,
    company_address: addrParts.length ? addrParts.join(', ') : null,
    company_email: org.email ? String(org.email) : null,
    company_phone: org.phone ? String(org.phone) : null,
    company_website: org.website ? String(org.website) : null,
    logo_url: org.logo_url ? String(org.logo_url) : null,
  };
}

/**
 * Odoo-style New Credit Note: create an empty Draft, then open the form.
 */
export async function createManualAccountingCreditNote() {
  try {
    const scope = await resolveScope({ creditNotes: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (scope.isGlobalAdminView || !scope.organizationId) {
      return { error: 'Select an organization to create credit notes' };
    }

    const supabase = await createAdminClient();
    const orgId = scope.organizationId;
    const number = await allocateCreditNoteNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);

    const { data: cn, error } = await supabase
      .from('accounting_credit_notes')
      .insert([
        {
          organization_id: orgId,
          credit_note_number: number,
          status: 'draft',
          invoice_id: null,
          invoice_number: null,
          contact_id: null,
          customer_name: '',
          customer_lead_id: null,
          reason: null,
          refund_type: 'partial',
          salesperson_name: null,
          credit_note_date: today,
          billing_address: null,
          shipping_address: null,
          contact_person_name: null,
          email: null,
          phone: null,
          notes: null,
          customer_notes: null,
          untaxed_amount: 0,
          tax_amount: 0,
          total_amount: 0,
          amount_refunded: 0,
          payment_state: 'not_paid',
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (error || !cn) {
      if (error && /accounting_credit_notes|relation|schema cache/i.test(error.message)) {
        return {
          error:
            'Run create_accounting_credit_notes_phase6_7.sql migration to enable credit notes.',
        };
      }
      return { error: error?.message || 'Failed to create credit note' };
    }

    await supabase.from('accounting_credit_note_lines').insert([
      {
        credit_note_id: cn.id,
        sequence: 10,
        product_name: '',
        description: null,
        quantity: 1,
        uom: 'Units',
        unit_price: 0,
        discount: 0,
        taxes: 0,
        line_total: 0,
      },
    ]);

    try {
      const { writeAccountingAuditLog } = await import(
        '@/app/actions/accounting/automation'
      );
      await writeAccountingAuditLog({
        organizationId: orgId,
        entityType: 'credit_note',
        entityId: String(cn.id),
        action: 'created',
        performedBy: scope.session!.username,
        newValue: { status: 'draft', credit_note_number: number },
        details: { source: 'manual' },
      });
    } catch {
      // soft
    }

    return { creditNoteId: String(cn.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create credit note',
    };
  }
}

export type UpdateAccountingCreditNoteInput = {
  customer_name?: string;
  contact_id?: string | null;
  customer_lead_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  reason?: string | null;
  refund_type?: 'full' | 'partial';
  salesperson_name?: string | null;
  credit_note_date?: string;
  billing_address?: string | null;
  shipping_address?: string | null;
  contact_person_name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  customer_notes?: string | null;
  lines?: Array<{
    id?: string;
    sequence: number;
    invoice_line_id?: string | null;
    product_name: string;
    description?: string | null;
    quantity: number;
    uom?: string;
    unit_price: number;
    discount?: number;
    taxes?: number;
    line_total: number;
  }>;
};

export async function updateAccountingCreditNote(
  creditNoteId: string,
  payload: UpdateAccountingCreditNoteInput
) {
  try {
    const scope = await resolveScope({ creditNotes: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error: loadError } = await supabase
      .from('accounting_credit_notes')
      .select('*')
      .eq('id', creditNoteId)
      .maybeSingle();

    if (loadError || !row) {
      return { error: loadError?.message || 'Credit note not found' };
    }
    if (String(row.status) !== 'draft') {
      return { error: 'Only draft credit notes can be edited' };
    }
    const { getAccountingDocumentLockError } = await import('@/lib/accounting-lock-dates');
    const cnEditLock = await getAccountingDocumentLockError(
      row.organization_id ? String(row.organization_id) : null,
      (payload.credit_note_date !== undefined
        ? payload.credit_note_date
        : row.credit_note_date)
        ? String(
            payload.credit_note_date !== undefined
              ? payload.credit_note_date
              : row.credit_note_date
          )
        : null,
      'sale'
    );
    if (cnEditLock) return { error: cnEditLock };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Credit note not in the selected organization' };
    }

    let untaxed = Number(row.untaxed_amount) || 0;
    let tax = Number(row.tax_amount) || 0;
    let total = Number(row.total_amount) || 0;

    if (payload.lines) {
      untaxed = 0;
      tax = 0;
      for (const line of payload.lines) {
        const qty = Number(line.quantity) || 0;
        const price = Number(line.unit_price) || 0;
        const discount = Number(line.discount) || 0;
        const taxPct = Number(line.taxes) || 0;
        const base = qty * price * (1 - discount / 100);
        const taxAmt = base * (taxPct / 100);
        untaxed += base;
        tax += taxAmt;
      }
      untaxed = round2(untaxed);
      tax = round2(tax);
      total = round2(untaxed + tax);
    }

    const { error: updError } = await supabase
      .from('accounting_credit_notes')
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
        invoice_id:
          payload.invoice_id !== undefined ? payload.invoice_id : row.invoice_id,
        invoice_number:
          payload.invoice_number !== undefined
            ? payload.invoice_number
            : row.invoice_number,
        reason: payload.reason !== undefined ? payload.reason : row.reason,
        refund_type:
          payload.refund_type !== undefined ? payload.refund_type : row.refund_type,
        salesperson_name:
          payload.salesperson_name !== undefined
            ? payload.salesperson_name
            : row.salesperson_name,
        credit_note_date:
          payload.credit_note_date !== undefined
            ? payload.credit_note_date
            : row.credit_note_date,
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
        notes: payload.notes !== undefined ? payload.notes : row.notes,
        customer_notes:
          payload.customer_notes !== undefined
            ? payload.customer_notes
            : row.customer_notes,
        untaxed_amount: untaxed,
        tax_amount: tax,
        total_amount: total,
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', creditNoteId);

    if (updError) return { error: updError.message };

    if (payload.lines) {
      await supabase
        .from('accounting_credit_note_lines')
        .delete()
        .eq('credit_note_id', creditNoteId);

      if (payload.lines.length) {
        await supabase.from('accounting_credit_note_lines').insert(
          payload.lines.map((l, idx) => {
            const qty = Number(l.quantity) || 0;
            const price = Number(l.unit_price) || 0;
            const discount = Number(l.discount) || 0;
            const taxPct = Number(l.taxes) || 0;
            const base = qty * price * (1 - discount / 100);
            const taxAmt = base * (taxPct / 100);
            return {
              credit_note_id: creditNoteId,
              sequence: l.sequence || (idx + 1) * 10,
              invoice_line_id: l.invoice_line_id || null,
              product_name: l.product_name || '',
              description: l.description || null,
              quantity: qty,
              uom: l.uom || 'Units',
              unit_price: price,
              discount,
              taxes: taxPct,
              line_total: round2(base + taxAmt),
            };
          })
        );
      }
    }

    return getAccountingCreditNoteDetail(creditNoteId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update credit note',
    };
  }
}

export async function resetAccountingCreditNoteToDraft(creditNoteId: string) {
  try {
    const scope = await resolveScope({ creditNotes: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: cn } = await supabase
      .from('accounting_credit_notes')
      .select('id, status, amount_refunded, journal_entry_id, organization_id, invoice_id')
      .eq('id', creditNoteId)
      .maybeSingle();
    if (!cn) return { error: 'Credit note not found' };
    if (Number(cn.amount_refunded) > 0.004) {
      return { error: 'Cannot reset a credit note that already has refunds' };
    }
    if (String(cn.status) === 'draft') {
      return getAccountingCreditNoteDetail(creditNoteId);
    }

    // Cancel linked journal entry (Odoo: draft docs have no active JE).
    const jeId = cn.journal_entry_id ? String(cn.journal_entry_id) : null;
    if (jeId) {
      const { data: je } = await supabase
        .from('accounting_journal_entries')
        .select('id, status')
        .eq('id', jeId)
        .maybeSingle();
      if (je && String(je.status) !== 'cancelled') {
        await supabase
          .from('accounting_journal_entries')
          .update({
            status: 'cancelled',
            updated_by: scope.session!.username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jeId);
      }
    } else {
      const { data: bySource } = await supabase
        .from('accounting_journal_entries')
        .select('id')
        .eq('source_type', 'credit_note')
        .eq('source_id', creditNoteId)
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
      }
    }

    await supabase
      .from('accounting_credit_notes')
      .update({
        status: 'draft',
        posted_at: null,
        cancelled_at: null,
        journal_entry_id: null,
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', creditNoteId);

    if (cn.invoice_id) {
      await supabase.from('accounting_invoice_logs').insert([
        {
          invoice_id: cn.invoice_id,
          action: 'journal_entry_removed',
          performed_by: scope.session!.username,
          details: {
            credit_note_id: creditNoteId,
            journal_entry_id: jeId,
            reason: 'credit_note_reset_to_draft',
          },
        },
      ]);
    }

    return getAccountingCreditNoteDetail(creditNoteId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to reset credit note',
    };
  }
}

/**
 * Create a draft Credit Note from a Posted/Paid invoice (Odoo Credit Note wizard).
 */
export async function createCreditNoteFromInvoice(
  invoiceId: string,
  opts?: {
    reason?: string;
    /** Accounting / reversal date (defaults today). */
    reversalDate?: string;
    /** Journal used when posting the credit note JE. */
    journalId?: string | null;
    /** full_refund | partial_refund | cancel_invoice */
    creditMethod?: 'full_refund' | 'partial_refund' | 'cancel_invoice';
    lineIds?: string[];
    quantities?: Record<string, number>;
    /** Odoo "Reverse" posts only when autoPost; draft otherwise. */
    autoPost?: boolean;
    /** Odoo "Reverse and Create Invoice" — post CN + open new draft invoice. */
    createReplacementInvoice?: boolean;
  }
) {
  try {
    const scope = await resolveScope({ creditNotes: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const detailRes = await getAccountingInvoiceDetail(invoiceId);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const inv = detailRes.invoice!;

    if (inv.status === 'draft' || inv.status === 'cancelled') {
      return { error: 'Credit notes require a Posted or Paid invoice' };
    }

    const supabase = await createAdminClient();
    const orgId = inv.organization_id || scope.organizationId;
    if (!orgId) return { error: 'Organization is required' };

    const method = opts?.creditMethod || 'full_refund';
    const isPartialMethod = method === 'partial_refund';

    let lines = inv.lines;
    if (opts?.lineIds?.length) {
      const set = new Set(opts.lineIds);
      lines = inv.lines.filter((l) => set.has(l.id));
    }
    if (!lines.length) return { error: 'Select at least one invoice line' };

    const lineRows = lines.map((l, idx) => {
      const qty =
        opts?.quantities?.[l.id] != null
          ? Number(opts.quantities[l.id])
          : Number(l.quantity) || 0;
      if (qty <= 0) return null;
      if (qty - (Number(l.quantity) || 0) > 0.004) {
        return { error: `Quantity for ${l.product_name} exceeds invoice quantity` };
      }
      const price = Number(l.unit_price) || 0;
      const discount = Number(l.discount) || 0;
      const taxPct = Number(l.taxes) || 0;
      const base = qty * price * (1 - discount / 100);
      const taxAmt = base * (taxPct / 100);
      return {
        sequence: (idx + 1) * 10,
        invoice_line_id: l.id,
        product_id: l.product_id || null,
        product_name: l.product_name,
        description: l.description,
        quantity: qty,
        uom: l.uom,
        unit_price: price,
        discount,
        taxes: taxPct,
        line_total: round2(base + taxAmt),
        _untaxed: round2(base),
        _tax: round2(taxAmt),
      };
    });

    const errLine = lineRows.find((l) => l && 'error' in l);
    if (errLine && 'error' in errLine) return { error: errLine.error };

    const validLines = lineRows.filter(Boolean) as NonNullable<(typeof lineRows)[number]>[];
    if (!validLines.length) return { error: 'No valid lines to credit' };

    const untaxed = round2(validLines.reduce((a, l) => a + (l._untaxed || 0), 0));
    const tax = round2(validLines.reduce((a, l) => a + (l._tax || 0), 0));
    const total = round2(untaxed + tax);
    const isPartial =
      isPartialMethod ||
      Boolean(opts?.lineIds?.length) ||
      validLines.some((l) => {
        const orig = inv.lines.find((x) => x.id === l.invoice_line_id);
        return orig && Number(l.quantity) < Number(orig.quantity);
      }) ||
      validLines.length < inv.lines.length;

    const number = await allocateCreditNoteNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);
    const reversalDate = String(opts?.reversalDate || today).slice(0, 10);
    const reasonText =
      opts?.reason?.trim() ||
      (method === 'cancel_invoice'
        ? `Cancel invoice ${inv.invoice_number}`
        : `Reversal of: ${inv.invoice_number}`);

    const { data: cn, error } = await supabase
      .from('accounting_credit_notes')
      .insert([
        {
          organization_id: orgId,
          credit_note_number: number,
          status: 'draft',
          invoice_id: invoiceId,
          invoice_number: inv.invoice_number,
          contact_id: inv.contact_id,
          customer_name: inv.customer_name,
          customer_lead_id: inv.customer_lead_id,
          reason: reasonText,
          refund_type: isPartial ? 'partial' : 'full',
          salesperson_name: inv.salesperson_name,
          credit_note_date: reversalDate,
          billing_address: inv.billing_address,
          shipping_address: inv.shipping_address,
          contact_person_name: inv.contact_person_name,
          email: inv.email,
          phone: inv.phone,
          notes: inv.notes,
          customer_notes: inv.customer_notes,
          untaxed_amount: untaxed,
          tax_amount: tax,
          total_amount: total,
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (error || !cn) {
      if (error && /accounting_credit_notes|relation|schema cache/i.test(error.message)) {
        return {
          error:
            'Run create_accounting_credit_notes_phase6_7.sql migration to enable credit notes.',
        };
      }
      return { error: error?.message || 'Failed to create credit note' };
    }

    const { error: cnLineErr } = await supabase
      .from('accounting_credit_note_lines')
      .insert(
        validLines.map((l) => ({
          credit_note_id: cn.id,
          sequence: l.sequence,
          invoice_line_id: l.invoice_line_id,
          product_id: (l as { product_id?: string | null }).product_id || null,
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
    if (cnLineErr && /product_id|column/i.test(cnLineErr.message)) {
      await supabase.from('accounting_credit_note_lines').insert(
        validLines.map((l) => ({
          credit_note_id: cn.id,
          sequence: l.sequence,
          invoice_line_id: l.invoice_line_id,
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

    await supabase.from('accounting_invoice_logs').insert([
      {
        invoice_id: invoiceId,
        action: 'credit_note_created',
        performed_by: scope.session!.username,
        details: {
          credit_note_id: cn.id,
          credit_note_number: number,
          amount: total,
          refund_type: isPartial ? 'partial' : 'full',
          credit_method: method,
          reversal_date: reversalDate,
          journal_id: opts?.journalId || null,
        },
      },
    ]);

    const creditNoteId = String(cn.id);
    let replacementInvoiceId: string | null = null;

    const shouldAutoPost =
      Boolean(opts?.autoPost) ||
      Boolean(opts?.createReplacementInvoice) ||
      method === 'cancel_invoice';

    if (shouldAutoPost) {
      const posted = await postAccountingCreditNote(creditNoteId, {
        journalId: opts?.journalId || null,
      });
      if ('error' in posted && posted.error) {
        return { error: posted.error, creditNoteId };
      }
    }

    if (method === 'cancel_invoice') {
      await supabase
        .from('accounting_customer_invoices')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          refund_status: 'refunded',
          updated_by: scope.session!.username,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      await supabase.from('accounting_invoice_logs').insert([
        {
          invoice_id: invoiceId,
          action: 'invoice_reversed',
          previous_status: inv.status,
          new_status: 'cancelled',
          performed_by: scope.session!.username,
          details: {
            credit_note_id: creditNoteId,
            credit_note_number: number,
            method: 'cancel_invoice',
          },
        },
      ]);
    }

    if (opts?.createReplacementInvoice) {
      const { duplicateAccountingInvoice } = await import(
        '@/app/actions/accounting/invoice-workflow'
      );
      const dup = await duplicateAccountingInvoice(invoiceId);
      if ('error' in dup && dup.error) {
        return {
          error: dup.error,
          creditNoteId,
        };
      }
      replacementInvoiceId = dup.invoiceId ? String(dup.invoiceId) : null;
      if (replacementInvoiceId) {
        await supabase.from('accounting_invoice_logs').insert([
          {
            invoice_id: invoiceId,
            action: 'invoice_reversed',
            performed_by: scope.session!.username,
            details: {
              credit_note_id: creditNoteId,
              replacement_invoice_id: replacementInvoiceId,
              method: 'reverse_and_create_invoice',
            },
          },
        ]);
      }
    }

    return { creditNoteId, replacementInvoiceId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create credit note',
    };
  }
}

export async function getAccountingCreditNoteDetail(creditNoteId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: cn, error } = await supabase
      .from('accounting_credit_notes')
      .select('*')
      .eq('id', creditNoteId)
      .maybeSingle();
    if (error || !cn) return { error: error?.message || 'Credit note not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      cn.organization_id &&
      String(cn.organization_id) !== scope.organizationId
    ) {
      return { error: 'Credit note not in the selected organization' };
    }

    const { data: lines } = await supabase
      .from('accounting_credit_note_lines')
      .select('*')
      .eq('credit_note_id', creditNoteId)
      .order('sequence', { ascending: true });

    const org = await loadOrgBrand(
      supabase,
      cn.organization_id ? String(cn.organization_id) : null
    );

    return {
      creditNote: mapCreditNoteDetail(cn, lines || [], org),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load credit note',
    };
  }
}

export async function postAccountingCreditNote(
  creditNoteId: string,
  opts?: { journalId?: string | null }
) {
  try {
    const scope = await resolveScope({ creditNotes: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: cn } = await supabase
      .from('accounting_credit_notes')
      .select('*')
      .eq('id', creditNoteId)
      .maybeSingle();
    if (!cn) return { error: 'Credit note not found' };
    if (String(cn.status) !== 'draft') {
      return { error: 'Only draft credit notes can be posted' };
    }
    const { getAccountingDocumentLockError } = await import('@/lib/accounting-lock-dates');
    const cnLockErr = await getAccountingDocumentLockError(
      cn.organization_id ? String(cn.organization_id) : null,
      cn.credit_note_date ? String(cn.credit_note_date) : null,
      'sale'
    );
    if (cnLockErr) return { error: cnLockErr };

    if (!String(cn.customer_name || '').trim() && !cn.contact_id) {
      return { error: 'Customer is required before posting' };
    }
    if (!(Number(cn.total_amount) > 0)) {
      return { error: 'Add at least one line with an amount before posting' };
    }

    await supabase
      .from('accounting_credit_notes')
      .update({
        status: 'posted',
        posted_at: new Date().toISOString(),
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', creditNoteId);

    if (cn.invoice_id) {
      const isFull = String(cn.refund_type) === 'full';
      const cnTotal = Math.round((Number(cn.total_amount) || 0) * 100) / 100;
      const { data: inv } = await supabase
        .from('accounting_customer_invoices')
        .select('id, total_amount, amount_paid, amount_residual')
        .eq('id', cn.invoice_id)
        .maybeSingle();

      const invTotal = Number(inv?.total_amount) || 0;
      const amountPaid = Number(inv?.amount_paid) || 0;
      const priorResidual =
        inv?.amount_residual != null
          ? Number(inv.amount_residual)
          : Math.max(0, invTotal - amountPaid);
      const nextResidual =
        Math.round(Math.max(0, priorResidual - cnTotal) * 100) / 100;
      const paymentState =
        nextResidual <= 0.004
          ? 'paid'
          : amountPaid > 0.004 || cnTotal > 0.004
            ? 'partial'
            : 'not_paid';

      const invPatch: Record<string, unknown> = {
        refund_status:
          isFull || nextResidual <= 0.004 ? 'refunded' : 'partial',
        amount_residual: nextResidual,
        payment_state: paymentState,
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      };
      if (nextResidual <= 0.004) {
        invPatch.status = 'paid';
      }

      await supabase
        .from('accounting_customer_invoices')
        .update(invPatch)
        .eq('id', cn.invoice_id);

      await supabase.from('accounting_invoice_logs').insert([
        {
          invoice_id: cn.invoice_id,
          action: 'credit_note_posted',
          performed_by: scope.session!.username,
          details: {
            credit_note_id: creditNoteId,
            credit_note_number: cn.credit_note_number,
            amount: cn.total_amount,
            amount_residual: nextResidual,
          },
        },
      ]);
    }

    try {
      const { postJournalEntryForCreditNote } = await import(
        '@/app/actions/accounting/journal-entries'
      );
      const je = await postJournalEntryForCreditNote(creditNoteId, {
        journalId: opts?.journalId || null,
      });
      if ('error' in je && je.error) {
        const { rollbackDocumentPostToDraft } = await import(
          '@/lib/accounting-je-lifecycle'
        );
        await rollbackDocumentPostToDraft(
          supabase,
          'accounting_credit_notes',
          creditNoteId,
          scope.session!.username
        );
        return {
          error: `Credit note not posted — journal entry failed: ${je.error}`,
        };
      }
    } catch (err) {
      const { rollbackDocumentPostToDraft } = await import(
        '@/lib/accounting-je-lifecycle'
      );
      await rollbackDocumentPostToDraft(
        supabase,
        'accounting_credit_notes',
        creditNoteId,
        scope.session!.username
      );
      return {
        error: `Credit note not posted — journal entry failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      };
    }

    return getAccountingCreditNoteDetail(creditNoteId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post credit note',
    };
  }
}

export async function cancelAccountingCreditNote(creditNoteId: string) {
  try {
    const scope = await resolveScope({ creditNotes: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: cn } = await supabase
      .from('accounting_credit_notes')
      .select(
        'id, status, organization_id, credit_note_date, journal_entry_id, invoice_id, total_amount, refund_type'
      )
      .eq('id', creditNoteId)
      .maybeSingle();
    if (!cn) return { error: 'Credit note not found' };
    if (String(cn.status) === 'cancelled') {
      return getAccountingCreditNoteDetail(creditNoteId);
    }

    const { getAccountingDocumentLockError } = await import(
      '@/lib/accounting-lock-dates'
    );
    const cnCancelLock = await getAccountingDocumentLockError(
      cn.organization_id ? String(cn.organization_id) : scope.organizationId,
      cn.credit_note_date ? String(cn.credit_note_date) : null,
      'sale'
    );
    if (cnCancelLock) return { error: cnCancelLock };

    if (String(cn.status) === 'posted') {
      const { cancelLinkedAccountingJournalEntry } = await import(
        '@/lib/accounting-je-lifecycle'
      );
      await cancelLinkedAccountingJournalEntry(supabase, {
        journalEntryId: cn.journal_entry_id
          ? String(cn.journal_entry_id)
          : null,
        sourceType: 'credit_note',
        sourceId: creditNoteId,
        organizationId: cn.organization_id
          ? String(cn.organization_id)
          : scope.organizationId,
        performedBy: scope.session!.username,
        reason: 'credit_note_cancelled',
      });

      if (cn.invoice_id) {
        const cnTotal = Math.round((Number(cn.total_amount) || 0) * 100) / 100;
        const { data: inv } = await supabase
          .from('accounting_customer_invoices')
          .select('id, total_amount, amount_paid, amount_residual, refund_status')
          .eq('id', cn.invoice_id)
          .maybeSingle();
        if (inv) {
          const invTotal = Number(inv.total_amount) || 0;
          const amountPaid = Number(inv.amount_paid) || 0;
          const priorResidual =
            inv.amount_residual != null
              ? Number(inv.amount_residual)
              : Math.max(0, invTotal - amountPaid);
          const restored =
            Math.round((priorResidual + cnTotal) * 100) / 100;
          const capped = Math.min(restored, Math.max(0, invTotal - amountPaid));
          await supabase
            .from('accounting_customer_invoices')
            .update({
              amount_residual: capped,
              refund_status: capped >= invTotal - amountPaid - 0.004 ? 'none' : 'partial',
              payment_state:
                capped <= 0.004
                  ? 'paid'
                  : amountPaid > 0.004
                    ? 'partial'
                    : 'not_paid',
              status: capped <= 0.004 ? 'paid' : 'posted',
              updated_by: scope.session!.username,
              updated_at: new Date().toISOString(),
            })
            .eq('id', cn.invoice_id);
        }
      }
    }

    await supabase
      .from('accounting_credit_notes')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        journal_entry_id: null,
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', creditNoteId);

    return getAccountingCreditNoteDetail(creditNoteId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to cancel credit note',
    };
  }
}

/**
 * Issue a refund / payment against a posted credit note (Odoo Pay wizard).
 * Bank → In Payment (outstanding); Cash → applies refund immediately.
 */
export async function issueAccountingRefund(opts: {
  creditNoteId: string;
  amount: number;
  refund_date?: string;
  payment_method?: 'cash' | 'bank_transfer' | 'cheque';
  reference?: string;
  notes?: string;
  journal?: 'bank' | 'cash' | null;
}) {
  try {
    const scope = await resolveScope({ refunds: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const amount = round2(Number(opts.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Payment amount must be greater than zero' };
    }

    const supabase = await createAdminClient();
    const { data: cn } = await supabase
      .from('accounting_credit_notes')
      .select('*')
      .eq('id', opts.creditNoteId)
      .maybeSingle();
    if (!cn) return { error: 'Credit note not found' };
    if (String(cn.status) !== 'posted') {
      return { error: 'Payments require a Posted credit note' };
    }

    const method = opts.payment_method || 'bank_transfer';
    const journal =
      opts.journal === 'cash' || opts.journal === 'bank'
        ? opts.journal
        : method === 'cash'
          ? ('cash' as const)
          : ('bank' as const);

    const { data: existingRefunds } = await supabase
      .from('accounting_refunds')
      .select('amount')
      .eq('credit_note_id', opts.creditNoteId);
    const refundsSum = round2(
      (existingRefunds || []).reduce((a, r) => a + (Number(r.amount) || 0), 0)
    );

    const total = Number(cn.total_amount) || 0;
    const remainingByRefunds = round2(Math.max(0, total - refundsSum));
    if (amount - remainingByRefunds > 0.004) {
      return {
        error: `Amount cannot exceed remaining credit (${remainingByRefunds.toFixed(2)})`,
      };
    }

    const orgId = cn.organization_id
      ? String(cn.organization_id)
      : scope.organizationId;
    if (!orgId) return { error: 'Organization is required' };

    const { data: refund, error } = await supabase
      .from('accounting_refunds')
      .insert([
        {
          organization_id: orgId,
          invoice_id: cn.invoice_id || null,
          credit_note_id: opts.creditNoteId,
          contact_id: cn.contact_id || null,
          refund_date: opts.refund_date || new Date().toISOString().slice(0, 10),
          amount,
          refund_type: amount >= remainingByRefunds - 0.004 ? 'full' : 'partial',
          payment_method: method,
          reference: opts.reference || null,
          notes: opts.notes || null,
          refunded_by: scope.session!.username,
          created_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (error || !refund) {
      if (error && /accounting_refunds|relation/i.test(error.message)) {
        return {
          error:
            'Run create_accounting_credit_notes_phase6_7.sql migration to enable refunds.',
        };
      }
      return { error: error?.message || 'Failed to create payment' };
    }

    const nextRefundsSum = round2(refundsSum + amount);
    const updatePayload: Record<string, unknown> = {
      updated_by: scope.session!.username,
      updated_at: new Date().toISOString(),
    };

    if (journal === 'bank') {
      // Odoo outstanding: In Payment, Amount Due stays until reconcile
      updatePayload.payment_state = 'in_payment';
    } else {
      const already = Number(cn.amount_refunded) || 0;
      const nextPaid = round2(already + amount);
      updatePayload.amount_refunded = nextPaid;
      updatePayload.payment_state =
        nextPaid >= total - 0.004 ? 'paid' : 'partial';
    }

    let { error: updError } = await supabase
      .from('accounting_credit_notes')
      .update(updatePayload)
      .eq('id', opts.creditNoteId);

    if (updError && /payment_state|column/i.test(updError.message)) {
      delete updatePayload.payment_state;
      if (journal === 'cash') {
        const already = Number(cn.amount_refunded) || 0;
        updatePayload.amount_refunded = round2(already + amount);
      }
      const retry = await supabase
        .from('accounting_credit_notes')
        .update(updatePayload)
        .eq('id', opts.creditNoteId);
      updError = retry.error;
    }
    if (updError) return { error: updError.message };

    if (cn.invoice_id) {
      await supabase.from('accounting_invoice_logs').insert([
        {
          invoice_id: cn.invoice_id,
          action: 'refund_issued',
          performed_by: scope.session!.username,
          details: {
            refund_id: refund.id,
            credit_note_id: opts.creditNoteId,
            amount,
            payment_state: updatePayload.payment_state || null,
            journal,
          },
        },
      ]);
    }

    void nextRefundsSum;

    const detail = await getAccountingCreditNoteDetail(opts.creditNoteId);
    return {
      refundId: String(refund.id),
      creditNoteId: opts.creditNoteId,
      creditNote: detail.creditNote,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create payment',
    };
  }
}

export async function getAccountingCreditNotes(filters: {
  search?: string;
  status?: CreditNoteStatus | 'all';
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(50, Math.max(10, filters.pageSize || 40));

    let query = supabase
      .from('accounting_credit_notes')
      .select('*', { count: 'exact' });
    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    const needle = String(filters.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `credit_note_number.ilike.${like},customer_name.ilike.${like},customer_lead_id.ilike.${like},invoice_number.ilike.${like}`
      );
    }
    query = query
      .order('credit_note_date', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (/accounting_credit_notes|relation/i.test(error.message)) {
        return { creditNotes: [], total: 0, page, pageSize };
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

    return {
      creditNotes: rows.map((r) => ({
        id: String(r.id),
        credit_note_number: String(r.credit_note_number || ''),
        customer_name: String(r.customer_name || ''),
        customer_lead_id: r.customer_lead_id ? String(r.customer_lead_id) : null,
        invoice_number: r.invoice_number ? String(r.invoice_number) : null,
        invoice_id: r.invoice_id ? String(r.invoice_id) : null,
        credit_note_date: String(r.credit_note_date || ''),
        status: String(r.status || 'draft'),
        payment_state: String(r.payment_state || 'not_paid'),
        refund_type: String(r.refund_type || 'full'),
        untaxed_amount: Number(r.untaxed_amount) || 0,
        total_amount: Number(r.total_amount) || 0,
        amount_refunded: Number(r.amount_refunded) || 0,
        amount_residual: Math.max(
          0,
          (Number(r.total_amount) || 0) - (Number(r.amount_refunded) || 0)
        ),
        salesperson_name: r.salesperson_name ? String(r.salesperson_name) : null,
        organization_id: r.organization_id ? String(r.organization_id) : null,
        organization_name: r.organization_id
          ? orgMap.get(String(r.organization_id)) || null
          : null,
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load credit notes',
    };
  }
}

export async function getAccountingRefundHistory(filters: {
  search?: string;
  contactId?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(50, Math.max(10, filters.pageSize || 20));

    let query = supabase.from('accounting_refunds').select('*', { count: 'exact' });
    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }
    if (filters.contactId) {
      query = query.eq('contact_id', filters.contactId);
    }
    const needle = String(filters.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `reference.ilike.${like},notes.ilike.${like},refunded_by.ilike.${like}`
      );
    }
    query = query
      .order('refund_date', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (/accounting_refunds|relation/i.test(error.message)) {
        return { refunds: [] as AccountingRefundListItem[], total: 0, page, pageSize };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const invIds = [
      ...new Set(rows.map((r) => (r.invoice_id ? String(r.invoice_id) : '')).filter(Boolean)),
    ];
    const cnIds = [
      ...new Set(
        rows.map((r) => (r.credit_note_id ? String(r.credit_note_id) : '')).filter(Boolean)
      ),
    ];
    const orgIds = [
      ...new Set(rows.map((r) => String(r.organization_id || '')).filter(Boolean)),
    ];

    const [invRes, cnRes, orgRes] = await Promise.all([
      invIds.length
        ? supabase.from('accounting_customer_invoices').select('id, invoice_number').in('id', invIds)
        : Promise.resolve({ data: [] as { id: string; invoice_number: string }[] }),
      cnIds.length
        ? supabase
            .from('accounting_credit_notes')
            .select('id, credit_note_number')
            .in('id', cnIds)
        : Promise.resolve({ data: [] as { id: string; credit_note_number: string }[] }),
      orgIds.length
        ? supabase.from('organizations').select('id, organization_name').in('id', orgIds)
        : Promise.resolve({ data: [] as { id: string; organization_name: string }[] }),
    ]);

    const invMap = new Map(
      (invRes.data || []).map((i) => [String(i.id), String(i.invoice_number || '')])
    );
    const cnMap = new Map(
      (cnRes.data || []).map((c) => [String(c.id), String(c.credit_note_number || '')])
    );
    const orgMap = new Map(
      (orgRes.data || []).map((o) => [String(o.id), String(o.organization_name || '')])
    );

    const refunds: AccountingRefundListItem[] = rows.map((r) => ({
      id: String(r.id),
      refund_date: String(r.refund_date || ''),
      amount: Number(r.amount) || 0,
      refund_type: String(r.refund_type || ''),
      payment_method: String(r.payment_method || ''),
      reference: r.reference ? String(r.reference) : null,
      refunded_by: r.refunded_by ? String(r.refunded_by) : null,
      invoice_id: r.invoice_id ? String(r.invoice_id) : null,
      invoice_number: r.invoice_id ? invMap.get(String(r.invoice_id)) || null : null,
      credit_note_id: r.credit_note_id ? String(r.credit_note_id) : null,
      credit_note_number: r.credit_note_id
        ? cnMap.get(String(r.credit_note_id)) || null
        : null,
      organization_name: orgMap.get(String(r.organization_id)) || null,
      created_at: String(r.created_at || ''),
    }));

    return { refunds, total: count ?? refunds.length, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load refunds',
    };
  }
}
