'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import {
  computeNetTax,
  effectiveTaxRate,
  monthPeriodBounds,
  roundTax2,
  type TaxReturnLineType,
  type TaxReturnStatus,
} from '@/lib/accounting-tax-returns';
import type { AutoPostingLine } from '@/lib/accounting-journal-posting';

export type AccountingTaxReturnListItem = {
  id: string;
  return_number: string;
  name: string;
  organization_id: string;
  organization_name: string | null;
  date_from: string;
  date_to: string;
  status: TaxReturnStatus;
  sales_tax: number;
  purchase_tax: number;
  net_tax: number;
  filed_at: string | null;
  created_at: string;
};

export type AccountingTaxReturnLine = {
  id: string;
  return_id: string;
  sequence: number;
  line_type: TaxReturnLineType;
  source_type: string | null;
  source_id: string | null;
  source_number: string | null;
  partner_name: string | null;
  document_date: string | null;
  tax_rate: number;
  taxable_amount: number;
  tax_amount: number;
  journal_entry_id: string | null;
};

export type AccountingTaxReturnDetail = AccountingTaxReturnListItem & {
  period_id: string | null;
  currency: string;
  total_sales: number;
  taxable_sales: number;
  exempt_sales: number;
  total_purchases: number;
  taxable_purchases: number;
  credit_note_tax: number;
  vendor_refund_tax: number;
  adjustments: number;
  journal_id: string | null;
  sales_tax_account_id: string | null;
  purchase_tax_account_id: string | null;
  tax_authority_account_id: string | null;
  journal_entry_id: string | null;
  notes: string | null;
  generated_at: string | null;
  confirmed_at: string | null;
  filed_by: string | null;
  lines: AccountingTaxReturnLine[];
  period_locked: boolean;
  invoice_count: number;
  bill_count: number;
  credit_note_count: number;
};

export type AccountingTaxPeriod = {
  id: string;
  organization_id: string;
  name: string;
  date_from: string;
  date_to: string;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
};

export type AccountingTaxDashboard = {
  period_name: string;
  date_from: string;
  date_to: string;
  sales_tax: number;
  purchase_tax: number;
  net_tax: number;
  taxable_sales: number;
  taxable_purchases: number;
  filed_returns: number;
  draft_returns: number;
  locked_periods: number;
  period_locked: boolean;
};

export type AccountingTaxReportRow = {
  id: string;
  period_label: string;
  organization_name: string | null;
  tax_type: 'sales' | 'purchase' | 'credit_note' | 'vendor_refund';
  tax_rate: number;
  taxable_amount: number;
  tax_amount: number;
  source_number: string | null;
  partner_name: string | null;
  document_date: string | null;
  status: string;
  journal_entry_id: string | null;
};

