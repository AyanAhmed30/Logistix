'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import {
  requireAccountingActionAccess,
  sessionHasAccountingAccess,
} from '@/lib/accounting-page-access';
import {
  computeDueDateFromTerms,
  computePaymentSchedule,
  normalizePaymentTermCode,
  type PaymentTermDef,
  type PaymentTermDelayType,
  type PaymentTermLineDef,
  type PaymentTermValueType,
} from '@/lib/accounting-payment-terms';

export type AccountingPaymentTermLine = {
  id: string;
  sequence: number;
  value_amount_type: PaymentTermValueType;
  value_amount: number;
  nb_days: number;
  delay_type: PaymentTermDelayType;
};

export type AccountingPaymentTermListItem = {
  id: string;
  name: string;
  code: string | null;
  note: string | null;
  organization_id: string | null;
  organization_name: string | null;
  is_active: boolean;
  sequence: number;
  line_count: number;
  summary: string;
  updated_at: string;
};

export type AccountingPaymentTermDetail = AccountingPaymentTermListItem & {
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
  lines: AccountingPaymentTermLine[];
};

async function resolvePaymentTermScope(opts?: { config?: boolean }) {
  let session: Awaited<ReturnType<typeof getSession>> = null;

  if (opts?.config) {
    const access = await requireAccountingActionAccess({ config: true });
    if ('error' in access && access.error) return { error: access.error };
    session = access.session;
  } else {
    session = await getSession();
    if (!session || !sessionHasAccountingAccess(session)) {
      return { error: 'Unauthorized' as const };
    }
  }

  if (!session) return { error: 'Unauthorized' as const };

  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );

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

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

function summarizeLines(lines: AccountingPaymentTermLine[]): string {
  if (!lines.length) return 'Immediate';
  if (lines.length === 1) {
    const l = lines[0];
    if (l.nb_days === 0 && l.delay_type === 'days_after') return 'Immediate';
    if (l.delay_type === 'days_end_of_month') return 'End of Next Month';
    return `${l.nb_days} Days`;
  }
  return `${lines.length} installments`;
}

function toTermDef(
  name: string,
  lines: AccountingPaymentTermLine[],
  id = ''
): PaymentTermDef {
  return {
    id,
    name,
    lines: lines.map((l) => ({
      id: l.id,
      sequence: l.sequence,
      value_amount_type: l.value_amount_type,
      value_amount: l.value_amount,
      nb_days: l.nb_days,
      delay_type: l.delay_type,
    })),
  };
}

/** Active terms for invoice/bill/contact pickers. */
export async function searchAccountingPaymentTerms(opts?: {
  search?: string;
  limit?: number;
}) {
  try {
    const scope = await resolvePaymentTermScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_payment_terms')
      .select('id, name, code, note, organization_id, is_active, sequence')
      .eq('is_active', true)
      .order('sequence', { ascending: true })
      .order('name', { ascending: true })
      .limit(Math.min(200, Math.max(1, opts?.limit || 80)));

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const needle = String(opts?.search || '').trim();
    if (needle) {
      q = q.or(`name.ilike.%${needle}%,code.ilike.%${needle}%`);
    }

    const { data, error } = await q;
    if (error) {
      if (/accounting_payment_terms|does not exist/i.test(error.message)) {
        return { terms: [], migrationRequired: true as const };
      }
      return { error: error.message };
    }
    return { terms: data || [] };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to search payment terms',
    };
  }
}

export async function getAccountingPaymentTermById(termId: string) {
  try {
    const supabase = await createAdminClient();
    const { data: term, error } = await supabase
      .from('accounting_payment_terms')
      .select('*')
      .eq('id', termId)
      .maybeSingle();
    if (error || !term) return { error: error?.message || 'Payment term not found' };

    const { data: lines } = await supabase
      .from('accounting_payment_term_lines')
      .select('*')
      .eq('payment_term_id', termId)
      .order('sequence', { ascending: true });

    const mappedLines: AccountingPaymentTermLine[] = (lines || []).map((l) => ({
      id: String(l.id),
      sequence: Number(l.sequence) || 10,
      value_amount_type: (String(l.value_amount_type) === 'fixed'
        ? 'fixed'
        : 'percent') as PaymentTermValueType,
      value_amount: Number(l.value_amount) || 0,
      nb_days: Number(l.nb_days) || 0,
      delay_type: String(l.delay_type || 'days_after') as PaymentTermDelayType,
    }));

    return {
      term: toTermDef(String(term.name), mappedLines, String(term.id)),
      name: String(term.name),
      code: term.code ? String(term.code) : null,
      lines: mappedLines,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payment term',
    };
  }
}

