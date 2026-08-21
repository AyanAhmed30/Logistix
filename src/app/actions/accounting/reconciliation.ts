'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import { computePaymentState, outstandingFromComponents } from '@/lib/accounting-payments';
import { sumPostedCreditNotesForInvoice } from '@/lib/accounting-document-outstanding';

export type ReconciliationDocumentType =
  | 'customer_invoice'
  | 'customer_payment'
  | 'credit_note'
  | 'vendor_bill'
  | 'vendor_payment'
  | 'bank_statement_line'
  | 'journal_item';

export type JournalItemToReconcile = {
  id: string;
  line_id: string;
  journal_entry_id: string;
  journal_entry_number: string;
  entry_date: string;
  label: string;
  account_id: string;
  account_code: string;
  account_name: string;
  partner_name: string | null;
  contact_id: string | null;
  debit: number;
  credit: number;
  residual: number;
  matching: string | null;
  source_type: string | null;
  source_id: string | null;
  source_number: string | null;
  organization_id: string;
};

/** Odoo-style Journal Items to reconcile (posted lines with residual). */
export async function getAccountingJournalItemsToReconcile(filters?: {
  search?: string;
  withResidualOnly?: boolean;
  postedOnly?: boolean;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { items: [] as JournalItemToReconcile[], total: 0, page: 1, pageSize: 80 };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(200, Math.max(1, filters?.pageSize || 80));
    const search = String(filters?.search || '').trim().toLowerCase();
    const withResidualOnly = filters?.withResidualOnly !== false;
    const postedOnly = filters?.postedOnly !== false;

    let entryQ = supabase
      .from('accounting_journal_entries')
      .select(
        'id, entry_number, entry_date, status, source_type, source_id, source_number, partner_name, contact_id, organization_id, reference'
      )
      .order('entry_date', { ascending: false })
      .limit(400);

    if (postedOnly) {
      entryQ = entryQ.eq('status', 'posted');
    } else {
      entryQ = entryQ.neq('status', 'cancelled');
    }
    if (scope.organizationId && !scope.isGlobalAdminView) {
      entryQ = entryQ.eq('organization_id', scope.organizationId);
    }

    const { data: entries, error: entryErr } = await entryQ;
    if (entryErr) return { error: entryErr.message };
    if (!entries?.length) {
      return { items: [] as JournalItemToReconcile[], total: 0, page, pageSize };
    }

    const entryIds = entries.map((e) => String(e.id));
    const entryMap = new Map(entries.map((e) => [String(e.id), e]));

    const { data: lines, error: lineErr } = await supabase
      .from('accounting_journal_entry_lines')
      .select(
        'id, journal_entry_id, account_id, label, partner_name, contact_id, debit, credit, amount_residual, amount_reconciled, is_reconciled, sequence'
      )
      .in('journal_entry_id', entryIds)
      .order('sequence', { ascending: true });

    if (lineErr) {
      if (/amount_residual|amount_reconciled|is_reconciled|column/i.test(lineErr.message)) {
        // Fallback without Phase-2 columns
        const { data: basicLines, error: basicErr } = await supabase
          .from('accounting_journal_entry_lines')
          .select(
            'id, journal_entry_id, account_id, label, partner_name, contact_id, debit, credit, sequence'
          )
          .in('journal_entry_id', entryIds)
          .order('sequence', { ascending: true });
        if (basicErr) return { error: basicErr.message };
        return buildJournalItemsFromLines(
          supabase,
          basicLines || [],
          entryMap,
          { search, withResidualOnly, page, pageSize, legacy: true }
        );
      }
      return { error: lineErr.message };
    }

    return buildJournalItemsFromLines(supabase, lines || [], entryMap, {
      search,
      withResidualOnly,
      page,
      pageSize,
      legacy: false,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load journal items to reconcile',
    };
  }
}

async function buildJournalItemsFromLines(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  lines: Record<string, unknown>[],
  entryMap: Map<string, Record<string, unknown>>,
  opts: {
    search: string;
    withResidualOnly: boolean;
    page: number;
    pageSize: number;
    legacy: boolean;
  }
) {
  const accountIds = [
    ...new Set(lines.map((l) => String(l.account_id || '')).filter(Boolean)),
  ];
  const { data: accounts } = accountIds.length
    ? await supabase
        .from('chart_of_accounts')
        .select('id, code, name, type')
        .in('id', accountIds)
    : { data: [] as { id: string; code: string; name: string; type: string }[] };

  const aMap = new Map(
    (accounts || []).map((a) => [
      String(a.id),
      {
        code: String(a.code || ''),
        name: String(a.name || ''),
        type: String(a.type || ''),
      },
    ])
  );

  const items: JournalItemToReconcile[] = [];
  for (const line of lines) {
    const entryId = String(line.journal_entry_id || '');
    const entry = entryMap.get(entryId);
    if (!entry) continue;

    const debit = round2(Number(line.debit) || 0);
    const credit = round2(Number(line.credit) || 0);
    const lineTotal = round2(Math.max(debit, credit));
    if (lineTotal <= 0.004) continue;

    const reconciled = opts.legacy
      ? 0
      : round2(Number(line.amount_reconciled) || 0);
    const isReconciled = opts.legacy ? false : Boolean(line.is_reconciled);
    const residual = opts.legacy
      ? lineTotal
      : Number.isFinite(Number(line.amount_residual))
        ? round2(Math.max(0, Number(line.amount_residual)))
        : round2(Math.max(0, lineTotal - reconciled));

    // Document-level residual for receivable/payable when linked to invoice/payment
    const sourceType = entry.source_type ? String(entry.source_type) : null;
    const sourceId = entry.source_id ? String(entry.source_id) : null;
    const acct = aMap.get(String(line.account_id || ''));
    const acctType = (acct?.type || '').toLowerCase();
    const isReceivableOrPayable =
      /receivable|payable/i.test(acctType) ||
      /receivable|payable/i.test(acct?.name || '') ||
      /1300|1200|2100|2000|1220|1210|2110/i.test(acct?.code || '') ||
      // Fallback: asset/liability partner lines (common CoA setups)
      ((/asset|liability/i.test(acctType) || /asset|liability/i.test(acct?.name || '')) &&
        Boolean(line.partner_name || entry.partner_name));

    if (isReconciled) {
      if (opts.withResidualOnly) continue;
    }
    if (opts.withResidualOnly && residual <= 0.004) continue;

    // Prefer AR/AP open items; still include any residual partner line
    if (!isReceivableOrPayable && !(line.partner_name || entry.partner_name)) {
      if (opts.legacy || residual <= 0.004) continue;
    }
    if (opts.legacy && !isReceivableOrPayable && !line.partner_name && !entry.partner_name) {
      continue;
    }

    const partner =
      (line.partner_name ? String(line.partner_name) : null) ||
      (entry.partner_name ? String(entry.partner_name) : null) ||
      null;

    items.push({
      id: String(line.id),
      line_id: String(line.id),
      journal_entry_id: entryId,
      journal_entry_number: String(entry.entry_number || ''),
      entry_date: String(entry.entry_date || '').slice(0, 10),
      label:
        String(line.label || '') ||
        String(entry.source_number || entry.reference || entry.entry_number || ''),
      account_id: String(line.account_id || ''),
      account_code: acct?.code || '',
      account_name: acct?.name || 'Account',
      partner_name: partner,
      contact_id: line.contact_id
        ? String(line.contact_id)
        : entry.contact_id
          ? String(entry.contact_id)
          : null,
      debit,
      credit,
      residual,
      matching: null,
      source_type: sourceType,
      source_id: sourceId,
      source_number: entry.source_number ? String(entry.source_number) : null,
      organization_id: String(entry.organization_id || ''),
    });
  }

  let filtered = items;
  if (opts.search) {
    filtered = items.filter((i) => {
      const hay = [
        i.account_code,
        i.account_name,
        i.partner_name,
        i.label,
        i.journal_entry_number,
        i.source_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(opts.search);
    });
  }

  filtered.sort((a, b) => {
    const ac = a.account_code.localeCompare(b.account_code);
    if (ac !== 0) return ac;
    const p = String(a.partner_name || '').localeCompare(String(b.partner_name || ''));
    if (p !== 0) return p;
    return String(b.entry_date).localeCompare(String(a.entry_date));
  });

  const total = filtered.length;
  const from = (opts.page - 1) * opts.pageSize;
  return {
    items: filtered.slice(from, from + opts.pageSize),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

export type OutstandingEntry = {
  id: string;
  document_type: ReconciliationDocumentType;
  document_id: string;
  document_number: string;
  entry_date: string;
  journal_entry_id: string | null;
  journal_entry_number: string | null;
  reference: string;
  partner_name: string | null;
  contact_id: string | null;
  organization_id: string;
  organization_name: string | null;
  debit: number;
  credit: number;
  residual: number;
  amount_paid: number;
  total_amount: number;
  match_status: 'outstanding' | 'partial' | 'in_payment';
  payment_state: string | null;
  related_invoice_id: string | null;
};

export type ReconciliationSuggestion = {
  id: string;
  confidence: number;
  reason: string;
  debit: OutstandingEntry;
  credits: OutstandingEntry[];
  amount: number;
};

export type ReconciliationMatchItem = {
  document_type: ReconciliationDocumentType;
  document_id: string;
  amount: number;
  side: 'debit' | 'credit';
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function resolveScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session || !sessionHasAccountingAccess(session)) {
    return { error: 'Unauthorized' as const };
  }

  if (!sessionUsesOrganizationScope(session.role)) {
    return {
      session,
      organizationId: null as string | null,
      isGlobalAdminView: false,
    };
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
    return {
      session: scope.session,
      organizationId: null as string | null,
      isGlobalAdminView: true,
    };
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

async function appendReconLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  opts: {
    reconciliationId?: string | null;
    organizationId?: string | null;
    action: string;
    performedBy: string;
    details?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('accounting_reconciliation_logs').insert([
      {
        reconciliation_id: opts.reconciliationId || null,
        organization_id: opts.organizationId || null,
        action: opts.action,
        performed_by: opts.performedBy,
        details: opts.details || {},
      },
    ]);
  } catch {
    /* best-effort */
  }
}

async function appendInvoiceLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  invoiceId: string,
  action: string,
  performedBy: string,
  details: Record<string, unknown>,
  status?: { previous?: string | null; next?: string | null }
) {
  try {
    await supabase.from('accounting_invoice_logs').insert([
      {
        invoice_id: invoiceId,
        action,
        previous_status: status?.previous ?? null,
        new_status: status?.next ?? null,
        performed_by: performedBy,
        details,
      },
    ]);
  } catch {
    /* best-effort */
  }
}

/** Outstanding AR/AP documents that still need matching. */
export async function getAccountingOutstandingEntries(filters?: {
  search?: string;
  status?: string;
  documentType?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { entries: [] as OutstandingEntry[], total: 0, page: 1, pageSize: 40 };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize || 40));
    const search = String(filters?.search || '').trim().toLowerCase();
    const statusFilter = String(filters?.status || 'all').trim();
    const typeFilter = String(filters?.documentType || 'all').trim();

    const entries: OutstandingEntry[] = [];

    // ---- Customer invoices with residual / in_payment ----
    if (typeFilter === 'all' || typeFilter === 'customer_invoice') {
      let invQ = supabase
        .from('accounting_customer_invoices')
        .select(
          'id, invoice_number, invoice_date, customer_name, contact_id, organization_id, status, payment_state, total_amount, amount_paid, amount_residual, journal_entry_id'
        )
        .in('status', ['posted', 'paid'])
        .order('invoice_date', { ascending: false })
        .limit(500);

      if (scope.organizationId && !scope.isGlobalAdminView) {
        invQ = invQ.eq('organization_id', scope.organizationId);
      }

      const { data: invoices } = await invQ;
      for (const inv of invoices || []) {
        const total = round2(Number(inv.total_amount) || 0);
        const paid = round2(Number(inv.amount_paid) || 0);
        const residual = round2(
          Number.isFinite(Number(inv.amount_residual))
            ? Math.max(0, Number(inv.amount_residual))
            : Math.max(0, total - paid)
        );
        const payState = String(inv.payment_state || 'not_paid');
        const needs =
          residual > 0.004 ||
          payState === 'in_payment' ||
          payState === 'partial' ||
          payState === 'not_paid' ||
          payState === 'overdue';
        if (!needs) continue;
        if (payState === 'paid' && residual <= 0.004) continue;

        let matchStatus: OutstandingEntry['match_status'] = 'outstanding';
        if (payState === 'in_payment') matchStatus = 'in_payment';
        else if (payState === 'partial' || (paid > 0.004 && residual > 0.004)) {
          matchStatus = 'partial';
        }

        if (statusFilter === 'in_payment' && matchStatus !== 'in_payment') continue;
        if (statusFilter === 'partial' && matchStatus !== 'partial') continue;
        if (statusFilter === 'outstanding' && matchStatus !== 'outstanding') continue;

        entries.push({
          id: `inv:${inv.id}`,
          document_type: 'customer_invoice',
          document_id: String(inv.id),
          document_number: String(inv.invoice_number || ''),
          entry_date: String(inv.invoice_date || '').slice(0, 10),
          journal_entry_id: inv.journal_entry_id ? String(inv.journal_entry_id) : null,
          journal_entry_number: null,
          reference: String(inv.invoice_number || ''),
          partner_name: inv.customer_name ? String(inv.customer_name) : null,
          contact_id: inv.contact_id ? String(inv.contact_id) : null,
          organization_id: String(inv.organization_id),
          organization_name: null,
          debit: residual > 0.004 ? residual : total,
          credit: 0,
          residual: residual > 0.004 ? residual : payState === 'in_payment' ? residual || total - paid : residual,
          amount_paid: paid,
          total_amount: total,
          match_status: matchStatus,
          payment_state: payState,
          related_invoice_id: null,
        });
      }
    }

    // ---- Unreconciled customer payments ----
    if (typeFilter === 'all' || typeFilter === 'customer_payment') {
      let payQ = supabase
        .from('accounting_invoice_payments')
        .select('*')
        .order('payment_date', { ascending: false })
        .limit(500);

      if (scope.organizationId && !scope.isGlobalAdminView) {
        payQ = payQ.eq('organization_id', scope.organizationId);
      }

      const { data: payments, error: payErr } = await payQ;
      if (!payErr) {
        const invoiceIds = [
          ...new Set((payments || []).map((p) => String(p.invoice_id)).filter(Boolean)),
        ];
        const invMap = new Map<
          string,
          {
            customer_name: string | null;
            contact_id: string | null;
            invoice_number: string;
            payment_state: string;
          }
        >();
        if (invoiceIds.length) {
          const { data: invs } = await supabase
            .from('accounting_customer_invoices')
            .select('id, customer_name, contact_id, invoice_number, payment_state')
            .in('id', invoiceIds);
          for (const i of invs || []) {
            invMap.set(String(i.id), {
              customer_name: i.customer_name ? String(i.customer_name) : null,
              contact_id: i.contact_id ? String(i.contact_id) : null,
              invoice_number: String(i.invoice_number || ''),
              payment_state: String(i.payment_state || ''),
            });
          }
        }

        for (const p of payments || []) {
          const amount = round2(Number(p.amount) || 0);
          const hasReconcileCols = p.reconcile_status != null || p.amount_reconciled != null;
          const reconciled = hasReconcileCols
            ? round2(Number(p.amount_reconciled) || 0)
            : // Pre-migration: cash settled with invoice; bank in_payment = outstanding
              String(invMap.get(String(p.invoice_id))?.payment_state || '') === 'in_payment'
              ? 0
              : String(invMap.get(String(p.invoice_id))?.payment_state || '') === 'paid' ||
                  String(p.payment_method) === 'cash'
                ? amount
                : 0;
          const residual = round2(Math.max(0, amount - reconciled));
          const status = hasReconcileCols
            ? String(p.reconcile_status || 'outstanding')
            : residual <= 0.004
              ? 'reconciled'
              : 'outstanding';
          if (status === 'reconciled' || residual <= 0.004) continue;

          const matchStatus: OutstandingEntry['match_status'] =
            reconciled > 0.004 ? 'partial' : 'outstanding';
          if (statusFilter === 'partial' && matchStatus !== 'partial') continue;
          if (statusFilter === 'outstanding' && matchStatus !== 'outstanding') continue;
          if (statusFilter === 'in_payment') continue;

          const inv = invMap.get(String(p.invoice_id));
          const payNum =
            p.payment_number
              ? String(p.payment_number)
              : `PAY-${String(p.id).slice(0, 8).toUpperCase()}`;

          entries.push({
            id: `pay:${p.id}`,
            document_type: 'customer_payment',
            document_id: String(p.id),
            document_number: payNum,
            entry_date: String(p.payment_date || '').slice(0, 10),
            journal_entry_id: p.journal_entry_id ? String(p.journal_entry_id) : null,
            journal_entry_number: null,
            reference: String(p.reference || inv?.invoice_number || ''),
            partner_name: inv?.customer_name || null,
            contact_id: inv?.contact_id || null,
            organization_id: String(p.organization_id),
            organization_name: null,
            debit: 0,
            credit: residual,
            residual,
            amount_paid: reconciled,
            total_amount: amount,
            match_status: matchStatus,
            payment_state: status,
            related_invoice_id: p.invoice_id ? String(p.invoice_id) : null,
          });
        }
      }
    }

    // ---- Credit notes with residual ----
    if (typeFilter === 'all' || typeFilter === 'credit_note') {
      let cnQ = supabase
        .from('accounting_credit_notes')
        .select(
          'id, credit_note_number, credit_note_date, customer_name, contact_id, organization_id, status, payment_state, total_amount, amount_refunded, journal_entry_id, invoice_id'
        )
        .eq('status', 'posted')
        .order('credit_note_date', { ascending: false })
        .limit(200);

      if (scope.organizationId && !scope.isGlobalAdminView) {
        cnQ = cnQ.eq('organization_id', scope.organizationId);
      }

      const { data: notes } = await cnQ;
      for (const cn of notes || []) {
        const total = round2(Number(cn.total_amount) || 0);
        const refunded = round2(Number(cn.amount_refunded) || 0);
        const residual = round2(Math.max(0, total - refunded));
        if (residual <= 0.004) continue;
        const payState = String(cn.payment_state || 'not_paid');
        if (payState === 'paid') continue;

        entries.push({
          id: `cn:${cn.id}`,
          document_type: 'credit_note',
          document_id: String(cn.id),
          document_number: String(cn.credit_note_number || ''),
          entry_date: String(cn.credit_note_date || '').slice(0, 10),
          journal_entry_id: cn.journal_entry_id ? String(cn.journal_entry_id) : null,
          journal_entry_number: null,
          reference: String(cn.credit_note_number || ''),
          partner_name: cn.customer_name ? String(cn.customer_name) : null,
          contact_id: cn.contact_id ? String(cn.contact_id) : null,
          organization_id: String(cn.organization_id),
          organization_name: null,
          debit: 0,
          credit: residual,
          residual,
          amount_paid: refunded,
          total_amount: total,
          match_status: refunded > 0.004 ? 'partial' : 'outstanding',
          payment_state: payState,
          related_invoice_id: cn.invoice_id ? String(cn.invoice_id) : null,
        });
      }
    }

    // ---- Vendor bills outstanding ----
    if (typeFilter === 'all' || typeFilter === 'vendor_bill') {
      let billQ = supabase
        .from('accounting_vendor_bills')
        .select(
          'id, bill_number, bill_date, vendor_name, contact_id, organization_id, status, payment_state, total_amount, amount_paid, amount_residual, journal_entry_id'
        )
        .in('status', ['posted', 'paid'])
        .order('bill_date', { ascending: false })
        .limit(200);

      if (scope.organizationId && !scope.isGlobalAdminView) {
        billQ = billQ.eq('organization_id', scope.organizationId);
      }

      const { data: bills, error: billErr } = await billQ;
      if (!billErr) {
        for (const b of bills || []) {
          const total = round2(Number(b.total_amount) || 0);
          const paid = round2(Number(b.amount_paid) || 0);
          const residual = round2(
            Number.isFinite(Number(b.amount_residual))
              ? Math.max(0, Number(b.amount_residual))
              : Math.max(0, total - paid)
          );
          if (residual <= 0.004) continue;
          const payState = String(b.payment_state || 'not_paid');
          if (payState === 'paid') continue;

          entries.push({
            id: `bill:${b.id}`,
            document_type: 'vendor_bill',
            document_id: String(b.id),
            document_number: String(b.bill_number || ''),
            entry_date: String(b.bill_date || '').slice(0, 10),
            journal_entry_id: b.journal_entry_id ? String(b.journal_entry_id) : null,
            journal_entry_number: null,
            reference: String(b.bill_number || ''),
            partner_name: b.vendor_name ? String(b.vendor_name) : null,
            contact_id: b.contact_id ? String(b.contact_id) : null,
            organization_id: String(b.organization_id),
            organization_name: null,
            debit: 0,
            credit: residual,
            residual,
            amount_paid: paid,
            total_amount: total,
            match_status: paid > 0.004 ? 'partial' : 'outstanding',
            payment_state: payState,
            related_invoice_id: null,
          });
        }
      }
    }

    // Enrich org names + JE numbers
    const orgIds = [...new Set(entries.map((e) => e.organization_id))];
    const jeIds = [
      ...new Set(entries.map((e) => e.journal_entry_id).filter(Boolean) as string[]),
    ];
    const [{ data: orgs }, { data: jes }] = await Promise.all([
      orgIds.length
        ? supabase.from('organizations').select('id, name').in('id', orgIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      jeIds.length
        ? supabase
            .from('accounting_journal_entries')
            .select('id, entry_number')
            .in('id', jeIds)
        : Promise.resolve({ data: [] as { id: string; entry_number: string }[] }),
    ]);
    const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));
    const jMap = new Map(
      (jes || []).map((j) => [String(j.id), String(j.entry_number || '')])
    );
    for (const e of entries) {
      e.organization_name = oMap.get(e.organization_id) || null;
      if (e.journal_entry_id) {
        e.journal_entry_number = jMap.get(e.journal_entry_id) || null;
      }
    }

    let filtered = entries;
    if (search) {
      filtered = entries.filter((e) => {
        const hay = [
          e.document_number,
          e.reference,
          e.partner_name,
          e.journal_entry_number,
          e.organization_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(search);
      });
    }

    filtered.sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)));
    const total = filtered.length;
    const from = (page - 1) * pageSize;
    const pageRows = filtered.slice(from, from + pageSize);

    return { entries: pageRows, total, page, pageSize };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load outstanding entries',
    };
  }
}

