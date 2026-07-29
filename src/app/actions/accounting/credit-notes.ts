'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getAccountingInvoiceDetail } from '@/app/actions/accounting/invoices';

export type CreditNoteStatus = 'draft' | 'posted' | 'cancelled';

export type AccountingCreditNoteLine = {
  id: string;
  sequence: number;
  invoice_line_id: string | null;
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
        return `${prefix}${String(next).padStart(5, '0')}`;
      }
      await supabase.from('accounting_credit_note_sequences').insert([
        { organization_id: organizationId, prefix: 'RINV', next_number: 2 },
      ]);
      return 'RINV00001';
    } catch {
      // fall through
    }
  }
  return `RINV/${new Date().getFullYear()}/${String(Date.now()).slice(-4)}`;
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
 * Create a draft Credit Note from a Posted/Paid invoice.
 * lineIds optional — when provided, only those invoice lines (partial).
 */
export async function createCreditNoteFromInvoice(
  invoiceId: string,
  opts?: {
    reason?: string;
    lineIds?: string[];
    quantities?: Record<string, number>;
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
      Boolean(opts?.lineIds?.length) ||
      validLines.some((l) => {
        const orig = inv.lines.find((x) => x.id === l.invoice_line_id);
        return orig && Number(l.quantity) < Number(orig.quantity);
      }) ||
      validLines.length < inv.lines.length;

    const number = await allocateCreditNoteNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);

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
          reason: opts?.reason || null,
          refund_type: isPartial ? 'partial' : 'full',
          salesperson_name: inv.salesperson_name,
          credit_note_date: today,
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
        },
      },
    ]);

    return { creditNoteId: String(cn.id) };
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

export async function postAccountingCreditNote(creditNoteId: string) {
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
      await supabase
        .from('accounting_customer_invoices')
        .update({
          refund_status: isFull ? 'refunded' : 'partial',
          updated_by: scope.session!.username,
          updated_at: new Date().toISOString(),
        })
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
          },
        },
      ]);
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
      .select('id, status')
      .eq('id', creditNoteId)
      .maybeSingle();
    if (!cn) return { error: 'Credit note not found' };
    if (String(cn.status) === 'cancelled') {
      return getAccountingCreditNoteDetail(creditNoteId);
    }

    await supabase
      .from('accounting_credit_notes')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
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
 * Issue a refund against a posted credit note (cash/bank out).
 * Updates credit note amount_refunded and customer ledger via refunds table.
 */
export async function issueAccountingRefund(opts: {
  creditNoteId: string;
  amount: number;
  refund_date?: string;
  payment_method?: 'cash' | 'bank_transfer' | 'cheque';
  reference?: string;
  notes?: string;
}) {
  try {
    const scope = await resolveScope({ refunds: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const amount = round2(Number(opts.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Refund amount must be greater than zero' };
    }

    const supabase = await createAdminClient();
    const { data: cn } = await supabase
      .from('accounting_credit_notes')
      .select('*')
      .eq('id', opts.creditNoteId)
      .maybeSingle();
    if (!cn) return { error: 'Credit note not found' };
    if (String(cn.status) !== 'posted') {
      return { error: 'Refunds require a Posted credit note' };
    }

    const already = Number(cn.amount_refunded) || 0;
    const total = Number(cn.total_amount) || 0;
    const remaining = round2(Math.max(0, total - already));
    if (amount - remaining > 0.004) {
      return {
        error: `Refund cannot exceed remaining credit (${remaining.toFixed(2)})`,
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
          refund_type: amount >= remaining - 0.004 ? 'full' : 'partial',
          payment_method: opts.payment_method || 'bank_transfer',
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
      return { error: error?.message || 'Failed to issue refund' };
    }

    await supabase
      .from('accounting_credit_notes')
      .update({
        amount_refunded: round2(already + amount),
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.creditNoteId);

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
          },
        },
      ]);
    }

    return { refundId: String(refund.id), creditNoteId: opts.creditNoteId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to issue refund',
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
        refund_type: String(r.refund_type || 'full'),
        total_amount: Number(r.total_amount) || 0,
        amount_refunded: Number(r.amount_refunded) || 0,
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