export type AccountingTaxReturnLog = {
  id: string;
  return_id: string | null;
  period_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  performed_by: string | null;
  performed_at: string;
  details: Record<string, unknown>;
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

async function allocateReturnNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string
) {
  const { data: seq } = await supabase
    .from('accounting_tax_return_sequences')
    .select('next_number, prefix')
    .eq('organization_id', organizationId)
    .maybeSingle();

  let next = 1;
  let prefix = 'TAX';
  if (seq) {
    next = Number(seq.next_number) || 1;
    prefix = String(seq.prefix || 'TAX');
    await supabase
      .from('accounting_tax_return_sequences')
      .update({ next_number: next + 1, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId);
  } else {
    await supabase.from('accounting_tax_return_sequences').insert([
      { organization_id: organizationId, prefix: 'TAX', next_number: 2 },
    ]);
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

async function appendLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  opts: {
    returnId?: string | null;
    periodId?: string | null;
    organizationId?: string | null;
    action: string;
    performedBy: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    details?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('accounting_tax_return_logs').insert([
      {
        return_id: opts.returnId || null,
        period_id: opts.periodId || null,
        organization_id: opts.organizationId || null,
        action: opts.action,
        previous_status: opts.previousStatus ?? null,
        new_status: opts.newStatus ?? null,
        performed_by: opts.performedBy,
        details: opts.details || {},
      },
    ]);
  } catch {
    /* best-effort */
  }
}

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  preferred?: string | null,
  codeHints: string[] = [],
  typeHint?: string
) {
  if (preferred) {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('id', preferred)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  for (const code of codeHints) {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  if (typeHint) {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('type', typeHint)
      .eq('is_active', true)
      .order('code', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  return null;
}

async function ensurePeriod(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string,
  dateFrom: string,
  dateTo: string,
  name?: string
) {
  const { data: existing } = await supabase
    .from('accounting_tax_periods')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('date_from', dateFrom)
    .eq('date_to', dateTo)
    .maybeSingle();
  if (existing) return existing;

  const label =
    name ||
    monthPeriodBounds(dateFrom).name ||
    `${dateFrom} – ${dateTo}`;

  const { data: created, error } = await supabase
    .from('accounting_tax_periods')
    .insert([
      {
        organization_id: organizationId,
        name: label,
        date_from: dateFrom,
        date_to: dateTo,
      },
    ])
    .select('*')
    .single();

  if (error) {
    // Race: unique conflict — re-fetch
    const { data: again } = await supabase
      .from('accounting_tax_periods')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('date_from', dateFrom)
      .eq('date_to', dateTo)
      .maybeSingle();
    if (again) return again;
    throw new Error(error.message);
  }
  return created;
}

type AggregatedTax = {
  totalSales: number;
  taxableSales: number;
  exemptSales: number;
  salesTax: number;
  totalPurchases: number;
  taxablePurchases: number;
  purchaseTax: number;
  creditNoteTax: number;
  creditNoteUntaxed: number;
  vendorRefundTax: number;
  netTax: number;
  lines: Array<{
    line_type: TaxReturnLineType;
    source_type: string;
    source_id: string;
    source_number: string | null;
    partner_name: string | null;
    document_date: string | null;
    tax_rate: number;
    taxable_amount: number;
    tax_amount: number;
    journal_entry_id: string | null;
  }>;
  invoiceCount: number;
  billCount: number;
  creditNoteCount: number;
};

async function aggregateTaxForPeriod(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string,
  dateFrom: string,
  dateTo: string
): Promise<AggregatedTax> {
  const [
    { data: invoices },
    { data: bills },
    { data: creditNotes },
    { data: vendorRefunds },
  ] = await Promise.all([
    supabase
      .from('accounting_customer_invoices')
      .select(
        'id, invoice_number, customer_name, invoice_date, untaxed_amount, tax_amount, total_amount, journal_entry_id, status'
      )
      .eq('organization_id', organizationId)
      .in('status', ['posted', 'paid'])
      .gte('invoice_date', dateFrom)
      .lte('invoice_date', dateTo),
    supabase
      .from('accounting_vendor_bills')
      .select(
        'id, bill_number, vendor_name, bill_date, untaxed_amount, tax_amount, total_amount, journal_entry_id, status'
      )
      .eq('organization_id', organizationId)
      .in('status', ['posted', 'paid'])
      .gte('bill_date', dateFrom)
      .lte('bill_date', dateTo),
    supabase
      .from('accounting_credit_notes')
      .select(
        'id, credit_note_number, customer_name, credit_note_date, untaxed_amount, tax_amount, total_amount, journal_entry_id, status'
      )
      .eq('organization_id', organizationId)
      .eq('status', 'posted')
      .gte('credit_note_date', dateFrom)
      .lte('credit_note_date', dateTo),
    supabase
      .from('accounting_vendor_refunds')
      .select(
        'id, refund_number, vendor_name, refund_date, untaxed_amount, tax_amount, total_amount, journal_entry_id, status'
      )
      .eq('organization_id', organizationId)
      .eq('status', 'posted')
      .gte('refund_date', dateFrom)
      .lte('refund_date', dateTo),
  ]);

  const lines: AggregatedTax['lines'] = [];
  let totalSales = 0;
  let taxableSales = 0;
  let salesTax = 0;
  let totalPurchases = 0;
  let taxablePurchases = 0;
  let purchaseTax = 0;
  let creditNoteTax = 0;
  let creditNoteUntaxed = 0;
  let vendorRefundTax = 0;

  for (const inv of invoices || []) {
    const untaxed = roundTax2(Number(inv.untaxed_amount) || 0);
    const tax = roundTax2(Number(inv.tax_amount) || 0);
    const total = roundTax2(Number(inv.total_amount) || 0);
    totalSales = roundTax2(totalSales + total);
    taxableSales = roundTax2(taxableSales + untaxed);
    salesTax = roundTax2(salesTax + tax);
    lines.push({
      line_type: 'sales',
      source_type: 'customer_invoice',
      source_id: String(inv.id),
      source_number: inv.invoice_number ? String(inv.invoice_number) : null,
      partner_name: inv.customer_name ? String(inv.customer_name) : null,
      document_date: inv.invoice_date
        ? String(inv.invoice_date).slice(0, 10)
        : null,
      tax_rate: effectiveTaxRate(untaxed, tax),
      taxable_amount: untaxed,
      tax_amount: tax,
      journal_entry_id: inv.journal_entry_id
        ? String(inv.journal_entry_id)
        : null,
    });
  }

  for (const bill of bills || []) {
    const untaxed = roundTax2(Number(bill.untaxed_amount) || 0);
    const tax = roundTax2(Number(bill.tax_amount) || 0);
    const total = roundTax2(Number(bill.total_amount) || 0);
    totalPurchases = roundTax2(totalPurchases + total);
    taxablePurchases = roundTax2(taxablePurchases + untaxed);
    purchaseTax = roundTax2(purchaseTax + tax);
    lines.push({
      line_type: 'purchase',
      source_type: 'vendor_bill',
      source_id: String(bill.id),
      source_number: bill.bill_number ? String(bill.bill_number) : null,
      partner_name: bill.vendor_name ? String(bill.vendor_name) : null,
      document_date: bill.bill_date ? String(bill.bill_date).slice(0, 10) : null,
      tax_rate: effectiveTaxRate(untaxed, tax),
      taxable_amount: untaxed,
      tax_amount: tax,
      journal_entry_id: bill.journal_entry_id
        ? String(bill.journal_entry_id)
        : null,
    });
  }

  for (const cn of creditNotes || []) {
    const untaxed = roundTax2(Number(cn.untaxed_amount) || 0);
    const tax = roundTax2(Number(cn.tax_amount) || 0);
    creditNoteTax = roundTax2(creditNoteTax + tax);
    creditNoteUntaxed = roundTax2(creditNoteUntaxed + untaxed);
    lines.push({
      line_type: 'credit_note',
      source_type: 'credit_note',
      source_id: String(cn.id),
      source_number: cn.credit_note_number
        ? String(cn.credit_note_number)
        : null,
      partner_name: cn.customer_name ? String(cn.customer_name) : null,
      document_date: cn.credit_note_date
        ? String(cn.credit_note_date).slice(0, 10)
        : null,
      tax_rate: effectiveTaxRate(untaxed, tax),
      taxable_amount: untaxed,
      tax_amount: tax,
      journal_entry_id: cn.journal_entry_id
        ? String(cn.journal_entry_id)
        : null,
    });
  }

  for (const vr of vendorRefunds || []) {
    const untaxed = roundTax2(Number(vr.untaxed_amount) || 0);
    const tax = roundTax2(Number(vr.tax_amount) || 0);
    vendorRefundTax = roundTax2(vendorRefundTax + tax);
    lines.push({
      line_type: 'vendor_refund',
      source_type: 'vendor_refund',
      source_id: String(vr.id),
      source_number: vr.refund_number ? String(vr.refund_number) : null,
      partner_name: vr.vendor_name ? String(vr.vendor_name) : null,
      document_date: vr.refund_date
        ? String(vr.refund_date).slice(0, 10)
        : null,
      tax_rate: effectiveTaxRate(untaxed, tax),
      taxable_amount: untaxed,
      tax_amount: tax,
      journal_entry_id: vr.journal_entry_id
        ? String(vr.journal_entry_id)
        : null,
    });
  }

  const exemptSales = 0;
  const netTax = computeNetTax({
    salesTax,
    purchaseTax,
    creditNoteTax,
    vendorRefundTax,
    adjustments: 0,
  });

  return {
    totalSales,
    taxableSales,
    exemptSales,
    salesTax,
    totalPurchases,
    taxablePurchases,
    purchaseTax,
    creditNoteTax,
    creditNoteUntaxed,
    vendorRefundTax,
    netTax,
    lines,
    invoiceCount: (invoices || []).length,
    billCount: (bills || []).length,
    creditNoteCount: (creditNotes || []).length,
  };
}

function mapListItem(
  r: Record<string, unknown>,
  orgName: string | null
): AccountingTaxReturnListItem {
  return {
    id: String(r.id),
    return_number: String(r.return_number),
    name: String(r.name || ''),
    organization_id: String(r.organization_id),
    organization_name: orgName,
    date_from: String(r.date_from || '').slice(0, 10),
    date_to: String(r.date_to || '').slice(0, 10),
    status: String(r.status) as TaxReturnStatus,
    sales_tax: Number(r.sales_tax) || 0,
    purchase_tax: Number(r.purchase_tax) || 0,
    net_tax: Number(r.net_tax) || 0,
    filed_at: r.filed_at ? String(r.filed_at) : null,
    created_at: String(r.created_at || ''),
  };
}

export async function getAccountingTaxDashboard(opts?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      const p = monthPeriodBounds();
      return {
        dashboard: {
          period_name: p.name,
          date_from: p.dateFrom,
          date_to: p.dateTo,
          sales_tax: 0,
          purchase_tax: 0,
          net_tax: 0,
          taxable_sales: 0,
          taxable_purchases: 0,
          filed_returns: 0,
          draft_returns: 0,
          locked_periods: 0,
          period_locked: false,
        } satisfies AccountingTaxDashboard,
      };
    }
    if (!scope.organizationId && !scope.isGlobalAdminView) {
      return { error: 'Select an organization from the header switcher.' };
    }

    const bounds = monthPeriodBounds();
    const dateFrom = opts?.dateFrom || bounds.dateFrom;
    const dateTo = opts?.dateTo || bounds.dateTo;
    const periodName =
      dateFrom === bounds.dateFrom && dateTo === bounds.dateTo
        ? bounds.name
        : `${dateFrom} – ${dateTo}`;

    const supabase = await createAdminClient();
    const orgId = scope.organizationId;

    if (!orgId) {
      return {
        dashboard: {
          period_name: periodName,
          date_from: dateFrom,
          date_to: dateTo,
          sales_tax: 0,
          purchase_tax: 0,
          net_tax: 0,
          taxable_sales: 0,
          taxable_purchases: 0,
          filed_returns: 0,
          draft_returns: 0,
          locked_periods: 0,
          period_locked: false,
        } satisfies AccountingTaxDashboard,
      };
    }

    let agg: AggregatedTax;
    try {
      agg = await aggregateTaxForPeriod(supabase, orgId, dateFrom, dateTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/relation|does not exist/i.test(msg)) {
        return {
          dashboard: {
            period_name: periodName,
            date_from: dateFrom,
            date_to: dateTo,
            sales_tax: 0,
            purchase_tax: 0,
            net_tax: 0,
            taxable_sales: 0,
            taxable_purchases: 0,
            filed_returns: 0,
            draft_returns: 0,
            locked_periods: 0,
            period_locked: false,
          },
          migrationRequired: true as const,
        };
      }
      throw err;
    }

    const [{ count: filed }, { count: drafts }, { count: locked }, { data: period }] =
      await Promise.all([
        supabase
          .from('accounting_tax_returns')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'filed'),
        supabase
          .from('accounting_tax_returns')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .in('status', ['draft', 'generated', 'confirmed']),
        supabase
          .from('accounting_tax_periods')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('is_locked', true),
        supabase
          .from('accounting_tax_periods')
          .select('is_locked')
          .eq('organization_id', orgId)
          .eq('date_from', dateFrom)
          .eq('date_to', dateTo)
          .maybeSingle(),
      ]);

    return {
      dashboard: {
        period_name: periodName,
        date_from: dateFrom,
        date_to: dateTo,
        sales_tax: agg.salesTax,
        purchase_tax: agg.purchaseTax,
        net_tax: agg.netTax,
        taxable_sales: agg.taxableSales,
        taxable_purchases: agg.taxablePurchases,
        filed_returns: filed || 0,
        draft_returns: drafts || 0,
        locked_periods: locked || 0,
        period_locked: Boolean(period?.is_locked),
      } satisfies AccountingTaxDashboard,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load tax dashboard',
    };
  }
}

export async function getAccountingTaxReturns(opts?: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { returns: [] as AccountingTaxReturnListItem[], total: 0, page: 1, pageSize: 40 };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_tax_returns')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    const status = (opts?.status || 'all').toLowerCase();
    if (status && status !== 'all') q = q.eq('status', status);

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(
        `return_number.ilike.%${search}%,name.ilike.%${search}%`
      );
    }

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_tax_returns|relation/i.test(error.message)) {
        return {
          returns: [] as AccountingTaxReturnListItem[],
          total: 0,
          page,
          pageSize,
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const orgIds = [...new Set(rows.map((r) => String(r.organization_id)))];
    const { data: orgs } = orgIds.length
      ? await supabase.from('organizations').select('id, name').in('id', orgIds)
      : { data: [] as { id: string; name: string }[] };
    const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

    const returns = rows.map((r) =>
      mapListItem(r as Record<string, unknown>, oMap.get(String(r.organization_id)) || null)
    );

    return { returns, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load tax returns',
    };
  }
}

export async function getAccountingTaxReturnDetail(returnId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_tax_returns')
      .select('*')
      .eq('id', returnId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Tax return not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Tax return not in the selected organization' };
    }

    const [{ data: org }, { data: lines }, { data: period }] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name')
        .eq('id', row.organization_id)
        .maybeSingle(),
      supabase
        .from('accounting_tax_return_lines')
        .select('*')
        .eq('return_id', returnId)
        .order('sequence', { ascending: true }),
      row.period_id
        ? supabase
            .from('accounting_tax_periods')
            .select('is_locked')
            .eq('id', row.period_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const mappedLines: AccountingTaxReturnLine[] = (lines || []).map((l) => ({
      id: String(l.id),
      return_id: String(l.return_id),
      sequence: Number(l.sequence) || 0,
      line_type: String(l.line_type) as TaxReturnLineType,
      source_type: l.source_type ? String(l.source_type) : null,
      source_id: l.source_id ? String(l.source_id) : null,
      source_number: l.source_number ? String(l.source_number) : null,
      partner_name: l.partner_name ? String(l.partner_name) : null,
      document_date: l.document_date ? String(l.document_date).slice(0, 10) : null,
      tax_rate: Number(l.tax_rate) || 0,
      taxable_amount: Number(l.taxable_amount) || 0,
      tax_amount: Number(l.tax_amount) || 0,
      journal_entry_id: l.journal_entry_id ? String(l.journal_entry_id) : null,
    }));

    const base = mapListItem(
      row as Record<string, unknown>,
      org?.name ? String(org.name) : null
    );

    const detail: AccountingTaxReturnDetail = {
      ...base,
      period_id: row.period_id ? String(row.period_id) : null,
      currency: String(row.currency || 'PKR'),
      total_sales: Number(row.total_sales) || 0,
      taxable_sales: Number(row.taxable_sales) || 0,
      exempt_sales: Number(row.exempt_sales) || 0,
      total_purchases: Number(row.total_purchases) || 0,
      taxable_purchases: Number(row.taxable_purchases) || 0,
      credit_note_tax: Number(row.credit_note_tax) || 0,
      vendor_refund_tax: Number(row.vendor_refund_tax) || 0,
      adjustments: Number(row.adjustments) || 0,
      journal_id: row.journal_id ? String(row.journal_id) : null,
      sales_tax_account_id: row.sales_tax_account_id
        ? String(row.sales_tax_account_id)
        : null,
      purchase_tax_account_id: row.purchase_tax_account_id
        ? String(row.purchase_tax_account_id)
        : null,
      tax_authority_account_id: row.tax_authority_account_id
        ? String(row.tax_authority_account_id)
        : null,
      journal_entry_id: row.journal_entry_id ? String(row.journal_entry_id) : null,
      notes: row.notes ? String(row.notes) : null,
      generated_at: row.generated_at ? String(row.generated_at) : null,
      confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
      filed_by: row.filed_by ? String(row.filed_by) : null,
      lines: mappedLines,
      period_locked: Boolean(period?.is_locked),
      invoice_count: mappedLines.filter((l) => l.line_type === 'sales').length,
      bill_count: mappedLines.filter((l) => l.line_type === 'purchase').length,
      credit_note_count: mappedLines.filter((l) => l.line_type === 'credit_note')
        .length,
    };

    return { taxReturn: detail };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load tax return',
    };
  }
}

