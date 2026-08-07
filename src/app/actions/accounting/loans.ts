'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import {
  buildLoanAmortizationSchedule,
  summarizeLoanSchedule,
  type LoanInstallmentFrequency,
  type LoanInterestMethod,
} from '@/lib/accounting-loans';
import type { AutoPostingLine } from '@/lib/accounting-journal-posting';

export type AccountingLoanStatus =
  | 'draft'
  | 'active'
  | 'partially_paid'
  | 'fully_paid'
  | 'closed'
  | 'cancelled';

export type AccountingLoanType =
  | 'bank_loan'
  | 'vehicle_loan'
  | 'equipment_loan'
  | 'business_loan'
  | 'mortgage'
  | 'internal_loan'
  | 'other';

export type AccountingLoanDirection = 'borrowed' | 'issued';

export type AccountingLoanInstallment = {
  id: string;
  loan_id: string;
  sequence: number;
  due_date: string;
  opening_balance: number;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  closing_balance: number;
  status: 'pending' | 'paid' | 'partial' | 'cancelled' | 'skipped';
  paid_amount: number;
  paid_date: string | null;
  journal_entry_id: string | null;
};

export type AccountingLoanListItem = {
  id: string;
  loan_number: string;
  name: string;
  lender_name: string | null;
  loan_type: AccountingLoanType;
  organization_id: string;
  organization_name: string | null;
  principal_amount: number;
  interest_rate: number;
  remaining_balance: number;
  monthly_installment: number;
  start_date: string;
  end_date: string | null;
  next_installment_date: string | null;
  status: AccountingLoanStatus;
  created_at: string;
};

export type AccountingLoanDetail = AccountingLoanListItem & {
  direction: AccountingLoanDirection;
  reference_number: string | null;
  contact_id: string | null;
  interest_method: LoanInterestMethod;
  first_installment_date: string | null;
  total_installments: number;
  installment_frequency: LoanInstallmentFrequency;
  currency: string;
  total_interest: number;
  total_payable: number;
  principal_paid: number;
  interest_paid: number;
  remaining_principal: number;
  remaining_interest: number;
  journal_id: string | null;
  liability_account_id: string | null;
  interest_expense_account_id: string | null;
  interest_payable_account_id: string | null;
  bank_account_id: string | null;
  payment_account_id: string | null;
  disbursement_journal_entry_id: string | null;
  notes: string | null;
  installments: AccountingLoanInstallment[];
  installment_count: number;
  paid_count: number;
  je_count: number;
};