/** Compute due date using term id or free-text fallback. */
export async function computeAccountingDueDate(args: {
  documentDate: string;
  paymentTermId?: string | null;
  paymentTermsText?: string | null;
  totalAmount?: number;
}) {
  try {
    if (args.paymentTermId) {
      const res = await getAccountingPaymentTermById(args.paymentTermId);
      if ('term' in res && res.term) {
        const schedule = computePaymentSchedule({
          documentDate: args.documentDate,
          term: res.term,
          totalAmount: args.totalAmount,
        });
        return {
          due_date: schedule.due_date,
          schedule: schedule.schedule,
          term_name: schedule.term_name,
        };
      }
    }
    const due = computeDueDateFromTerms(
      args.documentDate,
      args.paymentTermsText
    );
    return { due_date: due, schedule: [], term_name: args.paymentTermsText || null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to compute due date',
    };
  }
}

export async function getAccountingConfigPaymentTerms(opts?: {
  search?: string;
  status?: 'all' | 'active' | 'archived';
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolvePaymentTermScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        terms: [] as AccountingPaymentTermListItem[],
        total: 0,
        page: 1,
        pageSize: 40,
      };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_payment_terms')
      .select('*', { count: 'exact' })
      .order('sequence', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const status = opts?.status || 'active';
    if (status === 'active') q = q.eq('is_active', true);
    if (status === 'archived') q = q.eq('is_active', false);

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_payment_terms|does not exist/i.test(error.message)) {
        return {
          terms: [] as AccountingPaymentTermListItem[],
          total: 0,
          page,
          pageSize,
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const ids = rows.map((r) => String(r.id));
    const orgIds = [
      ...new Set(rows.map((r) => String(r.organization_id || '')).filter(Boolean)),
    ];

    const [{ data: allLines }, { data: orgs }] = await Promise.all([
      ids.length
        ? supabase
            .from('accounting_payment_term_lines')
            .select('*')
            .in('payment_term_id', ids)
            .order('sequence', { ascending: true })
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      orgIds.length
        ? supabase.from('organizations').select('id, name').in('id', orgIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const linesByTerm = new Map<string, AccountingPaymentTermLine[]>();
    for (const l of allLines || []) {
      const tid = String(l.payment_term_id);
      const list = linesByTerm.get(tid) || [];
      list.push({
        id: String(l.id),
        sequence: Number(l.sequence) || 10,
        value_amount_type: (String(l.value_amount_type) === 'fixed'
          ? 'fixed'
          : 'percent') as PaymentTermValueType,
        value_amount: Number(l.value_amount) || 0,
        nb_days: Number(l.nb_days) || 0,
        delay_type: String(l.delay_type || 'days_after') as PaymentTermDelayType,
      });
      linesByTerm.set(tid, list);
    }

    const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

    const terms: AccountingPaymentTermListItem[] = rows.map((r) => {
      const lines = linesByTerm.get(String(r.id)) || [];
      return {
        id: String(r.id),
        name: String(r.name || ''),
        code: r.code ? String(r.code) : null,
        note: r.note ? String(r.note) : null,
        organization_id: r.organization_id ? String(r.organization_id) : null,
        organization_name: r.organization_id
          ? oMap.get(String(r.organization_id)) || null
          : 'Shared',
        is_active: r.is_active !== false,
        sequence: Number(r.sequence) || 10,
        line_count: lines.length,
        summary: summarizeLines(lines),
        updated_at: String(r.updated_at || ''),
      };
    });

    return { terms, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payment terms',
    };
  }
}

export async function getAccountingConfigPaymentTermDetail(termId: string) {
  try {
    const scope = await resolvePaymentTermScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_payment_terms')
      .select('*')
      .eq('id', termId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Payment term not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Payment term not in the selected organization' };
    }

    const { data: lines } = await supabase
      .from('accounting_payment_term_lines')
      .select('*')
      .eq('payment_term_id', termId)
      .order('sequence', { ascending: true });

    const mappedLines: AccountingPaymentTermLine[] = (lines || []).map((l) => ({
      id: String(l.id),
      sequence: Number(l.sequence) || 10,
      value_amount_type: (String(l.value_amount_type) === 'fixed'
        ? 'fixed'
        : 'percent') as PaymentTermValueType,
      value_amount: Number(l.value_amount) || 0,
      nb_days: Number(l.nb_days) || 0,
      delay_type: String(l.delay_type || 'days_after') as PaymentTermDelayType,
    }));

    let organization_name: string | null = 'Shared';
    if (row.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', row.organization_id)
        .maybeSingle();
      organization_name = org?.name ? String(org.name) : null;
    }

    const detail: AccountingPaymentTermDetail = {
      id: String(row.id),
      name: String(row.name || ''),
      code: row.code ? String(row.code) : null,
      note: row.note ? String(row.note) : null,
      organization_id: row.organization_id ? String(row.organization_id) : null,
      organization_name,
      is_active: row.is_active !== false,
      sequence: Number(row.sequence) || 10,
      line_count: mappedLines.length,
      summary: summarizeLines(mappedLines),
      updated_at: String(row.updated_at || ''),
      created_at: String(row.created_at || ''),
      created_by: row.created_by ? String(row.created_by) : null,
      updated_by: row.updated_by ? String(row.updated_by) : null,
      lines: mappedLines,
    };

    return { term: detail };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payment term',
    };
  }
}

function validateLines(lines: PaymentTermLineDef[]) {
  if (!lines.length) return 'At least one payment term line is required';
  const percentSum = lines
    .filter((l) => l.value_amount_type === 'percent')
    .reduce((s, l) => s + (Number(l.value_amount) || 0), 0);
  const hasPercent = lines.some((l) => l.value_amount_type === 'percent');
  if (hasPercent && Math.abs(percentSum - 100) > 0.05 && percentSum > 0) {
    // Allow fixed+percent mix; only warn when all percent and not 100
    const allPercent = lines.every((l) => l.value_amount_type === 'percent');
    if (allPercent) {
      return 'Percent lines must total 100%';
    }
  }
  for (const l of lines) {
    if ((Number(l.value_amount) || 0) < 0) return 'Line amounts cannot be negative';
    if ((Number(l.nb_days) || 0) < 0) return 'Days cannot be negative';
  }
  return null;
}

export async function createAccountingConfigPaymentTerm(payload: {
  name: string;
  code?: string | null;
  note?: string | null;
  sequence?: number;
  orgSpecific?: boolean;
  lines: Array<{
    sequence?: number;
    value_amount_type: PaymentTermValueType;
    value_amount: number;
    nb_days: number;
    delay_type: PaymentTermDelayType;
  }>;
}) {
  try {
    const scope = await resolvePaymentTermScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const name = String(payload.name || '').trim();
    if (!name) return { error: 'Payment term name is required' };

    const lines: PaymentTermLineDef[] = (payload.lines || []).map((l, i) => ({
      sequence: l.sequence ?? (i + 1) * 10,
      value_amount_type: l.value_amount_type || 'percent',
      value_amount: Number(l.value_amount) || 0,
      nb_days: Math.max(0, Number(l.nb_days) || 0),
      delay_type: l.delay_type || 'days_after',
    }));
    const lineErr = validateLines(lines);
    if (lineErr) return { error: lineErr };

    const organizationId =
      payload.orgSpecific && scope.organizationId ? scope.organizationId : null;
    if (payload.orgSpecific && !scope.organizationId) {
      return {
        error: 'Select an organization to create an organization-specific term',
      };
    }

    const code = payload.code
      ? normalizePaymentTermCode(payload.code)
      : null;

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_payment_terms')
      .insert([
        {
          name,
          code,
          note: payload.note || null,
          sequence: payload.sequence ?? 100,
          organization_id: organizationId,
          is_active: true,
          created_by: scope.session.username,
          updated_by: scope.session.username,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('id')
      .single();

    if (error) {
      if (/accounting_payment_terms|does not exist|column/i.test(error.message)) {
        return {
          error:
            'Run enhance_accounting_payment_terms_foundation.sql in Supabase first.',
        };
      }
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Payment term name or code already exists' };
      }
      return { error: error.message };
    }

    const termId = String(data.id);
    const { error: lineError } = await supabase
      .from('accounting_payment_term_lines')
      .insert(
        lines.map((l) => ({
          payment_term_id: termId,
          sequence: l.sequence,
          value_amount_type: l.value_amount_type,
          value_amount: l.value_amount,
          nb_days: l.nb_days,
          delay_type: l.delay_type,
        }))
      );
    if (lineError) return { error: lineError.message };

    return { termId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create payment term',
    };
  }
}

export async function updateAccountingConfigPaymentTerm(
  termId: string,
  payload: {
    name?: string;
    code?: string | null;
    note?: string | null;
    sequence?: number;
    is_active?: boolean;
    lines?: Array<{
      sequence?: number;
      value_amount_type: PaymentTermValueType;
      value_amount: number;
      nb_days: number;
      delay_type: PaymentTermDelayType;
    }>;
  }
) {
  try {
    const scope = await resolvePaymentTermScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('accounting_payment_terms')
      .select('*')
      .eq('id', termId)
      .maybeSingle();
    if (!existing) return { error: 'Payment term not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      existing.organization_id &&
      String(existing.organization_id) !== scope.organizationId
    ) {
      return { error: 'Payment term not in the selected organization' };
    }

    const patch: Record<string, unknown> = {
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) {
      const name = String(payload.name).trim();
      if (!name) return { error: 'Payment term name is required' };
      patch.name = name;
    }
    if (payload.code !== undefined) {
      patch.code = payload.code ? normalizePaymentTermCode(payload.code) : null;
    }
    if (payload.note !== undefined) patch.note = payload.note || null;
    if (payload.sequence !== undefined) patch.sequence = Number(payload.sequence) || 10;
    if (payload.is_active !== undefined) patch.is_active = payload.is_active;

    const { error } = await supabase
      .from('accounting_payment_terms')
      .update(patch)
      .eq('id', termId);
    if (error) {
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Payment term name or code already exists' };
      }
      return { error: error.message };
    }

    if (payload.lines) {
      const lines: PaymentTermLineDef[] = payload.lines.map((l, i) => ({
        sequence: l.sequence ?? (i + 1) * 10,
        value_amount_type: l.value_amount_type || 'percent',
        value_amount: Number(l.value_amount) || 0,
        nb_days: Math.max(0, Number(l.nb_days) || 0),
        delay_type: l.delay_type || 'days_after',
      }));
      const lineErr = validateLines(lines);
      if (lineErr) return { error: lineErr };

      await supabase
        .from('accounting_payment_term_lines')
        .delete()
        .eq('payment_term_id', termId);

      const { error: lineError } = await supabase
        .from('accounting_payment_term_lines')
        .insert(
          lines.map((l) => ({
            payment_term_id: termId,
            sequence: l.sequence,
            value_amount_type: l.value_amount_type,
            value_amount: l.value_amount,
            nb_days: l.nb_days,
            delay_type: l.delay_type,
          }))
        );
      if (lineError) return { error: lineError.message };
    }

    return getAccountingConfigPaymentTermDetail(termId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update payment term',
    };
  }
}

export async function archiveAccountingConfigPaymentTerm(termId: string) {
  return updateAccountingConfigPaymentTerm(termId, { is_active: false });
}

export async function restoreAccountingConfigPaymentTerm(termId: string) {
  return updateAccountingConfigPaymentTerm(termId, { is_active: true });
}

export async function ensureDefaultAccountingPaymentTerms() {
  try {
    const scope = await resolvePaymentTermScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const defaults: Array<{
      name: string;
      code: string;
      note: string;
      sequence: number;
      nb_days: number;
      delay_type: PaymentTermDelayType;
    }> = [
      {
        name: 'Immediate',
        code: 'IMMEDIATE',
        note: 'Due on invoice/bill date',
        sequence: 10,
        nb_days: 0,
        delay_type: 'days_after',
      },
      {
        name: '15 Days',
        code: 'NET15',
        note: 'Net 15 days',
        sequence: 20,
        nb_days: 15,
        delay_type: 'days_after',
      },
      {
        name: '30 Days',
        code: 'NET30',
        note: 'Net 30 days',
        sequence: 30,
        nb_days: 30,
        delay_type: 'days_after',
      },
      {
        name: '45 Days',
        code: 'NET45',
        note: 'Net 45 days',
        sequence: 40,
        nb_days: 45,
        delay_type: 'days_after',
      },
      {
        name: '60 Days',
        code: 'NET60',
        note: 'Net 60 days',
        sequence: 50,
        nb_days: 60,
        delay_type: 'days_after',
      },
      {
        name: 'End of Next Month',
        code: 'EOM_NEXT',
        note: 'Due at end of next month',
        sequence: 60,
        nb_days: 0,
        delay_type: 'days_end_of_month',
      },
    ];

    let created = 0;
    for (const d of defaults) {
      const { data: existing } = await supabase
        .from('accounting_payment_terms')
        .select('id')
        .eq('code', d.code)
        .is('organization_id', null)
        .maybeSingle();
      if (existing?.id) continue;

      const { data: term, error } = await supabase
        .from('accounting_payment_terms')
        .insert([
          {
            name: d.name,
            code: d.code,
            note: d.note,
            sequence: d.sequence,
            organization_id: null,
            is_active: true,
            created_by: scope.session?.username || null,
            updated_by: scope.session?.username || null,
          },
        ])
        .select('id')
        .single();
      if (error || !term) continue;

      await supabase.from('accounting_payment_term_lines').insert([
        {
          payment_term_id: term.id,
          sequence: 10,
          value_amount_type: 'percent',
          value_amount: 100,
          nb_days: d.nb_days,
          delay_type: d.delay_type,
        },
      ]);
      created += 1;
    }

    return { created };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to ensure default payment terms',
    };
  }
}