export async function createAccountingTaxReturn(opts?: {
  dateFrom?: string;
  dateTo?: string;
  name?: string;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };
    if (!scope.organizationId) {
      return { error: 'Select an organization to create a tax return' };
    }

    const bounds = monthPeriodBounds();
    const dateFrom = (opts?.dateFrom || bounds.dateFrom).slice(0, 10);
    const dateTo = (opts?.dateTo || bounds.dateTo).slice(0, 10);
    const name = opts?.name || monthPeriodBounds(dateFrom).name;

    const supabase = await createAdminClient();
    const period = await ensurePeriod(
      supabase,
      scope.organizationId,
      dateFrom,
      dateTo,
      name
    );

    if (period.is_locked) {
      return { error: `Tax period "${period.name}" is locked` };
    }

    const returnNumber = await allocateReturnNumber(supabase, scope.organizationId);

    const { data, error } = await supabase
      .from('accounting_tax_returns')
      .insert([
        {
          organization_id: scope.organizationId,
          return_number: returnNumber,
          name: `${name} Tax Return`,
          period_id: period.id,
          date_from: dateFrom,
          date_to: dateTo,
          status: 'draft',
          created_by: scope.session.username,
          updated_by: scope.session.username,
        },
      ])
      .select('id')
      .single();

    if (error) {
      if (/accounting_tax_returns|relation/i.test(error.message)) {
        return {
          error: 'Run create_accounting_tax_returns_module.sql in Supabase first.',
        };
      }
      return { error: error.message };
    }

    await appendLog(supabase, {
      returnId: String(data.id),
      periodId: String(period.id),
      organizationId: scope.organizationId,
      action: 'tax_return_created',
      performedBy: scope.session.username,
      previousStatus: null,
      newStatus: 'draft',
    });

    return { returnId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create tax return',
    };
  }
}

