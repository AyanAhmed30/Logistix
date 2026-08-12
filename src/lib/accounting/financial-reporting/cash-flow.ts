import {
  aggregateAccountBalances,
  dayBefore,
  loadChartAccounts,
  loadPostedLedgerFacts,
} from '@/lib/accounting/financial-reporting/ledger';
import {
  isLiquidityAccount,
  round2,
  type AccountBalance,
  type CashFlowReport,
  type CashFlowSection,
  type LedgerFact,
  type ReportLine,
} from '@/lib/accounting/financial-reporting/types';

function sumLiquidity(balances: AccountBalance[]) {
  return round2(
    balances
      .filter((b) => isLiquidityAccount(b))
      .reduce((s, b) => s + b.balance, 0)
  );
}

type SectionId = 'operating' | 'investing' | 'financing' | 'unclassified';

function classifyEntry(
  factsOnEntry: LedgerFact[],
  accountIndex: Map<
    string,
    { type: string; account_type: string | null; code: string; name: string }
  >
): SectionId {
  let investing = false;
  let financing = false;
  let operatingHint = false;
  for (const f of factsOnEntry) {
    const a = accountIndex.get(f.account_id);
    if (!a || isLiquidityAccount(a)) continue;
    const at = String(a.account_type || '');
    if (at === 'fixed_assets' || at === 'non_current_assets') investing = true;
    if (
      a.type === 'equity' ||
      at === 'equity' ||
      at === 'retained_earnings' ||
      at === 'non_current_liabilities'
    ) {
      financing = true;
    }
    if (
      a.type === 'income' ||
      a.type === 'expense' ||
      at === 'receivable' ||
      at === 'payable' ||
      at === 'current_liabilities' ||
      at === 'current_assets'
    ) {
      operatingHint = true;
    }
  }
  if (investing && !financing) return 'investing';
  if (financing && !investing) return 'financing';
  if (operatingHint || investing || financing) return 'operating';
  return 'unclassified';
}

function line(
  key: string,
  label: string,
  amount: number,
  level: number,
  extra?: Partial<ReportLine>
): ReportLine {
  return { key, label, amount: round2(amount), level, ...extra };
}

/**
 * Cash Flow — Odoo-style direct method layout on cash/bank accounts.
 */
