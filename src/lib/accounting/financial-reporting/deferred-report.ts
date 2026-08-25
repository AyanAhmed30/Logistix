/**
 * Deferred Revenue / Expense Review.
 * Recognition engine is NOT implemented: invoices/bills never create schedules
 * and nothing posts monthly recognition journal entries.
 * This report only surfaces posted journal lines on deferral CoA types
 * (and leftover rows in accounting_deferral_schedules if they exist).
 * Do not invent recognition amounts.
 */

import { createAdminClient } from '@/utils/supabase/server';
import {
  loadChartAccounts,
  loadPostedLedgerFacts,
} from '@/lib/accounting/financial-reporting/ledger';
import { formatMonthYear, monthKeysBetween } from '@/lib/accounting/financial-reporting/periods';
import { round2 } from '@/lib/accounting/financial-reporting/types';

export type DeferredScheduleRow = {
  id: string;
  source_number: string | null;
  partner_name: string | null;
  product_name: string | null;
  deferred_account_code: string | null;
  deferred_account_name: string | null;
  recognition_account_code: string | null;
  recognition_account_name: string | null;
  start_date: string;
  end_date: string;
  original_amount: number;
  recognized_amount: number;
  remaining_amount: number;
  next_recognition_date: string | null;
  status: string;
  currency: string;
  initial_journal_entry_id: string | null;
};

export type DeferredAccountMonthCell = {
  month_key: string;
  month_label: string;
  amount: number;
};

export type DeferredAccountReportRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  months: DeferredAccountMonthCell[];
  total: number;
};

export type DeferredReviewReport = {
  kind: 'deferred_revenue' | 'deferred_expense';
  date_from: string;
  date_to: string;
  currency: string;
  month_columns: { key: string; label: string }[];
  account_rows: DeferredAccountReportRow[];
  schedules: DeferredScheduleRow[];
  totals_by_month: Record<string, number>;
  grand_total: number;
  has_deferral_accounts: boolean;
  has_schedules: boolean;
  has_journal_activity: boolean;
  /** False until invoice/bill posting creates schedules and recognition JEs. */
  engine_supported: boolean;
};

export const DEFERRED_RECOGNITION_ENGINE_SUPPORTED = false;

function deferralAccountTypes(kind: 'deferred_revenue' | 'deferred_expense') {
  return kind === 'deferred_revenue' ? ['deferred_revenue'] : ['prepayments'];
}