export type AccountingLoanLog = {
  id: string;
  loan_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  performed_by: string | null;
  performed_at: string;
  details: Record<string, unknown>;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
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

async function allocateLoanNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string
) {
  const { data: seq } = await supabase
    .from('accounting_loan_sequences')
    .select('next_number, prefix')
    .eq('organization_id', organizationId)
    .maybeSingle();

  let next = 1;
  let prefix = 'LN';
  if (seq) {
    next = Number(seq.next_number) || 1;
    prefix = String(seq.prefix || 'LN');
    await supabase
      .from('accounting_loan_sequences')
      .update({ next_number: next + 1, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId);
  } else {
    await supabase.from('accounting_loan_sequences').insert([
      { organization_id: organizationId, prefix: 'LN', next_number: 2 },
    ]);
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

async function appendLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  opts: {
    loanId: string;
    organizationId?: string | null;
    action: string;
    performedBy: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    details?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('accounting_loan_logs').insert([
      {
        loan_id: opts.loanId,
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

function mapInstallment(r: Record<string, unknown>): AccountingLoanInstallment {
  return {
    id: String(r.id),
    loan_id: String(r.loan_id),
    sequence: Number(r.sequence) || 0,
    due_date: String(r.due_date || '').slice(0, 10),
    opening_balance: Number(r.opening_balance) || 0,
    principal_amount: Number(r.principal_amount) || 0,
    interest_amount: Number(r.interest_amount) || 0,
    total_amount: Number(r.total_amount) || 0,
    closing_balance: Number(r.closing_balance) || 0,
    status: String(r.status || 'pending') as AccountingLoanInstallment['status'],
    paid_amount: Number(r.paid_amount) || 0,
    paid_date: r.paid_date ? String(r.paid_date).slice(0, 10) : null,
    journal_entry_id: r.journal_entry_id ? String(r.journal_entry_id) : null,
  };
}

function mapLoanList(
  r: Record<string, unknown>,
  orgName: string | null
): AccountingLoanListItem {
  return {
    id: String(r.id),
    loan_number: String(r.loan_number),
    name: String(r.name || ''),
    lender_name: r.lender_name ? String(r.lender_name) : null,
    loan_type: String(r.loan_type || 'bank_loan') as AccountingLoanType,
    organization_id: String(r.organization_id),
    organization_name: orgName,
    principal_amount: Number(r.principal_amount) || 0,
    interest_rate: Number(r.interest_rate) || 0,
    remaining_balance: Number(r.remaining_balance) || 0,
    monthly_installment: Number(r.monthly_installment) || 0,
    start_date: String(r.start_date || '').slice(0, 10),
    end_date: r.end_date ? String(r.end_date).slice(0, 10) : null,
    next_installment_date: r.next_installment_date
      ? String(r.next_installment_date).slice(0, 10)
      : null,
    status: String(r.status) as AccountingLoanStatus,
    created_at: String(r.created_at || ''),
  };
}

async function rebuildInstallments(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  loan: {
    id: string;
    organization_id: string;
    principal_amount: number;
    interest_rate: number;
    total_installments: number;
    first_installment_date: string | null;
    start_date: string;
    installment_frequency: string;
    interest_method: string;
  }
) {
  const { data: existing } = await supabase
    .from('accounting_loan_installments')
    .select('id, status, sequence')
    .eq('loan_id', loan.id);

  const paid = (existing || []).filter((d) =>
    ['paid', 'partial'].includes(String(d.status))
  );
  const paidSeqs = new Set(paid.map((d) => Number(d.sequence)));

  await supabase
    .from('accounting_loan_installments')
    .delete()
    .eq('loan_id', loan.id)
    .in('status', ['pending', 'cancelled', 'skipped']);

  const first =
    loan.first_installment_date ||
    loan.start_date ||
    new Date().toISOString().slice(0, 10);

  const full = buildLoanAmortizationSchedule({
    principal: Number(loan.principal_amount) || 0,
    annualRatePercent: Number(loan.interest_rate) || 0,
    numberOfInstallments: Number(loan.total_installments) || 1,
    firstInstallmentDate: first,
    frequency: (loan.installment_frequency || 'monthly') as LoanInstallmentFrequency,
    interestMethod: (loan.interest_method || 'reducing_balance') as LoanInterestMethod,
  });

  const toInsert = full
    .filter((l) => !paidSeqs.has(l.sequence))
    .map((l) => ({
      loan_id: loan.id,
      organization_id: loan.organization_id,
      sequence: l.sequence,
      due_date: l.due_date,
      opening_balance: l.opening_balance,
      principal_amount: l.principal_amount,
      interest_amount: l.interest_amount,
      total_amount: l.total_amount,
      closing_balance: l.closing_balance,
      status: 'pending',
      paid_amount: 0,
      updated_at: new Date().toISOString(),
    }));

  if (toInsert.length) {
    await supabase.from('accounting_loan_installments').insert(toInsert);
  }

  const summary = summarizeLoanSchedule(full);
  const { data: allInst } = await supabase
    .from('accounting_loan_installments')
    .select('*')
    .eq('loan_id', loan.id)
    .order('sequence', { ascending: true });

  const rows = allInst || [];
  const principalPaid = round2(
    rows
      .filter((r) => String(r.status) === 'paid')
      .reduce((s, r) => s + (Number(r.principal_amount) || 0), 0)
  );
  const interestPaid = round2(
    rows
      .filter((r) => String(r.status) === 'paid')
      .reduce((s, r) => s + (Number(r.interest_amount) || 0), 0)
  );
  const nextPending = rows.find((r) => String(r.status) === 'pending');

  await supabase
    .from('accounting_loans')
    .update({
      total_interest: summary.totalInterest,
      total_payable: summary.totalPayable,
      monthly_installment: summary.monthlyInstallment,
      end_date: summary.endDate,
      remaining_principal: round2(
        Math.max(0, (Number(loan.principal_amount) || 0) - principalPaid)
      ),
      remaining_interest: round2(
        Math.max(0, summary.totalInterest - interestPaid)
      ),
      remaining_balance: round2(
        Math.max(
          0,
          summary.totalPayable - principalPaid - interestPaid
        )
      ),
      principal_paid: principalPaid,
      interest_paid: interestPaid,
      next_installment_date: nextPending
        ? String(nextPending.due_date).slice(0, 10)
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', loan.id);

  return { count: full.length, summary };
}

function deriveStatusFromPayments(
  current: string,
  paidCount: number,
  totalCount: number
): AccountingLoanStatus {
  if (current === 'cancelled' || current === 'closed' || current === 'draft') {
    return current as AccountingLoanStatus;
  }
  if (totalCount > 0 && paidCount >= totalCount) return 'fully_paid';
  if (paidCount > 0) return 'partially_paid';
  return 'active';
}

export async function getAccountingLoans(opts?: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { loans: [] as AccountingLoanListItem[], total: 0, page: 1, pageSize: 40 };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_loans')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    const status = (opts?.status || 'all').toLowerCase();
    if (status && status !== 'all') {
      q = q.eq('status', status);
    }

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(
        `loan_number.ilike.%${search}%,name.ilike.%${search}%,lender_name.ilike.%${search}%,reference_number.ilike.%${search}%`
      );
    }

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_loans|relation/i.test(error.message)) {
        return {
          loans: [] as AccountingLoanListItem[],
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

    const loans = rows.map((r) =>
      mapLoanList(r as Record<string, unknown>, oMap.get(String(r.organization_id)) || null)
    );

    return { loans, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load loans',
    };
  }
}

export async function getAccountingLoanDetail(loanId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_loans')
      .select('*')
      .eq('id', loanId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Loan not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Loan not in the selected organization' };
    }

    const [{ data: org }, { data: inst }] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name')
        .eq('id', row.organization_id)
        .maybeSingle(),
      supabase
        .from('accounting_loan_installments')
        .select('*')
        .eq('loan_id', loanId)
        .order('sequence', { ascending: true }),
    ]);

    const installments = (inst || []).map((r) =>
      mapInstallment(r as Record<string, unknown>)
    );
    const paidCount = installments.filter((i) => i.status === 'paid').length;
    const jeCount =
      (row.disbursement_journal_entry_id ? 1 : 0) +
      installments.filter((i) => i.journal_entry_id).length;

    const base = mapLoanList(
      row as Record<string, unknown>,
      org?.name ? String(org.name) : null
    );

    const asset: AccountingLoanDetail = {
      ...base,
      direction: String(row.direction || 'borrowed') as AccountingLoanDirection,
      reference_number: row.reference_number ? String(row.reference_number) : null,
      contact_id: row.contact_id ? String(row.contact_id) : null,
      interest_method: String(row.interest_method || 'reducing_balance') as LoanInterestMethod,
      first_installment_date: row.first_installment_date
        ? String(row.first_installment_date).slice(0, 10)
        : null,
      total_installments: Number(row.total_installments) || 0,
      installment_frequency: String(
        row.installment_frequency || 'monthly'
      ) as LoanInstallmentFrequency,
      currency: String(row.currency || 'PKR'),
      total_interest: Number(row.total_interest) || 0,
      total_payable: Number(row.total_payable) || 0,
      principal_paid: Number(row.principal_paid) || 0,
      interest_paid: Number(row.interest_paid) || 0,
      remaining_principal: Number(row.remaining_principal) || 0,
      remaining_interest: Number(row.remaining_interest) || 0,
      journal_id: row.journal_id ? String(row.journal_id) : null,
      liability_account_id: row.liability_account_id
        ? String(row.liability_account_id)
        : null,
      interest_expense_account_id: row.interest_expense_account_id
        ? String(row.interest_expense_account_id)
        : null,
      interest_payable_account_id: row.interest_payable_account_id
        ? String(row.interest_payable_account_id)
        : null,
      bank_account_id: row.bank_account_id ? String(row.bank_account_id) : null,
      payment_account_id: row.payment_account_id
        ? String(row.payment_account_id)
        : null,
      disbursement_journal_entry_id: row.disbursement_journal_entry_id
        ? String(row.disbursement_journal_entry_id)
        : null,
      notes: row.notes ? String(row.notes) : null,
      installments,
      installment_count: installments.length,
      paid_count: paidCount,
      je_count: jeCount,
    };

    return { loan: asset };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load loan',
    };
  }
}

export async function createAccountingLoan() {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };
    if (!scope.organizationId) {
      return { error: 'Select an organization to create a loan' };
    }

    const supabase = await createAdminClient();
    const loanNumber = await allocateLoanNumber(supabase, scope.organizationId);
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('accounting_loans')
      .insert([
        {
          organization_id: scope.organizationId,
          loan_number: loanNumber,
          name: 'New Loan',
          status: 'draft',
          direction: 'borrowed',
          loan_type: 'bank_loan',
          principal_amount: 0,
          interest_rate: 0,
          interest_method: 'reducing_balance',
          start_date: today,
          first_installment_date: today,
          total_installments: 12,
          installment_frequency: 'monthly',
          remaining_balance: 0,
          remaining_principal: 0,
          created_by: scope.session.username,
          updated_by: scope.session.username,
        },
      ])
      .select('id')
      .single();

    if (error) {
      if (/accounting_loans|relation/i.test(error.message)) {
        return {
          error: 'Run create_accounting_loans_module.sql in Supabase first.',
        };
      }
      return { error: error.message };
    }

    await appendLog(supabase, {
      loanId: String(data.id),
      organizationId: scope.organizationId,
      action: 'loan_created',
      performedBy: scope.session.username,
      previousStatus: null,
      newStatus: 'draft',
    });

    return { loanId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create loan',
    };
  }
}

export async function updateAccountingLoan(
  loanId: string,
  payload: {
    name?: string;
    lender_name?: string | null;
    loan_type?: string;
    direction?: string;
    reference_number?: string | null;
    contact_id?: string | null;
    principal_amount?: number;
    interest_rate?: number;
    interest_method?: string;
    start_date?: string;
    first_installment_date?: string | null;
    total_installments?: number;
    installment_frequency?: string;
    journal_id?: string | null;
    liability_account_id?: string | null;
    interest_expense_account_id?: string | null;
    interest_payable_account_id?: string | null;
    bank_account_id?: string | null;
    payment_account_id?: string | null;
    notes?: string | null;
    rebuild_schedule?: boolean;
  }
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('accounting_loans')
      .select('*')
      .eq('id', loanId)
      .maybeSingle();
    if (!existing) return { error: 'Loan not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(existing.organization_id) !== scope.organizationId
    ) {
      return { error: 'Loan not in the selected organization' };
    }

    const status = String(existing.status);
    if (status === 'cancelled' || status === 'closed') {
      return { error: 'Cannot edit a closed or cancelled loan' };
    }

    const isDraft = status === 'draft';
    const patch: Record<string, unknown> = {
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) patch.name = String(payload.name).trim() || 'New Loan';
    if (payload.lender_name !== undefined) patch.lender_name = payload.lender_name || null;
    if (payload.reference_number !== undefined) {
      patch.reference_number = payload.reference_number || null;
    }
    if (payload.contact_id !== undefined) patch.contact_id = payload.contact_id || null;
    if (payload.notes !== undefined) patch.notes = payload.notes || null;
    if (payload.journal_id !== undefined) patch.journal_id = payload.journal_id || null;
    if (payload.liability_account_id !== undefined) {
      patch.liability_account_id = payload.liability_account_id || null;
    }
    if (payload.interest_expense_account_id !== undefined) {
      patch.interest_expense_account_id = payload.interest_expense_account_id || null;
    }
    if (payload.interest_payable_account_id !== undefined) {
      patch.interest_payable_account_id = payload.interest_payable_account_id || null;
    }
    if (payload.bank_account_id !== undefined) {
      patch.bank_account_id = payload.bank_account_id || null;
    }
    if (payload.payment_account_id !== undefined) {
      patch.payment_account_id = payload.payment_account_id || null;
    }

    if (isDraft) {
      if (payload.loan_type !== undefined) patch.loan_type = payload.loan_type;
      if (payload.direction !== undefined) patch.direction = payload.direction;
      if (payload.principal_amount !== undefined) {
        patch.principal_amount = round2(Math.max(0, Number(payload.principal_amount) || 0));
      }
      if (payload.interest_rate !== undefined) {
        patch.interest_rate = Math.max(0, Number(payload.interest_rate) || 0);
      }
      if (payload.interest_method !== undefined) {
        patch.interest_method = payload.interest_method;
      }
      if (payload.start_date !== undefined) patch.start_date = payload.start_date;
      if (payload.first_installment_date !== undefined) {
        patch.first_installment_date = payload.first_installment_date || null;
      }
      if (payload.total_installments !== undefined) {
        patch.total_installments = Math.max(
          1,
          Math.floor(Number(payload.total_installments) || 1)
        );
      }
      if (payload.installment_frequency !== undefined) {
        patch.installment_frequency = payload.installment_frequency;
      }
    }

    const { error } = await supabase
      .from('accounting_loans')
      .update(patch)
      .eq('id', loanId);
    if (error) return { error: error.message };

    const shouldRebuild =
      isDraft &&
      (payload.rebuild_schedule !== false) &&
      (payload.principal_amount !== undefined ||
        payload.interest_rate !== undefined ||
        payload.interest_method !== undefined ||
        payload.total_installments !== undefined ||
        payload.installment_frequency !== undefined ||
        payload.first_installment_date !== undefined ||
        payload.start_date !== undefined ||
        payload.rebuild_schedule === true);

    if (shouldRebuild || payload.rebuild_schedule === true) {
      const { data: refreshed } = await supabase
        .from('accounting_loans')
        .select('*')
        .eq('id', loanId)
        .maybeSingle();
      if (refreshed) {
        await rebuildInstallments(supabase, {
          id: String(refreshed.id),
          organization_id: String(refreshed.organization_id),
          principal_amount: Number(refreshed.principal_amount) || 0,
          interest_rate: Number(refreshed.interest_rate) || 0,
          total_installments: Number(refreshed.total_installments) || 1,
          first_installment_date: refreshed.first_installment_date
            ? String(refreshed.first_installment_date).slice(0, 10)
            : null,
          start_date: String(refreshed.start_date).slice(0, 10),
          installment_frequency: String(refreshed.installment_frequency),
          interest_method: String(refreshed.interest_method),
        });
        await appendLog(supabase, {
          loanId,
          organizationId: String(existing.organization_id),
          action: 'installment_generated',
          performedBy: scope.session.username,
          previousStatus: status,
          newStatus: status,
        });
      }
    }

    await appendLog(supabase, {
      loanId,
      organizationId: String(existing.organization_id),
      action: 'loan_updated',
      performedBy: scope.session.username,
      previousStatus: status,
      newStatus: status,
      details: { fields: Object.keys(payload) },
    });

    return getAccountingLoanDetail(loanId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update loan',
    };
  }
}

/** Confirm draft → Active + disbursement JE + schedule. */
export async function confirmAccountingLoan(loanId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: loan } = await supabase
      .from('accounting_loans')
      .select('*')
      .eq('id', loanId)
      .maybeSingle();
    if (!loan) return { error: 'Loan not found' };
    if (String(loan.status) !== 'draft') {
      return { error: 'Only draft loans can be confirmed' };
    }
    if (!(Number(loan.principal_amount) > 0)) {
      return { error: 'Principal amount must be greater than zero' };
    }
    if (!String(loan.name || '').trim() || String(loan.name) === 'New Loan') {
      return { error: 'Loan name is required' };
    }

    await rebuildInstallments(supabase, {
      id: String(loan.id),
      organization_id: String(loan.organization_id),
      principal_amount: Number(loan.principal_amount) || 0,
      interest_rate: Number(loan.interest_rate) || 0,
      total_installments: Number(loan.total_installments) || 1,
      first_installment_date: loan.first_installment_date
        ? String(loan.first_installment_date).slice(0, 10)
        : null,
      start_date: String(loan.start_date).slice(0, 10),
      installment_frequency: String(loan.installment_frequency),
      interest_method: String(loan.interest_method),
    });

    let disbursementJeId: string | null = loan.disbursement_journal_entry_id
      ? String(loan.disbursement_journal_entry_id)
      : null;

    try {
      const { getJournalIdByType } = await import('@/lib/accounting-journal-posting');
      const { createAndPostAutomaticJournalEntry } = await import(
        '@/app/actions/accounting/journal-entries'
      );

      let journalId = loan.journal_id ? String(loan.journal_id) : null;
      if (!journalId) {
        const j = await getJournalIdByType('general', String(loan.organization_id));
        journalId = String(j.id);
      }

      const bankId = await resolveAccountId(
        supabase,
        loan.bank_account_id
          ? String(loan.bank_account_id)
          : loan.payment_account_id
            ? String(loan.payment_account_id)
            : null,
        ['1000', '1010', '1020', '1100'],
        'asset'
      );
      const liabilityId = await resolveAccountId(
        supabase,
        loan.liability_account_id ? String(loan.liability_account_id) : null,
        ['2500', '2400', '2200', '2000'],
        'liability'
      );

      if (bankId && liabilityId && journalId) {
        const amount = round2(Number(loan.principal_amount) || 0);
        const direction = String(loan.direction || 'borrowed');
        // borrowed: Dr Bank / Cr Liability; issued: Dr Receivable(Liability acct) / Cr Bank
        const lines: AutoPostingLine[] =
          direction === 'issued'
            ? [
                {
                  account_id: liabilityId,
                  label: `Loan issued ${loan.loan_number} — ${loan.name}`,
                  partner_name: loan.lender_name ? String(loan.lender_name) : null,
                  debit: amount,
                  credit: 0,
                },
                {
                  account_id: bankId,
                  label: `Loan disbursement ${loan.loan_number}`,
                  partner_name: loan.lender_name ? String(loan.lender_name) : null,
                  debit: 0,
                  credit: amount,
                },
              ]
            : [
                {
                  account_id: bankId,
                  label: `Loan received ${loan.loan_number} — ${loan.name}`,
                  partner_name: loan.lender_name ? String(loan.lender_name) : null,
                  debit: amount,
                  credit: 0,
                },
                {
                  account_id: liabilityId,
                  label: `Loan liability ${loan.loan_number}`,
                  partner_name: loan.lender_name ? String(loan.lender_name) : null,
                  debit: 0,
                  credit: amount,
                },
              ];

        const je = await createAndPostAutomaticJournalEntry({
          organizationId: String(loan.organization_id),
          journalId,
          entryDate: String(loan.start_date).slice(0, 10),
          reference: String(loan.loan_number),
          partnerName: loan.lender_name ? String(loan.lender_name) : null,
          contactId: loan.contact_id ? String(loan.contact_id) : null,
          sourceType: 'loan_disbursement' as never,
          sourceId: loanId,
          sourceNumber: String(loan.loan_number),
          lines,
          performedBy: scope.session.username,
        });
        if ('journalEntryId' in je && je.journalEntryId) {
          disbursementJeId = je.journalEntryId ?? null;
        }
      }
    } catch (err) {
      console.warn('[loans] disbursement JE:', err);
    }

    const principal = round2(Number(loan.principal_amount) || 0);
    await supabase
      .from('accounting_loans')
      .update({
        status: 'active',
        remaining_principal: principal,
        disbursement_journal_entry_id: disbursementJeId,
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', loanId);

    await appendLog(supabase, {
      loanId,
      organizationId: String(loan.organization_id),
      action: 'loan_confirmed',
      performedBy: scope.session.username,
      previousStatus: 'draft',
      newStatus: 'active',
      details: { disbursement_journal_entry_id: disbursementJeId },
    });

    return getAccountingLoanDetail(loanId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to confirm loan',
    };
  }
}

/** Pay a single installment → JE + status update. */
export async function payAccountingLoanInstallment(
  installmentId: string,
  opts?: { paymentDate?: string }
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: inst } = await supabase
      .from('accounting_loan_installments')
      .select('*')
      .eq('id', installmentId)
      .maybeSingle();
    if (!inst) return { error: 'Installment not found' };
    if (String(inst.status) === 'paid') {
      return { error: 'Installment already paid' };
    }
    if (String(inst.status) === 'cancelled') {
      return { error: 'Installment is cancelled' };
    }

    const { data: loan } = await supabase
      .from('accounting_loans')
      .select('*')
      .eq('id', inst.loan_id)
      .maybeSingle();
    if (!loan) return { error: 'Loan not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(loan.organization_id) !== scope.organizationId
    ) {
      return { error: 'Loan not in the selected organization' };
    }

    const loanStatus = String(loan.status);
    if (['draft', 'cancelled', 'closed'].includes(loanStatus)) {
      return { error: 'Loan is not open for payments' };
    }

    const paymentDate =
      (opts?.paymentDate || inst.due_date || new Date().toISOString().slice(0, 10)).slice(
        0,
        10
      );
    const principalAmt = round2(Number(inst.principal_amount) || 0);
    const interestAmt = round2(Number(inst.interest_amount) || 0);
    const totalAmt = round2(principalAmt + interestAmt);

    let jeId: string | null = inst.journal_entry_id
      ? String(inst.journal_entry_id)
      : null;

    try {
      const { getJournalIdByType } = await import('@/lib/accounting-journal-posting');
      const { createAndPostAutomaticJournalEntry } = await import(
        '@/app/actions/accounting/journal-entries'
      );

      let journalId = loan.journal_id ? String(loan.journal_id) : null;
      if (!journalId) {
        const j = await getJournalIdByType('general', String(loan.organization_id));
        journalId = String(j.id);
      }

      const liabilityId = await resolveAccountId(
        supabase,
        loan.liability_account_id ? String(loan.liability_account_id) : null,
        ['2500', '2400', '2200', '2000'],
        'liability'
      );
      const interestId = await resolveAccountId(
        supabase,
        loan.interest_expense_account_id
          ? String(loan.interest_expense_account_id)
          : null,
        ['6100', '6000', '5200', '5000'],
        'expense'
      );
      const bankId = await resolveAccountId(
        supabase,
        loan.payment_account_id
          ? String(loan.payment_account_id)
          : loan.bank_account_id
            ? String(loan.bank_account_id)
            : null,
        ['1000', '1010', '1020', '1100'],
        'asset'
      );

      if (liabilityId && bankId && journalId && totalAmt > 0) {
        const direction = String(loan.direction || 'borrowed');
        const label = `${loan.loan_number} installment #${inst.sequence}`;
        const lines: AutoPostingLine[] = [];

        if (direction === 'issued') {
          // Borrower pays us: Dr Bank, Cr Loan receivable (principal), Cr Interest income
          lines.push({
            account_id: bankId,
            label,
            partner_name: loan.lender_name ? String(loan.lender_name) : null,
            debit: totalAmt,
            credit: 0,
          });
          if (principalAmt > 0) {
            lines.push({
              account_id: liabilityId,
              label: `${label} — principal`,
              partner_name: loan.lender_name ? String(loan.lender_name) : null,
              debit: 0,
              credit: principalAmt,
            });
          }
          if (interestAmt > 0 && interestId) {
            lines.push({
              account_id: interestId,
              label: `${label} — interest`,
              partner_name: loan.lender_name ? String(loan.lender_name) : null,
              debit: 0,
              credit: interestAmt,
            });
          } else if (interestAmt > 0) {
            // fold interest into receivable credit if no income account
            const last = lines[lines.length - 1];
            if (last) last.credit = round2((last.credit || 0) + interestAmt);
          }
        } else {
          // We repay lender: Dr Liability, Dr Interest expense, Cr Bank
          if (principalAmt > 0) {
            lines.push({
              account_id: liabilityId,
              label: `${label} — principal`,
              partner_name: loan.lender_name ? String(loan.lender_name) : null,
              debit: principalAmt,
              credit: 0,
            });
          }
          if (interestAmt > 0) {
            lines.push({
              account_id: interestId || liabilityId,
              label: `${label} — interest`,
              partner_name: loan.lender_name ? String(loan.lender_name) : null,
              debit: interestAmt,
              credit: 0,
            });
          }
          lines.push({
            account_id: bankId,
            label,
            partner_name: loan.lender_name ? String(loan.lender_name) : null,
            debit: 0,
            credit: totalAmt,
          });
        }

        const je = await createAndPostAutomaticJournalEntry({
          organizationId: String(loan.organization_id),
          journalId,
          entryDate: paymentDate,
          reference: `${loan.loan_number}-${inst.sequence}`,
          partnerName: loan.lender_name ? String(loan.lender_name) : null,
          contactId: loan.contact_id ? String(loan.contact_id) : null,
          sourceType: 'loan_repayment' as never,
          sourceId: installmentId,
          sourceNumber: `${loan.loan_number}-${inst.sequence}`,
          lines,
          performedBy: scope.session.username,
        });
        if ('journalEntryId' in je && je.journalEntryId) {
          jeId = je.journalEntryId ?? null;
        }
        if ('error' in je && je.error && !('alreadyExists' in je && je.alreadyExists)) {
          return { error: je.error };
        }
      }
    } catch (err) {
      console.warn('[loans] repayment JE:', err);
    }

    await supabase
      .from('accounting_loan_installments')
      .update({
        status: 'paid',
        paid_amount: totalAmt,
        paid_date: paymentDate,
        journal_entry_id: jeId,
        paid_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', installmentId);

    const { data: allInst } = await supabase
      .from('accounting_loan_installments')
      .select('*')
      .eq('loan_id', loan.id)
      .order('sequence', { ascending: true });

    const rows = allInst || [];
    const paidRows = rows.filter((r) => String(r.status) === 'paid');
    const principalPaid = round2(
      paidRows.reduce((s, r) => s + (Number(r.principal_amount) || 0), 0)
    );
    const interestPaid = round2(
      paidRows.reduce((s, r) => s + (Number(r.interest_amount) || 0), 0)
    );
    const totalInterest = round2(Number(loan.total_interest) || 0);
    const totalPayable = round2(Number(loan.total_payable) || 0);
    const nextPending = rows.find((r) => String(r.status) === 'pending');
    const newStatus = deriveStatusFromPayments(
      loanStatus,
      paidRows.length,
      rows.length
    );

    await supabase
      .from('accounting_loans')
      .update({
        status: newStatus,
        principal_paid: principalPaid,
        interest_paid: interestPaid,
        remaining_principal: round2(
          Math.max(0, (Number(loan.principal_amount) || 0) - principalPaid)
        ),
        remaining_interest: round2(Math.max(0, totalInterest - interestPaid)),
        remaining_balance: round2(
          Math.max(0, totalPayable - principalPaid - interestPaid)
        ),
        next_installment_date: nextPending
          ? String(nextPending.due_date).slice(0, 10)
          : null,
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', loan.id);

    await appendLog(supabase, {
      loanId: String(loan.id),
      organizationId: String(loan.organization_id),
      action: 'installment_paid',
      performedBy: scope.session.username,
      previousStatus: loanStatus,
      newStatus,
      details: {
        installment_id: installmentId,
        sequence: inst.sequence,
        journal_entry_id: jeId,
        amount: totalAmt,
      },
    });

    return getAccountingLoanDetail(String(loan.id));
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to pay installment',
    };
  }
}

export async function closeAccountingLoan(loanId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: loan } = await supabase
      .from('accounting_loans')
      .select('*')
      .eq('id', loanId)
      .maybeSingle();
    if (!loan) return { error: 'Loan not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(loan.organization_id) !== scope.organizationId
    ) {
      return { error: 'Loan not in the selected organization' };
    }

    const status = String(loan.status);
    if (!['fully_paid', 'active', 'partially_paid'].includes(status)) {
      return { error: 'Only active or paid loans can be closed' };
    }
    if (status !== 'fully_paid' && round2(Number(loan.remaining_balance) || 0) > 0.01) {
      return { error: 'Pay all installments before closing, or mark as fully paid' };
    }

    await supabase
      .from('accounting_loans')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', loanId);

    await appendLog(supabase, {
      loanId,
      organizationId: String(loan.organization_id),
      action: 'loan_closed',
      performedBy: scope.session.username,
      previousStatus: status,
      newStatus: 'closed',
    });

    return getAccountingLoanDetail(loanId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to close loan',
    };
  }
}

