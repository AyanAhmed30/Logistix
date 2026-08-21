'use server';

/**
 * @deprecated Invoice/payment KPI analytics — NOT financial statement reporting.
 * Phase 1 Statement Reports (BS / P&L / Cash Flow) use
 * `actions/accounting/financial-statements.ts` + `lib/accounting/financial-reporting`.
 * These KPIs are unused by the Reporting UI route after the rebuild.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import {
  requireAccountingActionAccess,
  sessionHasAccountingAccess,
} from '@/lib/accounting-page-access';
import { documentPaymentSnapshot } from '@/lib/accounting-payments';
import { daysOverdueFromDueDate } from '@/lib/accounting-payment-terms';
import { accountingCanAccessReports } from '@/lib/accounting-roles';

export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  contactId?: string;
  salesperson?: string;
  invoiceStatus?: string;
  paymentStatus?: string;
};

export type ReportKpis = {
  total_revenue: number;
  collected_revenue: number;
  outstanding_revenue: number;
  average_invoice_value: number;
  invoice_count: number;
  payment_count: number;
  collection_rate: number;
};

export type ChartPoint = { label: string; value: number; secondary?: number };
export type NamedValue = { name: string; value: number; id?: string };

async function resolveScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const gate = await requireAccountingActionAccess({ reports: true });
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

function inDateRange(date: string | null | undefined, from?: string, to?: string) {
  if (!date) return !(from || to);
  const d = String(date).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

type InvRow = {
  id: string;
  invoice_number: string;
  status: string;
  payment_state: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  amount_residual: number;
  contact_id: string | null;
  customer_name: string;
  customer_lead_id: string | null;
  salesperson_name: string | null;
  organization_id: string | null;
  refund_status: string | null;
  created_at?: string;
};

async function loadInvoices(filters: ReportFilters = {}) {
  const scope = await resolveScope();
  if ('error' in scope && scope.error) return { error: scope.error as string };
  if ('empty' in scope && scope.empty) {
    return { invoices: [] as InvRow[], payments: [] as { amount: number; payment_date: string; payment_method: string; invoice_id: string }[], organizationId: null };
  }

  const supabase = await createAdminClient();
  let q = supabase
    .from('accounting_customer_invoices')
    .select(
      'id, invoice_number, status, payment_state, invoice_date, due_date, total_amount, amount_paid, amount_residual, contact_id, customer_name, customer_lead_id, salesperson_name, organization_id, refund_status, created_at'
    );
  if (scope.organizationId && !scope.isGlobalAdminView) {
    q = q.eq('organization_id', scope.organizationId);
  }
  if (filters.contactId) q = q.eq('contact_id', filters.contactId);
  if (filters.salesperson) q = q.ilike('salesperson_name', `%${filters.salesperson}%`);
  if (filters.invoiceStatus && filters.invoiceStatus !== 'all') {
    q = q.eq('status', filters.invoiceStatus);
  }

  const { data, error } = await q.limit(5000);
  if (error) return { error: error.message };

  let invoices = (data || []).map((r) => ({
    id: String(r.id),
    invoice_number: String(r.invoice_number || ''),
    status: String(r.status || ''),
    payment_state: r.payment_state ? String(r.payment_state) : null,
    invoice_date: String(r.invoice_date || ''),
    due_date: r.due_date ? String(r.due_date) : null,
    total_amount: Number(r.total_amount) || 0,
    amount_paid: Number(r.amount_paid) || 0,
    amount_residual: Number(r.amount_residual) || 0,
    contact_id: r.contact_id ? String(r.contact_id) : null,
    customer_name: String(r.customer_name || ''),
    customer_lead_id: r.customer_lead_id ? String(r.customer_lead_id) : null,
    salesperson_name: r.salesperson_name ? String(r.salesperson_name) : null,
    organization_id: r.organization_id ? String(r.organization_id) : null,
    refund_status: r.refund_status ? String(r.refund_status) : null,
    created_at: r.created_at ? String(r.created_at) : undefined,
  })) as InvRow[];

  invoices = invoices.filter((inv) =>
    inDateRange(inv.invoice_date, filters.dateFrom, filters.dateTo)
  );

  const invIds = invoices.map((i) => i.id);
  let payments: { amount: number; payment_date: string; payment_method: string; invoice_id: string }[] =
    [];
  if (invIds.length) {
    const { data: payRows } = await supabase
      .from('accounting_invoice_payments')
      .select('amount, payment_date, payment_method, invoice_id')
      .in('invoice_id', invIds.slice(0, 1000));
    payments = (payRows || []).map((p) => ({
      amount: Number(p.amount) || 0,
      payment_date: String(p.payment_date || ''),
      payment_method: String(p.payment_method || ''),
      invoice_id: String(p.invoice_id),
    }));
    if (filters.dateFrom || filters.dateTo) {
      payments = payments.filter((p) =>
        inDateRange(p.payment_date, filters.dateFrom, filters.dateTo)
      );
    }
  }

  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    invoices = invoices.filter((inv) => {
      const computed = documentPaymentSnapshot({
        total: inv.total_amount,
        amountPaid: inv.amount_paid,
        dueDate: inv.due_date,
        workflowStatus: inv.status,
        amountResidual: inv.amount_residual,
        storedPaymentState: inv.payment_state,
      });
      return computed.paymentState === filters.paymentStatus;
    });
  }

  return { invoices, payments, organizationId: scope.organizationId ?? null };
}

function buildKpis(
  invoices: InvRow[],
  payments: { amount: number }[]
): ReportKpis {
  const posted = invoices.filter((i) => i.status === 'posted' || i.status === 'paid');
  const totalRevenue = round2(posted.reduce((a, i) => a + i.total_amount, 0));
  const collected = round2(payments.reduce((a, p) => a + p.amount, 0));
  const outstanding = round2(
    posted.reduce((a, i) => {
      const c = documentPaymentSnapshot({
        total: i.total_amount,
        amountPaid: i.amount_paid,
        dueDate: i.due_date,
        workflowStatus: i.status,
        amountResidual: i.amount_residual,
        storedPaymentState: i.payment_state,
      });
      return a + c.outstanding;
    }, 0)
  );
  return {
    total_revenue: totalRevenue,
    collected_revenue: collected,
    outstanding_revenue: outstanding,
    average_invoice_value: posted.length ? round2(totalRevenue / posted.length) : 0,
    invoice_count: invoices.length,
    payment_count: payments.length,
    collection_rate: totalRevenue > 0 ? round2((collected / totalRevenue) * 100) : 0,
  };
}

function groupByPeriod(
  invoices: InvRow[],
  payments: { amount: number; payment_date: string }[],
  grain: 'day' | 'week' | 'month' | 'quarter' | 'year'
): ChartPoint[] {
  const map = new Map<string, { revenue: number; collected: number }>();

  const keyFor = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (grain === 'day') return iso.slice(0, 10);
    if (grain === 'week') {
      const onejan = new Date(y, 0, 1);
      const week = Math.ceil(
        ((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7
      );
      return `${y}-W${String(week).padStart(2, '0')}`;
    }
    if (grain === 'month') return `${y}-${String(m).padStart(2, '0')}`;
    if (grain === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
    return String(y);
  };

  for (const inv of invoices) {
    if (inv.status !== 'posted' && inv.status !== 'paid') continue;
    const k = keyFor(inv.invoice_date);
    const cur = map.get(k) || { revenue: 0, collected: 0 };
    cur.revenue += inv.total_amount;
    map.set(k, cur);
  }
  for (const p of payments) {
    const k = keyFor(p.payment_date);
    const cur = map.get(k) || { revenue: 0, collected: 0 };
    cur.collected += p.amount;
    map.set(k, cur);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({
      label,
      value: round2(v.revenue),
      secondary: round2(v.collected),
    }));
}

export async function getAccountingReportBundle(filters: ReportFilters = {}) {
  try {
    const loaded = await loadInvoices(filters);
    if ('error' in loaded && loaded.error) return { error: loaded.error };
    const invoices = loaded.invoices || [];
    const payments = loaded.payments || [];
    const kpis = buildKpis(invoices, payments);

    const invoiceStatusBreakdown: NamedValue[] = [
      { name: 'Draft', value: invoices.filter((i) => i.status === 'draft').length },
      { name: 'Posted', value: invoices.filter((i) => i.status === 'posted').length },
      { name: 'Paid', value: invoices.filter((i) => i.status === 'paid').length },
      { name: 'Cancelled', value: invoices.filter((i) => i.status === 'cancelled').length },
      {
        name: 'Partial',
        value: invoices.filter((i) => {
          const c = documentPaymentSnapshot({
            total: i.total_amount,
            amountPaid: i.amount_paid,
            dueDate: i.due_date,
            workflowStatus: i.status,
            amountResidual: i.amount_residual,
            storedPaymentState: i.payment_state,
          });
          return c.paymentState === 'partial';
        }).length,
      },
      {
        name: 'Overdue',
        value: invoices.filter((i) => {
          const c = documentPaymentSnapshot({
            total: i.total_amount,
            amountPaid: i.amount_paid,
            dueDate: i.due_date,
            workflowStatus: i.status,
            amountResidual: i.amount_residual,
            storedPaymentState: i.payment_state,
          });
          return c.paymentState === 'overdue';
        }).length,
      },
      {
        name: 'Refunded',
        value: invoices.filter((i) => i.refund_status === 'refunded').length,
      },
    ];

    const methodMap = new Map<string, number>();
    for (const p of payments) {
      const m = p.payment_method || 'other';
      methodMap.set(m, round2((methodMap.get(m) || 0) + p.amount));
    }
    const paymentMethods: NamedValue[] = [...methodMap.entries()].map(([name, value]) => ({
      name: name.replace(/_/g, ' '),
      value,
    }));

    const customerMap = new Map<
      string,
      { name: string; revenue: number; outstanding: number; count: number }
    >();
    for (const inv of invoices) {
      if (inv.status !== 'posted' && inv.status !== 'paid') continue;
      const key = inv.contact_id || inv.customer_name;
      const cur = customerMap.get(key) || {
        name: inv.customer_name,
        revenue: 0,
        outstanding: 0,
        count: 0,
      };
      cur.revenue += inv.total_amount;
      const c = documentPaymentSnapshot({
        total: inv.total_amount,
        amountPaid: inv.amount_paid,
        dueDate: inv.due_date,
        workflowStatus: inv.status,
        amountResidual: inv.amount_residual,
        storedPaymentState: inv.payment_state,
      });
      cur.outstanding += c.outstanding;
      cur.count += 1;
      customerMap.set(key, cur);
    }
    const topCustomers: NamedValue[] = [...customerMap.entries()]
      .map(([id, v]) => ({
        id,
        name: v.name,
        value: round2(v.revenue),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const outstandingCustomers: NamedValue[] = [...customerMap.entries()]
      .map(([id, v]) => ({
        id,
        name: v.name,
        value: round2(v.outstanding),
      }))
      .filter((x) => x.value > 0.004)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const outstandingRows = invoices
      .filter((i) => i.status === 'posted' || i.status === 'paid')
      .map((i) => {
        const c = documentPaymentSnapshot({
          total: i.total_amount,
          amountPaid: i.amount_paid,
          dueDate: i.due_date,
          workflowStatus: i.status,
          amountResidual: i.amount_residual,
          storedPaymentState: i.payment_state,
        });
        let daysOverdue = 0;
        if (i.due_date && c.outstanding > 0.004) {
          daysOverdue = daysOverdueFromDueDate(
            i.due_date,
            today.toISOString().slice(0, 10)
          );
        }
        return {
          id: i.id,
          invoice_number: i.invoice_number,
          customer_name: i.customer_name,
          customer_lead_id: i.customer_lead_id,
          salesperson_name: i.salesperson_name,
          due_date: i.due_date,
          outstanding_amount: c.outstanding,
          days_overdue: daysOverdue,
          organization_id: i.organization_id,
        };
      })
      .filter((r) => r.outstanding_amount > 0.004)
      .sort((a, b) => b.outstanding_amount - a.outstanding_amount);

    const aging = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d90_plus: 0,
    };
    for (const r of outstandingRows) {
      if (r.days_overdue <= 0) aging.current += r.outstanding_amount;
      else if (r.days_overdue <= 30) aging.d1_30 += r.outstanding_amount;
      else if (r.days_overdue <= 60) aging.d31_60 += r.outstanding_amount;
      else if (r.days_overdue <= 90) aging.d61_90 += r.outstanding_amount;
      else aging.d90_plus += r.outstanding_amount;
    }
    for (const k of Object.keys(aging) as (keyof typeof aging)[]) {
      aging[k] = round2(aging[k]);
    }

    const agingChart: NamedValue[] = [
      { name: 'Current', value: aging.current },
      { name: '1–30', value: aging.d1_30 },
      { name: '31–60', value: aging.d31_60 },
      { name: '61–90', value: aging.d61_90 },
      { name: '90+', value: aging.d90_plus },
    ];

    return {
      kpis,
      revenueByDay: groupByPeriod(invoices, payments, 'day').slice(-30),
      revenueByWeek: groupByPeriod(invoices, payments, 'week').slice(-16),
      revenueByMonth: groupByPeriod(invoices, payments, 'month').slice(-12),
      revenueByQuarter: groupByPeriod(invoices, payments, 'quarter').slice(-8),
      revenueByYear: groupByPeriod(invoices, payments, 'year'),
      invoiceStatusBreakdown,
      paymentMethods,
      paymentTrend: groupByPeriod(invoices, payments, 'month').slice(-12).map((p) => ({
        label: p.label,
        value: p.secondary || 0,
        secondary: p.value,
      })),
      topCustomers,
      outstandingCustomers,
      outstandingRows,
      aging,
      agingChart,
      monthlyComparison: groupByPeriod(invoices, payments, 'month').slice(-6),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load reports',
    };
  }
}

export async function logAccountingReportExported(reportType: string, format: string) {
  try {
    const session = await getSession();
    if (!session || !sessionHasAccountingAccess(session)) return { ok: false };
    const level = (
      await import('@/lib/accounting-page-access')
    ).sessionAccountingLevel(session);
    if (!accountingCanAccessReports(level)) return { ok: false };

    const { requireAdminOrganizationScope } = await import(
      '@/lib/admin-organization-context'
    );
    let organizationId: string | null = null;
    try {
      const scope = await requireAdminOrganizationScope();
      if (!('error' in scope)) organizationId = scope.organizationId;
    } catch {
      // ignore
    }

    const supabase = await createAdminClient();
    await supabase.from('accounting_audit_logs').insert([
      {
        organization_id: organizationId,
        entity_type: 'report',
        entity_id: null,
        action: 'report_exported',
        performed_by: session.username,
        details: { reportType, format },
      },
    ]);
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