export async function buildCashFlow(opts: {
  organizationId: string | null;
  dateFrom: string;
  dateTo: string;
  currency?: string;
}): Promise<CashFlowReport> {
  const accounts = await loadChartAccounts(opts.organizationId);
  const accountIndex = new Map(
    accounts.map((a) => [
      a.id,
      {
        type: a.type,
        account_type: a.account_type,
        code: a.code,
        name: a.name,
      },
    ])
  );
  const liquidityIds = new Set(
    accounts.filter((a) => isLiquidityAccount(a)).map((a) => a.id)
  );

  const beforeFrom = dayBefore(opts.dateFrom);
  const openingFacts = beforeFrom
    ? await loadPostedLedgerFacts({
        organizationId: opts.organizationId,
        dateTo: beforeFrom,
      })
    : [];
  const openingCash = sumLiquidity(
    aggregateAccountBalances(openingFacts, accounts)
  );

  const closingCash = sumLiquidity(
    aggregateAccountBalances(
      await loadPostedLedgerFacts({
        organizationId: opts.organizationId,
        dateTo: opts.dateTo,
      }),
      accounts
    )
  );

  const periodFacts = await loadPostedLedgerFacts({
    organizationId: opts.organizationId,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
  });

  const byEntry = new Map<string, LedgerFact[]>();
  for (const f of periodFacts) {
    const list = byEntry.get(f.entry_id) || [];
    list.push(f);
    byEntry.set(f.entry_id, list);
  }

  const buckets: Record<
    SectionId,
    { cashIn: number; cashOut: number; total: number }
  > = {
    operating: { cashIn: 0, cashOut: 0, total: 0 },
    investing: { cashIn: 0, cashOut: 0, total: 0 },
    financing: { cashIn: 0, cashOut: 0, total: 0 },
    unclassified: { cashIn: 0, cashOut: 0, total: 0 },
  };

  // Operating detail buckets (Odoo labels)
  let advanceFromCustomers = 0;
  let cashReceivedOperating = 0;
  let advanceToSuppliers = 0;
  let cashPaidOperating = 0;

  for (const [, facts] of byEntry) {
    const cashFacts = facts.filter((f) => liquidityIds.has(f.account_id));
    if (!cashFacts.length) continue;

    const cashDelta = round2(
      cashFacts.reduce((s, f) => s + f.debit - f.credit, 0)
    );
    if (Math.abs(cashDelta) < 0.004) continue;

    const section = classifyEntry(facts, accountIndex);
    buckets[section].total = round2(buckets[section].total + cashDelta);
    if (cashDelta >= 0) {
      buckets[section].cashIn = round2(buckets[section].cashIn + cashDelta);
    } else {
      buckets[section].cashOut = round2(
        buckets[section].cashOut + Math.abs(cashDelta)
      );
    }

    if (section === 'operating') {
      const counterparts = facts.filter((f) => !liquidityIds.has(f.account_id));
      const hasReceivable = counterparts.some((f) => {
        const a = accountIndex.get(f.account_id);
        return a?.account_type === 'receivable';
      });
      const hasPayable = counterparts.some((f) => {
        const a = accountIndex.get(f.account_id);
        return (
          a?.account_type === 'payable' ||
          a?.account_type === 'current_liabilities'
        );
      });
      if (cashDelta >= 0) {
        if (hasReceivable) {
          advanceFromCustomers = round2(advanceFromCustomers + cashDelta);
        } else {
          cashReceivedOperating = round2(cashReceivedOperating + cashDelta);
        }
      } else {
        const out = Math.abs(cashDelta);
        if (hasPayable) {
          advanceToSuppliers = round2(advanceToSuppliers + out);
        } else {
          cashPaidOperating = round2(cashPaidOperating + out);
        }
      }
    }
  }

  const actualCashMovement = round2(closingCash - openingCash);
  const classifiedNet = round2(
    buckets.operating.total +
      buckets.investing.total +
      buckets.financing.total +
      buckets.unclassified.total
  );
  const gap = round2(actualCashMovement - classifiedNet);
  if (Math.abs(gap) > 0.05) {
    buckets.unclassified.total = round2(buckets.unclassified.total + gap);
    if (gap >= 0) {
      buckets.unclassified.cashIn = round2(buckets.unclassified.cashIn + gap);
    } else {
      buckets.unclassified.cashOut = round2(
        buckets.unclassified.cashOut + Math.abs(gap)
      );
    }
  }

  const sections: CashFlowSection[] = [
    {
      id: 'operating',
      label: 'Cash flows from operating activities',
      total: buckets.operating.total,
      lines: [
        line(
          'op:adv_in',
          'Advance Payments received from customers',
          advanceFromCustomers,
          2
        ),
        line(
          'op:recv',
          'Cash received from operating activities',
          cashReceivedOperating,
          2
        ),
        line(
          'op:adv_out',
          'Advance payments made to suppliers',
          -advanceToSuppliers,
          2
        ),
        line(
          'op:paid',
          'Cash paid for operating activities',
          -cashPaidOperating,
          2
        ),
      ],
    },
    {
      id: 'investing',
      label: 'Cash flows from investing & extraordinary activities',
      total: buckets.investing.total,
      lines: [
        line('inv:in', 'Cash in', buckets.investing.cashIn, 2),
        line('inv:out', 'Cash out', -buckets.investing.cashOut, 2),
      ],
    },
    {
      id: 'financing',
      label: 'Cash flows from financing activities',
      total: buckets.financing.total,
      lines: [
        line('fin:in', 'Cash in', buckets.financing.cashIn, 2),
        line('fin:out', 'Cash out', -buckets.financing.cashOut, 2),
      ],
    },
    {
      id: 'unclassified',
      label: 'Cash flows from unclassified activities',
      total: buckets.unclassified.total,
      lines: [
        line('unc:in', 'Cash in', buckets.unclassified.cashIn, 2),
        line('unc:out', 'Cash out', -buckets.unclassified.cashOut, 2),
      ],
    },
  ];

  const lines: ReportLine[] = [
    line(
      'cf:begin',
      'Cash and cash equivalents, beginning of period',
      openingCash,
      0,
      { variant: 'summary', isTotal: true }
    ),
    line(
      'cf:net',
      'Net increase in cash and cash equivalents',
      actualCashMovement,
      0,
      { variant: 'summary', isTotal: true }
    ),
    ...sections.flatMap((sec) => [
      line(`cf:${sec.id}`, sec.label, sec.total, 1, {
        variant: 'group',
        isSection: true,
      }),
      ...sec.lines.map((l) => ({ ...l, variant: 'line' as const })),
    ]),
    line(
      'cf:close',
      'Cash and cash equivalents, closing balance',
      closingCash,
      0,
      { variant: 'summary', isTotal: true }
    ),
  ];

  return {
    kind: 'cash_flow',
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    organizationId: opts.organizationId,
    currency: opts.currency || 'PKR',
    openingCash,
    closingCash,
    netChange: actualCashMovement,
    sections,
    lines,
    actualCashMovement,
  };
}