/** Ranked auto-match suggestions (invoice ↔ payment). */
export async function getAccountingReconciliationSuggestions() {
  try {
    const res = await getAccountingOutstandingEntries({
      page: 1,
      pageSize: 200,
      status: 'all',
    });
    if ('error' in res && res.error) return { error: res.error };
    const entries = res.entries || [];

    const invoices = entries.filter((e) => e.document_type === 'customer_invoice');
    const payments = entries.filter((e) => e.document_type === 'customer_payment');
    const suggestions: ReconciliationSuggestion[] = [];
    const usedPay = new Set<string>();

    for (const inv of invoices) {
      const candidates = payments.filter((p) => {
        if (usedPay.has(p.document_id)) return false;
        // Prefer payments already linked to this invoice
        if (p.related_invoice_id && p.related_invoice_id === inv.document_id) {
          return true;
        }
        const samePartner =
          inv.contact_id && p.contact_id
            ? inv.contact_id === p.contact_id
            : String(inv.partner_name || '').toLowerCase() ===
              String(p.partner_name || '').toLowerCase();
        if (!samePartner) return false;
        return Math.abs(p.residual - inv.residual) < 0.05 || p.residual <= inv.residual + 0.05;
      });

      if (!candidates.length) continue;

      // Exact amount + linked invoice = highest confidence
      const exact = candidates.find(
        (p) =>
          p.related_invoice_id === inv.document_id &&
          Math.abs(p.residual - inv.residual) < 0.05
      );
      const linked = candidates.filter((p) => p.related_invoice_id === inv.document_id);
      const pick = exact
        ? [exact]
        : linked.length
          ? linked
          : candidates
              .filter((p) => Math.abs(p.residual - inv.residual) < 0.05)
              .slice(0, 1);

      if (!pick.length) continue;

      // One-to-many: accumulate linked payments until residual covered
      let remaining = inv.residual;
      const credits: OutstandingEntry[] = [];
      const pool = (linked.length ? linked : pick).sort(
        (a, b) => b.residual - a.residual
      );
      for (const p of pool) {
        if (remaining <= 0.004) break;
        if (usedPay.has(p.document_id)) continue;
        credits.push(p);
        usedPay.add(p.document_id);
        remaining = round2(remaining - p.residual);
      }
      if (!credits.length) continue;

      const amount = round2(
        Math.min(
          inv.residual,
          credits.reduce((s, c) => s + c.residual, 0)
        )
      );
      const confidence =
        exact || (linked.length && Math.abs(remaining) < 0.05)
          ? 0.98
          : Math.abs(remaining) < 0.05
            ? 0.85
            : 0.65;

      suggestions.push({
        id: `sug:${inv.document_id}:${credits.map((c) => c.document_id).join(',')}`,
        confidence,
        reason:
          confidence >= 0.95
            ? 'Exact match — same invoice & amount'
            : confidence >= 0.8
              ? 'Same partner & matching amounts'
              : 'Same partner — partial coverage',
        debit: inv,
        credits,
        amount,
      });
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return { suggestions: suggestions.slice(0, 40) };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load suggestions',
    };
  }
}