/** Pull live tax from invoices/bills into the return. */
export async function generateAccountingTaxReturn(returnId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from('accounting_tax_returns')
      .select('*')
      .eq('id', returnId)
      .maybeSingle();
    if (!row) return { error: 'Tax return not found' };
    if (!['draft', 'generated', 'confirmed'].includes(String(row.status))) {
      return { error: 'Only draft/generated returns can be regenerated' };
    }

    if (row.period_id) {
      const { data: period } = await supabase
        .from('accounting_tax_periods')
        .select('is_locked, name')
        .eq('id', row.period_id)
        .maybeSingle();
      if (period?.is_locked) {
        return { error: `Tax period "${period.name}" is locked` };
      }
    }

    const agg = await aggregateTaxForPeriod(
      supabase,
      String(row.organization_id),
      String(row.date_from).slice(0, 10),
      String(row.date_to).slice(0, 10)
    );

    await supabase.from('accounting_tax_return_lines').delete().eq('return_id', returnId);

    if (agg.lines.length) {
      await supabase.from('accounting_tax_return_lines').insert(
        agg.lines.map((l, i) => ({
          return_id: returnId,
          organization_id: String(row.organization_id),
          sequence: i + 1,
          line_type: l.line_type,
          source_type: l.source_type,
          source_id: l.source_id,
          source_number: l.source_number,
          partner_name: l.partner_name,
          document_date: l.document_date,
          tax_rate: l.tax_rate,
          taxable_amount: l.taxable_amount,
          tax_amount: l.tax_amount,
          journal_entry_id: l.journal_entry_id,
        }))
      );
    }

    const prev = String(row.status);
    await supabase
      .from('accounting_tax_returns')
      .update({
        status: 'generated',
        total_sales: agg.totalSales,
        taxable_sales: agg.taxableSales,
        exempt_sales: agg.exemptSales,
        sales_tax: agg.salesTax,
        total_purchases: agg.totalPurchases,
        taxable_purchases: agg.taxablePurchases,
        purchase_tax: agg.purchaseTax,
        credit_note_tax: agg.creditNoteTax,
        vendor_refund_tax: agg.vendorRefundTax,
        net_tax: agg.netTax,
        generated_at: new Date().toISOString(),
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', returnId);

    await appendLog(supabase, {
      returnId,
      periodId: row.period_id ? String(row.period_id) : null,
      organizationId: String(row.organization_id),
      action: 'tax_return_generated',
      performedBy: scope.session.username,
      previousStatus: prev,
      newStatus: 'generated',
      details: {
        lines: agg.lines.length,
        sales_tax: agg.salesTax,
        purchase_tax: agg.purchaseTax,
        net_tax: agg.netTax,
      },
    });

    return getAccountingTaxReturnDetail(returnId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to generate tax return',
    };
  }
}

export async function confirmAccountingTaxReturn(returnId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from('accounting_tax_returns')
      .select('*')
      .eq('id', returnId)
      .maybeSingle();
    if (!row) return { error: 'Tax return not found' };
    if (String(row.status) !== 'generated') {
      return { error: 'Generate the tax return before confirming' };
    }

    await supabase
      .from('accounting_tax_returns')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', returnId);

    await appendLog(supabase, {
      returnId,
      periodId: row.period_id ? String(row.period_id) : null,
      organizationId: String(row.organization_id),
      action: 'tax_return_confirmed',
      performedBy: scope.session.username,
      previousStatus: 'generated',
      newStatus: 'confirmed',
    });

    return getAccountingTaxReturnDetail(returnId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to confirm tax return',
    };
  }
}