export async function cancelAccountingLoan(loanId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: loan } = await supabase
      .from('accounting_loans')
      .select('id, status, organization_id')
      .eq('id', loanId)
      .maybeSingle();
    if (!loan) return { error: 'Loan not found' };
    if (String(loan.status) !== 'draft') {
      return { error: 'Only draft loans can be cancelled' };
    }

    await supabase
      .from('accounting_loans')
      .update({
        status: 'cancelled',
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', loanId);

    await appendLog(supabase, {
      loanId,
      organizationId: String(loan.organization_id),
      action: 'loan_cancelled',
      performedBy: scope.session.username,
      previousStatus: 'draft',
      newStatus: 'cancelled',
    });

    return getAccountingLoanDetail(loanId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to cancel loan',
    };
  }
}

export async function getAccountingLoanActivity(loanId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_loan_logs')
      .select('*')
      .eq('loan_id', loanId)
      .order('performed_at', { ascending: false })
      .limit(80);

    if (error) {
      if (/accounting_loan_logs|relation/i.test(error.message)) {
        return { logs: [] as AccountingLoanLog[] };
      }
      return { error: error.message };
    }

    const logs: AccountingLoanLog[] = (data || []).map((r) => ({
      id: String(r.id),
      loan_id: String(r.loan_id),
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