export async function buildDeferredReviewReport(opts: {
  organizationId: string | null;
  kind: 'deferred_revenue' | 'deferred_expense';
  dateFrom: string;
  dateTo: string;
}): Promise<DeferredReviewReport> {
  const dateFrom = opts.dateFrom.slice(0, 10);
  const dateTo = opts.dateTo.slice(0, 10);
  const monthColumns = monthKeysBetween(dateFrom, dateTo).map((key) => ({
    key,
    label: formatMonthYear(`${key}-01`),
  }));

  const accounts = await loadChartAccounts(opts.organizationId);
  const types = deferralAccountTypes(opts.kind);
  const deferralAccounts = accounts.filter((a) =>
    types.includes(String(a.account_type || ''))
  );
  const accountIds = deferralAccounts.map((a) => a.id);

  const schedules: DeferredScheduleRow[] = [];
  const supabase = await createAdminClient();

  if (opts.organizationId) {
    const schedQ = supabase
      .from('accounting_deferral_schedules')
      .select('*')
      .eq('organization_id', opts.organizationId)
      .eq('schedule_type', opts.kind)
      .lte('start_date', dateTo)
      .gte('end_date', dateFrom)
      .order('start_date', { ascending: true });

    const { data: schedRows, error: schedErr } = await schedQ;
    if (!schedErr && schedRows?.length) {
      const defIds = [
        ...new Set(
          schedRows
            .map((r) => (r.deferred_account_id ? String(r.deferred_account_id) : ''))
            .filter(Boolean)
        ),
      ];
      const recIds = [
        ...new Set(
          schedRows
            .map((r) =>
              r.recognition_account_id ? String(r.recognition_account_id) : ''
            )
            .filter(Boolean)
        ),
      ];
      const allIds = [...new Set([...defIds, ...recIds])];
      const { data: coaRows } = allIds.length
        ? await supabase
            .from('chart_of_accounts')
            .select('id, code, name')
            .in('id', allIds)
        : { data: [] as { id: string; code: string; name: string }[] };
      const coaMap = new Map(
        (coaRows || []).map((c) => [String(c.id), c as { code: string; name: string }])
      );

      for (const r of schedRows) {
        const def = r.deferred_account_id
          ? coaMap.get(String(r.deferred_account_id))
          : null;
        const rec = r.recognition_account_id
          ? coaMap.get(String(r.recognition_account_id))
          : null;
        schedules.push({
          id: String(r.id),
          source_number: r.source_number ? String(r.source_number) : null,
          partner_name: r.partner_name ? String(r.partner_name) : null,
          product_name: r.product_name ? String(r.product_name) : null,
          deferred_account_code: def?.code || null,
          deferred_account_name: def?.name || null,
          recognition_account_code: rec?.code || null,
          recognition_account_name: rec?.name || null,
          start_date: String(r.start_date || '').slice(0, 10),
          end_date: String(r.end_date || '').slice(0, 10),
          original_amount: Number(r.original_amount) || 0,
          recognized_amount: Number(r.recognized_amount) || 0,
          remaining_amount: Number(r.remaining_amount) || 0,
          next_recognition_date: r.next_recognition_date
            ? String(r.next_recognition_date).slice(0, 10)
            : null,
          status: String(r.status),
          currency: String(r.currency || 'PKR'),
          initial_journal_entry_id: r.initial_journal_entry_id
            ? String(r.initial_journal_entry_id)
            : null,
        });
      }
    }
  }

  const facts =
    accountIds.length > 0
      ? await loadPostedLedgerFacts({
          organizationId: opts.organizationId,
          dateFrom,
          dateTo,
          accountIds,
        })
      : [];

  const byAccountMonth = new Map<string, Map<string, number>>();
  for (const f of facts) {
    const monthKey = f.entry_date.slice(0, 7);
    if (!monthColumns.some((m) => m.key === monthKey)) continue;
    const accMap = byAccountMonth.get(f.account_id) || new Map<string, number>();
    const net =
      opts.kind === 'deferred_revenue'
        ? round2(f.credit - f.debit)
        : round2(f.debit - f.credit);
    accMap.set(monthKey, round2((accMap.get(monthKey) || 0) + net));
    byAccountMonth.set(f.account_id, accMap);
  }

  const account_rows: DeferredAccountReportRow[] = [];
  const totals_by_month: Record<string, number> = {};
  for (const col of monthColumns) totals_by_month[col.key] = 0;

  for (const acc of deferralAccounts) {
    const monthMap = byAccountMonth.get(acc.id);
    if (!monthMap) continue;
    const months: DeferredAccountMonthCell[] = monthColumns.map((col) => ({
      month_key: col.key,
      month_label: col.label,
      amount: monthMap.get(col.key) || 0,
    }));
    const total = round2(months.reduce((s, m) => s + m.amount, 0));
    if (total === 0 && !months.some((m) => m.amount !== 0)) continue;
    for (const m of months) {
      totals_by_month[m.month_key] = round2(
        (totals_by_month[m.month_key] || 0) + m.amount
      );
    }
    account_rows.push({
      account_id: acc.id,
      account_code: acc.code,
      account_name: acc.name,
      months,
      total,
    });
  }

  account_rows.sort((a, b) => a.account_code.localeCompare(b.account_code));
  const grand_total = round2(Object.values(totals_by_month).reduce((s, v) => s + v, 0));

  return {
    kind: opts.kind,
    date_from: dateFrom,
    date_to: dateTo,
    currency: 'PKR',
    month_columns: monthColumns,
    account_rows,
    schedules,
    totals_by_month,
    grand_total,
    has_deferral_accounts: deferralAccounts.length > 0,
    has_schedules: schedules.length > 0,
    has_journal_activity: facts.length > 0,
    engine_supported: DEFERRED_RECOGNITION_ENGINE_SUPPORTED,
  };
}