/** File return → settlement JE + status filed. */
export async function fileAccountingTaxReturn(returnId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from('accounting_tax_returns')
      .select('*')
      .eq('id', returnId)
      .maybeSingle();
    if (!row) return { error: 'Tax return not found' };
    if (!['confirmed', 'generated'].includes(String(row.status))) {
      return { error: 'Confirm the tax return before filing' };
    }

    const netTax = roundTax2(Number(row.net_tax) || 0);
    let jeId: string | null = row.journal_entry_id
      ? String(row.journal_entry_id)
      : null;

    if (Math.abs(netTax) > 0.004) {
      try {
        const { getJournalIdByType } = await import('@/lib/accounting-journal-posting');
        const { createAndPostAutomaticJournalEntry } = await import(
          '@/app/actions/accounting/journal-entries'
        );

        let journalId = row.journal_id ? String(row.journal_id) : null;
        if (!journalId) {
          const j = await getJournalIdByType('general', String(row.organization_id));
          journalId = String(j.id);
        }

        const salesTaxAcct = await resolveAccountId(
          supabase,
          row.sales_tax_account_id ? String(row.sales_tax_account_id) : null,
          ['2200', '2100', '2300'],
          'liability'
        );
        const purchaseTaxAcct = await resolveAccountId(
          supabase,
          row.purchase_tax_account_id ? String(row.purchase_tax_account_id) : null,
          ['1400', '1300', '1500'],
          'asset'
        );
        const authorityAcct = await resolveAccountId(
          supabase,
          row.tax_authority_account_id
            ? String(row.tax_authority_account_id)
            : null,
          ['2200', '2100', '2500'],
          'liability'
        );

        if (journalId && authorityAcct && (salesTaxAcct || purchaseTaxAcct)) {
          const lines: AutoPostingLine[] = [];
          const label = `Tax return ${row.return_number}`;

          if (netTax > 0) {
            // Payable to authority: clear sales tax liability → authority payable
            lines.push({
              account_id: salesTaxAcct || authorityAcct,
              label: `${label} — sales tax`,
              debit: netTax,
              credit: 0,
            });
            lines.push({
              account_id: authorityAcct,
              label: `${label} — tax authority`,
              debit: 0,
              credit: netTax,
            });
          } else {
            const refund = Math.abs(netTax);
            lines.push({
              account_id: authorityAcct,
              label: `${label} — tax refund`,
              debit: refund,
              credit: 0,
            });
            lines.push({
              account_id: purchaseTaxAcct || salesTaxAcct || authorityAcct,
              label: `${label} — recoverable tax`,
              debit: 0,
              credit: refund,
            });
          }

          const je = await createAndPostAutomaticJournalEntry({
            organizationId: String(row.organization_id),
            journalId,
            entryDate: String(row.date_to).slice(0, 10),
            reference: String(row.return_number),
            sourceType: 'tax_return' as never,
            sourceId: returnId,
            sourceNumber: String(row.return_number),
            lines,
            performedBy: scope.session.username,
          });
          if ('journalEntryId' in je && je.journalEntryId) {
            jeId = je.journalEntryId ?? null;
          }
        }
      } catch (err) {
        console.warn('[tax-returns] settlement JE:', err);
      }
    }

    const prev = String(row.status);
    await supabase
      .from('accounting_tax_returns')
      .update({
        status: 'filed',
        journal_entry_id: jeId,
        filed_at: new Date().toISOString(),
        filed_by: scope.session.username,
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', returnId);

    await appendLog(supabase, {
      returnId,
      periodId: row.period_id ? String(row.period_id) : null,
      organizationId: String(row.organization_id),
      action: 'tax_return_filed',
      performedBy: scope.session.username,
      previousStatus: prev,
      newStatus: 'filed',
      details: { journal_entry_id: jeId, net_tax: netTax },
    });

    return getAccountingTaxReturnDetail(returnId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to file tax return',
    };
  }
}

export async function cancelAccountingTaxReturn(returnId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from('accounting_tax_returns')
      .select('*')
      .eq('id', returnId)
      .maybeSingle();
    if (!row) return { error: 'Tax return not found' };
    if (String(row.status) === 'filed') {
      return { error: 'Filed returns cannot be cancelled' };
    }

    const prev = String(row.status);
    await supabase
      .from('accounting_tax_returns')
      .update({
        status: 'cancelled',
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', returnId);

    await appendLog(supabase, {
      returnId,
      periodId: row.period_id ? String(row.period_id) : null,
      organizationId: String(row.organization_id),
      action: 'tax_return_cancelled',
      performedBy: scope.session.username,
      previousStatus: prev,
      newStatus: 'cancelled',
    });

    return getAccountingTaxReturnDetail(returnId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to cancel tax return',
    };
  }
}

export async function updateAccountingTaxReturn(
  returnId: string,
  payload: {
    name?: string;
    notes?: string | null;
    adjustments?: number;
    journal_id?: string | null;
    sales_tax_account_id?: string | null;
    purchase_tax_account_id?: string | null;
    tax_authority_account_id?: string | null;
  }
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from('accounting_tax_returns')
      .select('*')
      .eq('id', returnId)
      .maybeSingle();
    if (!row) return { error: 'Tax return not found' };
    if (['filed', 'cancelled'].includes(String(row.status))) {
      return { error: 'Cannot edit a filed or cancelled return' };
    }

    const patch: Record<string, unknown> = {
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };
    if (payload.name !== undefined) patch.name = String(payload.name).trim();
    if (payload.notes !== undefined) patch.notes = payload.notes || null;
    if (payload.journal_id !== undefined) patch.journal_id = payload.journal_id || null;
    if (payload.sales_tax_account_id !== undefined) {
      patch.sales_tax_account_id = payload.sales_tax_account_id || null;
    }
    if (payload.purchase_tax_account_id !== undefined) {
      patch.purchase_tax_account_id = payload.purchase_tax_account_id || null;
    }
    if (payload.tax_authority_account_id !== undefined) {
      patch.tax_authority_account_id = payload.tax_authority_account_id || null;
    }
    if (payload.adjustments !== undefined) {
      const adj = roundTax2(Number(payload.adjustments) || 0);
      patch.adjustments = adj;
      patch.net_tax = computeNetTax({
        salesTax: Number(row.sales_tax) || 0,
        purchaseTax: Number(row.purchase_tax) || 0,
        creditNoteTax: Number(row.credit_note_tax) || 0,
        vendorRefundTax: Number(row.vendor_refund_tax) || 0,
        adjustments: adj,
      });
    }

    const { error } = await supabase
      .from('accounting_tax_returns')
      .update(patch)
      .eq('id', returnId);
    if (error) return { error: error.message };

    return getAccountingTaxReturnDetail(returnId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update tax return',
    };
  }
}

export async function lockAccountingTaxPeriod(opts: {
  dateFrom: string;
  dateTo: string;
  name?: string;
  returnId?: string;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };
    if (!scope.organizationId) {
      return { error: 'Select an organization to lock a tax period' };
    }

    const supabase = await createAdminClient();
    const period = await ensurePeriod(
      supabase,
      scope.organizationId,
      opts.dateFrom.slice(0, 10),
      opts.dateTo.slice(0, 10),
      opts.name
    );

    await supabase
      .from('accounting_tax_periods')
      .update({
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', period.id);

    await appendLog(supabase, {
      returnId: opts.returnId || null,
      periodId: String(period.id),
      organizationId: scope.organizationId,
      action: 'tax_period_locked',
      performedBy: scope.session.username,
      details: {
        date_from: period.date_from,
        date_to: period.date_to,
        name: period.name,
      },
    });

    return { periodId: String(period.id), locked: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to lock tax period',
    };
  }
}

export async function unlockAccountingTaxPeriod(periodId: string, returnId?: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: period } = await supabase
      .from('accounting_tax_periods')
      .select('*')
      .eq('id', periodId)
      .maybeSingle();
    if (!period) return { error: 'Tax period not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(period.organization_id) !== scope.organizationId
    ) {
      return { error: 'Period not in the selected organization' };
    }

    await supabase
      .from('accounting_tax_periods')
      .update({
        is_locked: false,
        unlocked_at: new Date().toISOString(),
        unlocked_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', periodId);

    await appendLog(supabase, {
      returnId: returnId || null,
      periodId,
      organizationId: String(period.organization_id),
      action: 'tax_period_unlocked',
      performedBy: scope.session.username,
      details: { name: period.name },
    });

    return { periodId, locked: false };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to unlock tax period',
    };
  }
}

export async function getAccountingTaxReport(opts?: {
  dateFrom?: string;
  dateTo?: string;
  taxType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.organizationId) {
      return { rows: [] as AccountingTaxReportRow[], total: 0 };
    }

    const bounds = monthPeriodBounds();
    const dateFrom = (opts?.dateFrom || bounds.dateFrom).slice(0, 10);
    const dateTo = (opts?.dateTo || bounds.dateTo).slice(0, 10);
    const supabase = await createAdminClient();
    const agg = await aggregateTaxForPeriod(
      supabase,
      scope.organizationId,
      dateFrom,
      dateTo
    );

    let rows: AccountingTaxReportRow[] = agg.lines.map((l) => ({
      id: `${l.source_type}-${l.source_id}`,
      period_label: `${dateFrom} – ${dateTo}`,
      organization_name: null,
      tax_type: l.line_type as AccountingTaxReportRow['tax_type'],
      tax_rate: l.tax_rate,
      taxable_amount: l.taxable_amount,
      tax_amount: l.tax_amount,
      source_number: l.source_number,
      partner_name: l.partner_name,
      document_date: l.document_date,
      status: 'posted',
      journal_entry_id: l.journal_entry_id,
    }));

    const taxType = (opts?.taxType || 'all').toLowerCase();
    if (taxType && taxType !== 'all') {
      rows = rows.filter((r) => r.tax_type === taxType);
    }
    const search = String(opts?.search || '').trim().toLowerCase();
    if (search) {
      rows = rows.filter(
        (r) =>
          (r.source_number || '').toLowerCase().includes(search) ||
          (r.partner_name || '').toLowerCase().includes(search)
      );
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize || 50));
    const total = rows.length;
    const slice = rows.slice((page - 1) * pageSize, page * pageSize);

    return { rows: slice, total, page, pageSize, summary: {
      sales_tax: agg.salesTax,
      purchase_tax: agg.purchaseTax,
      net_tax: agg.netTax,
      taxable_sales: agg.taxableSales,
      taxable_purchases: agg.taxablePurchases,
    }};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load tax report',
    };
  }
}

