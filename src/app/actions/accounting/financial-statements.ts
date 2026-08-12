'use server';

/**
 * Financial Statements server actions (Phases 1–4).
 * Statements · Ledgers · Partner Aging · Tax Report
 * Reads posted accounting_journal_* only — not legacy reporting.
 */

import { requireAccountingActionAccess } from '@/lib/accounting-page-access';
import {
  buildBalanceSheet,
  buildCashFlow,
  buildProfitAndLoss,
  buildTrialBalance,
  buildGeneralLedger,
  buildPartnerLedger,
  buildAgedReceivable,
  buildAgedPayable,
  buildTaxReport,
  resolveDatePeriod,
  type BalanceSheetReport,
  type CashFlowReport,
  type ProfitLossReport,
  type TrialBalanceReport,
  type GeneralLedgerReport,
  type PartnerLedgerReport,
  type AgingReport,
  type TaxReport,
  type DatePeriodPreset,
} from '@/lib/accounting/financial-reporting';

async function resolveReportScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } =
    await import('@/lib/admin-organization-context');
  const gate = await requireAccountingActionAccess({ reports: true });
  if ('error' in gate) return { error: gate.error };

  const session = gate.session!;
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
      organizationId: null,
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function yearStartIso(d = todayIso()) {
  return `${d.slice(0, 4)}-01-01`;
}

export async function getBalanceSheetStatement(input?: {
  asOf?: string;
}): Promise<{ report: BalanceSheetReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        error: 'Select an organization to run financial statements.',
      };
    }

    const asOf = String(input?.asOf || todayIso()).slice(0, 10);
    const report = await buildBalanceSheet({
      organizationId: scope.organizationId ?? null,
      asOf,
    });
    return { report };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to build Balance Sheet',
    };
  }
}

export async function getProfitAndLossStatement(input?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ report: ProfitLossReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        error: 'Select an organization to run financial statements.',
      };
    }

    const dateTo = String(input?.dateTo || todayIso()).slice(0, 10);
    const dateFrom = String(input?.dateFrom || yearStartIso(dateTo)).slice(0, 10);
    const report = await buildProfitAndLoss({
      organizationId: scope.organizationId ?? null,
      dateFrom,
      dateTo,
    });
    return { report };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to build Profit & Loss',
    };
  }
}

export async function getCashFlowStatement(input?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ report: CashFlowReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        error: 'Select an organization to run financial statements.',
      };
    }

    const dateTo = String(input?.dateTo || todayIso()).slice(0, 10);
    const dateFrom = String(input?.dateFrom || yearStartIso(dateTo)).slice(0, 10);
    const report = await buildCashFlow({
      organizationId: scope.organizationId ?? null,
      dateFrom,
      dateTo,
    });
    return { report };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to build Cash Flow Statement',
    };
  }
}

async function resolvePeriodInput(input?: {
  dateFrom?: string;
  dateTo?: string;
  preset?: DatePeriodPreset;
}) {
  if (input?.preset && input.preset !== 'custom') {
    return resolveDatePeriod(input.preset);
  }
  const dateTo = String(input?.dateTo || todayIso()).slice(0, 10);
  const dateFrom = String(input?.dateFrom || yearStartIso(dateTo)).slice(0, 10);
  return resolveDatePeriod('custom', { dateFrom, dateTo });
}

export async function getTrialBalanceReport(input?: {
  dateFrom?: string;
  dateTo?: string;
  preset?: DatePeriodPreset;
}): Promise<{ report: TrialBalanceReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to run financial statements.' };
    }
    const period = await resolvePeriodInput(input);
    const report = await buildTrialBalance({
      organizationId: scope.organizationId ?? null,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
    });
    return { report };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to build Trial Balance',
    };
  }
}

export async function getGeneralLedgerReport(input?: {
  dateFrom?: string;
  dateTo?: string;
  preset?: DatePeriodPreset;
  search?: string;
}): Promise<{ report: GeneralLedgerReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to run financial statements.' };
    }
    const period = await resolvePeriodInput(input);
    const report = await buildGeneralLedger({
      organizationId: scope.organizationId ?? null,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      search: input?.search || null,
    });
    return { report };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to build General Ledger',
    };
  }
}

export async function getPartnerLedgerReport(input?: {
  dateFrom?: string;
  dateTo?: string;
  preset?: DatePeriodPreset;
  search?: string;
  contactId?: string;
}): Promise<{ report: PartnerLedgerReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to run financial statements.' };
    }
    const period = await resolvePeriodInput(input);
    const report = await buildPartnerLedger({
      organizationId: scope.organizationId ?? null,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      search: input?.search || null,
      contactId: input?.contactId || null,
    });
    return { report };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to build Partner Ledger',
    };
  }
}

export async function getAgedReceivableReport(input?: {
  asOf?: string;
  search?: string;
}): Promise<{ report: AgingReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to run financial statements.' };
    }
    const asOf = String(input?.asOf || todayIso()).slice(0, 10);
    const report = await buildAgedReceivable({
      organizationId: scope.organizationId ?? null,
      asOf,
      search: input?.search || null,
    });
    return { report };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to build Aged Receivable',
    };
  }
}

export async function getAgedPayableReport(input?: {
  asOf?: string;
  search?: string;
}): Promise<{ report: AgingReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to run financial statements.' };
    }
    const asOf = String(input?.asOf || todayIso()).slice(0, 10);
    const report = await buildAgedPayable({
      organizationId: scope.organizationId ?? null,
      asOf,
      search: input?.search || null,
    });
    return { report };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to build Aged Payable',
    };
  }
}

export async function getTaxReport(input?: {
  dateFrom?: string;
  dateTo?: string;
  preset?: DatePeriodPreset;
}): Promise<{ report: TaxReport } | { error: string }> {
  try {
    const scope = await resolveReportScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to run financial statements.' };
    }
    const period = await resolvePeriodInput(input);
    const report = await buildTaxReport({
      organizationId: scope.organizationId ?? null,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
    });
    return { report };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to build Tax Report',
    };
  }
}