/**
 * Reconcile selected documents (one-to-one, one-to-many, many-to-one).
 * Debits (invoices) must balance credits (payments / credit notes) within 0.05.
 */
export async function reconcileAccountingEntries(input: {
  items: ReconciliationMatchItem[];
  matchType?: 'auto' | 'manual' | 'bank';
  notes?: string;
  reconciliationDate?: string;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const items = (input.items || []).filter((i) => i.amount > 0.004);
    if (items.length < 2) {
      return { error: 'Select at least one debit and one credit entry to reconcile' };
    }

    const debits = items.filter((i) => i.side === 'debit');
    const credits = items.filter((i) => i.side === 'credit');
    if (!debits.length || !credits.length) {
      return { error: 'Reconciliation requires both debit and credit sides' };
    }

    const debitSum = round2(debits.reduce((s, i) => s + Number(i.amount), 0));
    const creditSum = round2(credits.reduce((s, i) => s + Number(i.amount), 0));
    if (Math.abs(debitSum - creditSum) > 0.05) {
      return {
        error: `Amounts must balance (debit ${debitSum.toFixed(2)} vs credit ${creditSum.toFixed(2)})`,
      };
    }

    const supabase = await createAdminClient();
    const username = scope.session.username;
    const today = new Date().toISOString().slice(0, 10);
    const reconDate = String(input.reconciliationDate || today).slice(0, 10);

    // Resolve organization from first document
    let organizationId = scope.organizationId;
    const first = items[0];
    if (!organizationId) {
      if (first.document_type === 'customer_invoice') {
        const { data } = await supabase
          .from('accounting_customer_invoices')
          .select('organization_id')
          .eq('id', first.document_id)
          .maybeSingle();
        organizationId = data?.organization_id ? String(data.organization_id) : null;
      } else if (first.document_type === 'customer_payment') {
        const { data } = await supabase
          .from('accounting_invoice_payments')
          .select('organization_id')
          .eq('id', first.document_id)
          .maybeSingle();
        organizationId = data?.organization_id ? String(data.organization_id) : null;
      }
    }
    if (!organizationId) return { error: 'Organization is required' };

    const { getAccountingDocumentLockError } = await import(
      '@/lib/accounting-lock-dates'
    );
    const reconLock = await getAccountingDocumentLockError(
      organizationId,
      reconDate,
      'general'
    );
    if (reconLock) return { error: reconLock };

    // Apply invoice / payment updates first
    for (const d of debits) {
      if (d.document_type !== 'customer_invoice') continue;
      const applied = round2(Number(d.amount));
      const { data: inv } = await supabase
        .from('accounting_customer_invoices')
        .select(
          'id, total_amount, amount_paid, amount_residual, payment_state, status, due_date, organization_id'
        )
        .eq('id', d.document_id)
        .maybeSingle();
      if (!inv) return { error: 'Invoice not found' };
      if (
        scope.organizationId &&
        !scope.isGlobalAdminView &&
        String(inv.organization_id) !== scope.organizationId
      ) {
        return { error: 'Cannot reconcile across organizations' };
      }

      const prevPaid = round2(Number(inv.amount_paid) || 0);
      const total = round2(Number(inv.total_amount) || 0);
      const nextPaid = round2(prevPaid + applied);
      const notes = await sumPostedCreditNotesForInvoice(supabase, d.document_id);
      const residualDue = outstandingFromComponents({
        total,
        amountPaid: nextPaid,
        adjustments: notes,
      });
      const computed = computePaymentState({
        total,
        amountPaid: nextPaid,
        dueDate: inv.due_date ? String(inv.due_date) : null,
        workflowStatus: String(inv.status || 'posted'),
        preferInPayment: false,
        amountResidual: residualDue,
      });

      let nextStatus = String(inv.status);
      if (nextStatus === 'posted' || nextStatus === 'paid') {
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
        .eq('id', d.document_id);

      await appendInvoiceLog(
        supabase,
        d.document_id,
        computed.outstanding <= 0.004 ? 'reconciled' : 'partially_reconciled',
        username,
        {
          amount_applied: applied,
          amount_paid: computed.amountPaid,
          amount_residual: computed.outstanding,
          payment_state: computed.paymentState,
          match_type: input.matchType || 'manual',
        },
        { previous: String(inv.status), next: nextStatus }
      );
    }

    for (const c of credits) {
      if (c.document_type !== 'customer_payment') continue;
      const applied = round2(Number(c.amount));
      const { data: pay } = await supabase
        .from('accounting_invoice_payments')
        .select('id, amount, amount_reconciled, reconcile_status, organization_id')
        .eq('id', c.document_id)
        .maybeSingle();
      if (!pay) return { error: 'Payment not found' };
      if (
        scope.organizationId &&
        !scope.isGlobalAdminView &&
        String(pay.organization_id) !== scope.organizationId
      ) {
        return { error: 'Cannot reconcile across organizations' };
      }

      const prevRec = round2(Number(pay.amount_reconciled) || 0);
      const amount = round2(Number(pay.amount) || 0);
      const nextRec = round2(Math.min(amount, prevRec + applied));
      const status =
        nextRec >= amount - 0.004
          ? 'reconciled'
          : nextRec > 0.004
            ? 'partial'
            : 'outstanding';

      const { error: updErr } = await supabase
        .from('accounting_invoice_payments')
        .update({
          amount_reconciled: nextRec,
          reconcile_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', c.document_id);

      if (updErr && /amount_reconciled|reconcile_status|column/i.test(updErr.message)) {
        // Migration not applied — still proceed with invoice updates
        console.warn('[reconcile] payment columns missing:', updErr.message);
      }
    }

    // Credit notes: increase amount_refunded when matched to invoice
    for (const c of credits) {
      if (c.document_type !== 'credit_note') continue;
      const applied = round2(Number(c.amount));
      const { data: cn } = await supabase
        .from('accounting_credit_notes')
        .select('id, total_amount, amount_refunded, payment_state')
        .eq('id', c.document_id)
        .maybeSingle();
      if (!cn) continue;
      const nextRefunded = round2(
        Math.min(
          Number(cn.total_amount) || 0,
          (Number(cn.amount_refunded) || 0) + applied
        )
      );
      const residual = round2((Number(cn.total_amount) || 0) - nextRefunded);
      await supabase
        .from('accounting_credit_notes')
        .update({
          amount_refunded: nextRefunded,
          payment_state: residual <= 0.004 ? 'paid' : 'partial',
          updated_by: username,
          updated_at: new Date().toISOString(),
        })
        .eq('id', c.document_id);
    }

    // Determine full vs partial from invoice residuals after update
    let reconStatus: 'full' | 'partial' = 'full';
    for (const d of debits) {
      if (d.document_type !== 'customer_invoice') continue;
      const { data: inv } = await supabase
        .from('accounting_customer_invoices')
        .select('amount_residual, payment_state')
        .eq('id', d.document_id)
        .maybeSingle();
      if (inv && (Number(inv.amount_residual) || 0) > 0.004) {
        reconStatus = 'partial';
        break;
      }
    }

    const { data: recon, error: reconErr } = await supabase
      .from('accounting_reconciliations')
      .insert([
        {
          organization_id: organizationId,
          name: `REC ${reconDate}`,
          reconciliation_date: reconDate,
          status: reconStatus,
          match_type: input.matchType || 'manual',
          total_amount: debitSum,
          notes: input.notes || null,
          created_by: username,
          updated_by: username,
        },
      ])
      .select('id')
      .single();

    if (reconErr || !recon) {
      if (reconErr && /accounting_reconciliations|relation|schema cache/i.test(reconErr.message)) {
        return {
          error:
            'Run create_accounting_reconciliation_module.sql migration to enable reconciliation.',
          appliedWithoutRecord: true as const,
        };
      }
      return { error: reconErr?.message || 'Failed to create reconciliation' };
    }

    const lineRows = [];
    for (const item of items) {
      let document_number: string | null = null;
      let journal_entry_id: string | null = null;
      let partner_name: string | null = null;
      let contact_id: string | null = null;

      if (item.document_type === 'customer_invoice') {
        const { data } = await supabase
          .from('accounting_customer_invoices')
          .select('invoice_number, journal_entry_id, customer_name, contact_id')
          .eq('id', item.document_id)
          .maybeSingle();
        document_number = data?.invoice_number ? String(data.invoice_number) : null;
        journal_entry_id = data?.journal_entry_id ? String(data.journal_entry_id) : null;
        partner_name = data?.customer_name ? String(data.customer_name) : null;
        contact_id = data?.contact_id ? String(data.contact_id) : null;
      } else if (item.document_type === 'customer_payment') {
        const { data } = await supabase
          .from('accounting_invoice_payments')
          .select('payment_number, journal_entry_id, reference, invoice_id')
          .eq('id', item.document_id)
          .maybeSingle();
        document_number = data?.payment_number
          ? String(data.payment_number)
          : `PAY-${item.document_id.slice(0, 8).toUpperCase()}`;
        journal_entry_id = data?.journal_entry_id ? String(data.journal_entry_id) : null;
      } else if (item.document_type === 'credit_note') {
        const { data } = await supabase
          .from('accounting_credit_notes')
          .select('credit_note_number, journal_entry_id, customer_name, contact_id')
          .eq('id', item.document_id)
          .maybeSingle();
        document_number = data?.credit_note_number
          ? String(data.credit_note_number)
          : null;
        journal_entry_id = data?.journal_entry_id ? String(data.journal_entry_id) : null;
        partner_name = data?.customer_name ? String(data.customer_name) : null;
        contact_id = data?.contact_id ? String(data.contact_id) : null;
      }

      lineRows.push({
        reconciliation_id: recon.id,
        organization_id: organizationId,
        side: item.side,
        document_type: item.document_type,
        document_id: item.document_id,
        document_number,
        journal_entry_id,
        partner_name,
        contact_id,
        amount: round2(item.amount),
      });
    }

    await supabase.from('accounting_reconciliation_lines').insert(lineRows);

    await appendReconLog(supabase, {
      reconciliationId: String(recon.id),
      organizationId,
      action: input.matchType === 'auto' ? 'auto_match_accepted' : 'manual_match',
      performedBy: username,
      details: {
        status: reconStatus,
        total_amount: debitSum,
        items: items.length,
      },
    });

    await appendReconLog(supabase, {
      reconciliationId: String(recon.id),
      organizationId,
      action: reconStatus === 'full' ? 'reconciled' : 'partially_reconciled',
      performedBy: username,
      details: { total_amount: debitSum },
    });

    return {
      reconciliationId: String(recon.id),
      status: reconStatus,
      totalAmount: debitSum,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to reconcile',
    };
  }
}

/** Accept a suggestion and reconcile. */
export async function acceptAccountingReconciliationSuggestion(suggestion: {
  debit: { document_type: ReconciliationDocumentType; document_id: string; residual: number };
  credits: { document_type: ReconciliationDocumentType; document_id: string; residual: number }[];
  amount: number;
}) {
  const items: ReconciliationMatchItem[] = [
    {
      document_type: suggestion.debit.document_type,
      document_id: suggestion.debit.document_id,
      amount: round2(suggestion.amount),
      side: 'debit',
    },
  ];

  let remaining = round2(suggestion.amount);
  for (const c of suggestion.credits) {
    if (remaining <= 0.004) break;
    const apply = round2(Math.min(remaining, c.residual));
    items.push({
      document_type: c.document_type,
      document_id: c.document_id,
      amount: apply,
      side: 'credit',
    });
    remaining = round2(remaining - apply);
  }

  return reconcileAccountingEntries({
    items,
    matchType: 'auto',
    notes: 'Auto match accepted',
  });
}

/** Reverse a reconciliation and restore outstanding. */
export async function unreconcileAccountingReconciliation(reconciliationId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: recon } = await supabase
      .from('accounting_reconciliations')
      .select('*')
      .eq('id', reconciliationId)
      .maybeSingle();
    if (!recon) return { error: 'Reconciliation not found' };
    if (String(recon.status) === 'cancelled') {
      return { error: 'Already unreconciled' };
    }
    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(recon.organization_id) !== scope.organizationId
    ) {
      return { error: 'Reconciliation not in the selected organization' };
    }

    const { getAccountingDocumentLockError } = await import(
      '@/lib/accounting-lock-dates'
    );
    const unreconLock = await getAccountingDocumentLockError(
      String(recon.organization_id),
      recon.reconciliation_date
        ? String(recon.reconciliation_date)
        : null,
      'general'
    );
    if (unreconLock) return { error: unreconLock };

    const { data: lines } = await supabase
      .from('accounting_reconciliation_lines')
      .select('*')
      .eq('reconciliation_id', reconciliationId);

    const username = scope.session.username;

    for (const line of lines || []) {
      const amount = round2(Number(line.amount) || 0);
      const docType = String(line.document_type);
      const docId = String(line.document_id);

      if (docType === 'customer_invoice' && String(line.side) === 'debit') {
        const { data: inv } = await supabase
          .from('accounting_customer_invoices')
          .select(
            'id, total_amount, amount_paid, amount_residual, payment_state, status, due_date'
          )
          .eq('id', docId)
          .maybeSingle();
        if (!inv) continue;
        const nextPaid = round2(Math.max(0, (Number(inv.amount_paid) || 0) - amount));
        const total = round2(Number(inv.total_amount) || 0);
        // After unreconcile, bank-style invoices with remaining payments go In Payment
        const { data: openPays } = await supabase
          .from('accounting_invoice_payments')
          .select('id, amount, journal, payment_method')
          .eq('invoice_id', docId);
        const hasBankPay = (openPays || []).some(
          (p) =>
            String(p.journal || '') === 'bank' ||
            (p.journal == null && String(p.payment_method) !== 'cash')
        );

        const notes = await sumPostedCreditNotesForInvoice(supabase, docId);
        const residualDue = outstandingFromComponents({
          total,
          amountPaid: nextPaid,
          adjustments: notes,
        });
        let paymentState = computePaymentState({
          total,
          amountPaid: nextPaid,
          dueDate: inv.due_date ? String(inv.due_date) : null,
          workflowStatus: 'posted',
          preferInPayment: false,
          amountResidual: residualDue,
        });

        // If payments still exist but unpaid amount restored → in_payment for bank
        if (hasBankPay && (openPays || []).length > 0 && nextPaid <= 0.004) {
          paymentState = {
            paymentState: 'in_payment',
            outstanding: residualDue,
            amountPaid: nextPaid,
          };
        }

        const nextStatus =
          paymentState.paymentState === 'paid' ? 'paid' : 'posted';

        await supabase
          .from('accounting_customer_invoices')
          .update({
            amount_paid: paymentState.amountPaid,
            amount_residual: paymentState.outstanding,
            payment_state: paymentState.paymentState,
            status: nextStatus,
            updated_by: username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', docId);

        await appendInvoiceLog(
          supabase,
          docId,
          'unreconciled',
          username,
          {
            amount_restored: amount,
            amount_residual: paymentState.outstanding,
            payment_state: paymentState.paymentState,
            reconciliation_id: reconciliationId,
          },
          { previous: String(inv.status), next: nextStatus }
        );
      }

      if (docType === 'customer_payment' && String(line.side) === 'credit') {
        const { data: pay } = await supabase
          .from('accounting_invoice_payments')
          .select('id, amount, amount_reconciled')
          .eq('id', docId)
          .maybeSingle();
        if (!pay) continue;
        const nextRec = round2(
          Math.max(0, (Number(pay.amount_reconciled) || 0) - amount)
        );
        const payAmount = round2(Number(pay.amount) || 0);
        const status =
          nextRec <= 0.004
            ? 'outstanding'
            : nextRec >= payAmount - 0.004
              ? 'reconciled'
              : 'partial';
        await supabase
          .from('accounting_invoice_payments')
          .update({
            amount_reconciled: nextRec,
            reconcile_status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', docId);
      }

      if (docType === 'credit_note' && String(line.side) === 'credit') {
        const { data: cn } = await supabase
          .from('accounting_credit_notes')
          .select('id, total_amount, amount_refunded')
          .eq('id', docId)
          .maybeSingle();
        if (!cn) continue;
        const nextRefunded = round2(
          Math.max(0, (Number(cn.amount_refunded) || 0) - amount)
        );
        const residual = round2((Number(cn.total_amount) || 0) - nextRefunded);
        await supabase
          .from('accounting_credit_notes')
          .update({
            amount_refunded: nextRefunded,
            payment_state:
              nextRefunded <= 0.004
                ? 'not_paid'
                : residual <= 0.004
                  ? 'paid'
                  : 'partial',
            updated_by: username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', docId);
      }
    }

    await supabase
      .from('accounting_reconciliations')
      .update({
        status: 'cancelled',
        updated_by: username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reconciliationId);

    await appendReconLog(supabase, {
      reconciliationId,
      organizationId: String(recon.organization_id),
      action: 'unreconciled',
      performedBy: username,
      details: { lines: (lines || []).length },
    });

    return { ok: true as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to unreconcile',
    };
  }
}

/** Recent reconciliations for history / unreconcile. */
export async function getAccountingReconciliations(filters?: {
  page?: number;
  pageSize?: number;
  status?: string;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(50, Math.max(1, filters?.pageSize || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_reconciliations')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }
    const status = String(filters?.status || '').trim();
    if (status && status !== 'all') {
      q = q.eq('status', status);
    } else {
      q = q.neq('status', 'cancelled');
    }

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_reconciliations|relation/i.test(error.message)) {
        return { reconciliations: [], total: 0, page, pageSize };
      }
      return { error: error.message };
    }

    return {
      reconciliations: (data || []).map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        reconciliation_date: String(r.reconciliation_date || ''),
        status: String(r.status),
        match_type: String(r.match_type),
        total_amount: Number(r.total_amount) || 0,
        created_by: r.created_by ? String(r.created_by) : null,
        created_at: String(r.created_at || ''),
        organization_id: String(r.organization_id),
      })),
      total: count || 0,
      page,
      pageSize,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load reconciliations',
    };
  }
}

/** Bank journals + open statement lines (architecture for future imports). */
export async function getAccountingBankReconciliationBootstrap() {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: journals } = await supabase
      .from('journals')
      .select('id, name, code, type')
      .eq('is_active', true)
      .or('type.ilike.%bank%,code.ilike.%bnk%,name.ilike.%bank%')
      .order('code', { ascending: true });

    let stmtQ = supabase
      .from('accounting_bank_statements')
      .select('id, name, journal_id, status, date_from, date_to, balance_start, balance_end, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      stmtQ = stmtQ.eq('organization_id', scope.organizationId);
    }

    const { data: statements, error } = await stmtQ;
    if (error && /accounting_bank_statements|relation/i.test(error.message)) {
      return {
        journals: journals || [],
        statements: [],
        openLines: [],
      };
    }

    return {
      journals: journals || [],
      statements: statements || [],
      openLines: [] as unknown[],
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load bank reconciliation data',
    };
  }
}