export async function getAccountingTaxReturnActivity(returnId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_tax_return_logs')
      .select('*')
      .eq('return_id', returnId)
      .order('performed_at', { ascending: false })
      .limit(80);

    if (error) {
      if (/accounting_tax_return_logs|relation/i.test(error.message)) {
        return { logs: [] as AccountingTaxReturnLog[] };
      }
      return { error: error.message };
    }

    const logs: AccountingTaxReturnLog[] = (data || []).map((r) => ({
      id: String(r.id),
      return_id: r.return_id ? String(r.return_id) : null,
      period_id: r.period_id ? String(r.period_id) : null,
      action: String(r.action),
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

export async function getAccountingTaxPeriods() {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.organizationId) return { periods: [] as AccountingTaxPeriod[] };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_tax_periods')
      .select('*')
      .eq('organization_id', scope.organizationId)
      .order('date_from', { ascending: false })
      .limit(36);

    if (error) {
      if (/accounting_tax_periods|relation/i.test(error.message)) {
        return { periods: [] as AccountingTaxPeriod[] };
      }
      return { error: error.message };
    }

    const periods: AccountingTaxPeriod[] = (data || []).map((p) => ({
      id: String(p.id),
      organization_id: String(p.organization_id),
      name: String(p.name),
      date_from: String(p.date_from).slice(0, 10),
      date_to: String(p.date_to).slice(0, 10),
      is_locked: Boolean(p.is_locked),
      locked_at: p.locked_at ? String(p.locked_at) : null,
      locked_by: p.locked_by ? String(p.locked_by) : null,
    }));

    return { periods };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load periods',
    };
  }
}
