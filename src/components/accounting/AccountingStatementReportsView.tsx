"use client";

/**
 * Phase 1–4 Statement / Ledger / Partner / Tax Reports UI — Odoo-style layout, Logistix theme (#017e84).
 * Balance Sheet · P&L · Cash Flow · Trial Balance · GL · Partner Ledger · Aging · Tax Report
 */

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronRight,
  ContactRound,
  FileText,
  Hourglass,
  Landmark,
  Percent,
  Printer,
  Scale,
  ScrollText,
  Search,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getBalanceSheetStatement,
  getCashFlowStatement,
  getProfitAndLossStatement,
  getTrialBalanceReport,
  getGeneralLedgerReport,
  getPartnerLedgerReport,
  getAgedReceivableReport,
  getAgedPayableReport,
  getTaxReport,
} from "@/app/actions/accounting/financial-statements";
import type {
  BalanceSheetReport,
  CashFlowReport,
  ProfitLossReport,
  TrialBalanceReport,
  GeneralLedgerReport,
  PartnerLedgerReport,
  ReportLine,
} from "@/lib/accounting/financial-reporting/types";
import type { AgingReport } from "@/lib/accounting/financial-reporting/aging";
import type { TaxReport } from "@/lib/accounting/financial-reporting/tax-report";
import { resolveDatePeriod } from "@/lib/accounting/financial-reporting/periods";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  GeneralLedgerTable,
  PartnerLedgerTable,
  TrialBalanceTable,
} from "@/components/accounting/AccountingLedgerReportPanels";
import { AgingReportTable } from "@/components/accounting/AccountingAgingReportPanels";
import { TaxReportTable } from "@/components/accounting/AccountingTaxReportPanels";

type StatementId =
  | "balance_sheet"
  | "profit_loss"
  | "cash_flow"
  | "trial_balance"
  | "general_ledger"
  | "partner_ledger"
  | "aged_receivable"
  | "aged_payable"
  | "tax_report";

const TEAL = "#017e84";

const STATEMENTS: {
  id: StatementId;
  title: string;
  description: string;
  icon: typeof TrendingUp;
  group: "statement" | "ledger" | "partner" | "tax";
}[] = [
  {
    id: "balance_sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities and equity as of a date",
    icon: Landmark,
    group: "statement",
  },
  {
    id: "profit_loss",
    title: "Profit and Loss",
    description: "Income and expenses for a period",
    icon: TrendingUp,
    group: "statement",
  },
  {
    id: "cash_flow",
    title: "Cash Flow Statement",
    description: "Cash & bank movements by activity",
    icon: Wallet,
    group: "statement",
  },
  {
    id: "trial_balance",
    title: "Trial Balance",
    description: "Opening, period movement and closing by account",
    icon: Scale,
    group: "ledger",
  },
  {
    id: "general_ledger",
    title: "General Ledger",
    description: "Posted journal items by account",
    icon: ScrollText,
    group: "ledger",
  },
  {
    id: "partner_ledger",
    title: "Partner Ledger",
    description: "Receivable and payable activity by partner",
    icon: ContactRound,
    group: "ledger",
  },
  {
    id: "aged_receivable",
    title: "Aged Receivable",
    description: "Customer outstanding balances by due-date age",
    icon: Hourglass,
    group: "partner",
  },
  {
    id: "aged_payable",
    title: "Aged Payable",
    description: "Vendor outstanding balances by due-date age",
    icon: Hourglass,
    group: "partner",
  },
  {
    id: "tax_report",
    title: "Tax Report",
    description: "Sales and purchase tax by rate for the period",
    icon: Percent,
    group: "tax",
  },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function thisMonthBounds() {
  const p = resolveDatePeriod("this_month");
  return { from: p.dateFrom, to: p.dateTo };
}

/** Odoo-style amount: 8,283.60 */
function formatBalance(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatAsOf(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `As of ${m}/${d}/${y}`;
}

function formatPeriodLabel(from: string, to: string) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const parse = (iso: string) => {
    const [y, m] = iso.split("-");
    const mi = Math.max(0, Number(m || 1) - 1);
    return `${months[mi]} ${y}`;
  };
  if (from.slice(0, 7) === to.slice(0, 7)) return parse(from);
  return `${parse(from)} - ${parse(to)}`;
}

function currencyUnit(code?: string) {
  if (!code || code === "PKR") return "In .Rs.";
  return `In ${code}`;
}

/* ---------- Shared Odoo-style report chrome ---------- */

function FilterChip({
  icon,
  children,
  onClick,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs sm:text-sm text-slate-700 hover:bg-slate-50 whitespace-nowrap"
    >
      {icon}
      {children}
    </button>
  );
}

function StatementToolbar({
  title,
  filters,
  onPrint,
  search,
  onSearchChange,
  showSearch,
}: {
  title: string;
  filters: ReactNode;
  onPrint: () => void;
  search?: string;
  onSearchChange?: (v: string) => void;
  showSearch?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          type="button"
          size="sm"
          onClick={onPrint}
          className="h-8 rounded-md px-3 font-medium text-white shrink-0"
          style={{ backgroundColor: TEAL }}
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" />
          Print
        </Button>
        <h1 className="text-base sm:text-lg font-semibold text-slate-800 truncate">
          {title}
        </h1>
        <button
          type="button"
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="Report settings"
          aria-label="Report settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>
        {showSearch ? (
          <div className="relative ml-1 hidden sm:block">
            <input
              type="search"
              value={search || ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search..."
              className="h-8 w-40 lg:w-52 rounded-md border border-slate-200 bg-slate-50 pl-8 pr-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#017e84]/40"
            />
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{filters}</div>
    </div>
  );
}

function StatementCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl mt-4 mb-8">
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden print:shadow-none print:border-slate-300">
        {children}
      </div>
    </div>
  );
}

function BalanceHeader() {
  return (
    <div className="flex items-center justify-end px-4 py-2 border-b border-slate-100">
      <span className="text-xs font-medium text-slate-500 tracking-wide">
        Balance
      </span>
    </div>
  );
}

function StatementRow({
  line,
  expanded,
  onToggle,
}: {
  line: ReportLine;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const variant = line.variant || (line.isSection ? "section" : "line");
  const pad =
    line.level <= 0
      ? "pl-4"
      : line.level === 1
        ? "pl-8"
        : line.level === 2
          ? "pl-12"
          : "pl-16";

  if (variant === "section") {
    return (
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-slate-200/90 text-slate-800 border-y border-slate-300/80">
        <span className="text-xs sm:text-sm font-bold uppercase tracking-wide">
          {line.label}
        </span>
        <span className="tabular-nums text-sm font-bold shrink-0">
          {formatBalance(line.amount)}
        </span>
      </div>
    );
  }

  if (variant === "summary") {
    return (
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
        <span className={`text-sm font-semibold text-slate-800 ${pad}`}>
          {line.label}
        </span>
        <span className="tabular-nums text-sm font-semibold text-slate-800 shrink-0">
          {formatBalance(line.amount)}
        </span>
      </div>
    );
  }

  const isLink = line.isLink || variant === "link";
  const isGroup = variant === "group";

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-slate-100 hover:bg-slate-50/80">
      <span
        className={`text-sm flex items-center gap-1 min-w-0 ${pad} ${
          isLink
            ? "font-medium"
            : isGroup
              ? "font-semibold text-slate-800"
              : "text-slate-700"
        }`}
        style={isLink ? { color: TEAL } : undefined}
      >
        {line.expandable ? (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex text-slate-400 hover:text-slate-600 -ml-1"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
        <span className="truncate">{line.label}</span>
      </span>
      <span
        className={`tabular-nums text-sm shrink-0 ${
          isGroup ? "font-semibold text-slate-800" : "text-slate-700"
        }`}
        style={isLink ? { color: TEAL } : undefined}
      >
        {formatBalance(line.amount)}
      </span>
    </div>
  );
}

function StatementTable({
  lines,
  expandKey,
  expandChildren,
}: {
  lines: ReportLine[];
  expandKey?: string;
  expandChildren?: ReportLine[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <BalanceHeader />
      {lines.map((line) => (
        <div key={line.key}>
          <StatementRow
            line={line}
            expanded={expandKey === line.key ? expanded : undefined}
            onToggle={
              expandKey === line.key
                ? () => setExpanded((v) => !v)
                : undefined
            }
          />
          {expandKey === line.key &&
          expanded &&
          expandChildren?.length
            ? expandChildren.map((child) => (
                <StatementRow key={child.key} line={{ ...child, level: 1 }} />
              ))
            : null}
        </div>
      ))}
    </div>
  );
}

/* ---------- Main view ---------- */

export function AccountingStatementReportsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { switchVersion, organizationName, isAdminContext } =
    useAdminOrganization();
  const printRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  const statementParam = searchParams.get("statement") as StatementId | null;
  const active: StatementId | null =
    statementParam && STATEMENTS.some((s) => s.id === statementParam)
      ? statementParam
      : null;

  const [asOf, setAsOf] = useState(today());
  const [dateFrom, setDateFrom] = useState(() => thisMonthBounds().from);
  const [dateTo, setDateTo] = useState(() => thisMonthBounds().to);

  const [bs, setBs] = useState<BalanceSheetReport | null>(null);
  const [pl, setPl] = useState<ProfitLossReport | null>(null);
  const [cf, setCf] = useState<CashFlowReport | null>(null);
  const [tb, setTb] = useState<TrialBalanceReport | null>(null);
  const [gl, setGl] = useState<GeneralLedgerReport | null>(null);
  const [partnerLed, setPartnerLed] = useState<PartnerLedgerReport | null>(null);
  const [agedAr, setAgedAr] = useState<AgingReport | null>(null);
  const [agedAp, setAgedAp] = useState<AgingReport | null>(null);
  const [taxReport, setTaxReport] = useState<TaxReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [periodOpen, setPeriodOpen] = useState(false);
  const [asOfOpen, setAsOfOpen] = useState(false);

  const openStatement = useCallback(
    (id: StatementId) => {
      router.push(`/accounting/reports?statement=${id}`);
    },
    [router]
  );

  const load = useCallback(() => {
    if (!active) return;
    if (isAdminContext) {
      setError("Select an organization to run financial statements.");
      setBs(null);
      setPl(null);
      setCf(null);
      setTb(null);
      setGl(null);
      setPartnerLed(null);
      setAgedAr(null);
      setAgedAp(null);
      setTaxReport(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      if (active === "balance_sheet") {
        const res = await getBalanceSheetStatement({ asOf });
        if ("error" in res && res.error) {
          setError(res.error);
          setBs(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setBs(res.report);
      } else if (active === "profit_loss") {
        const res = await getProfitAndLossStatement({ dateFrom, dateTo });
        if ("error" in res && res.error) {
          setError(res.error);
          setPl(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setPl(res.report);
      } else if (active === "cash_flow") {
        const res = await getCashFlowStatement({ dateFrom, dateTo });
        if ("error" in res && res.error) {
          setError(res.error);
          setCf(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setCf(res.report);
      } else if (active === "trial_balance") {
        const res = await getTrialBalanceReport({ dateFrom, dateTo });
        if ("error" in res && res.error) {
          setError(res.error);
          setTb(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setTb(res.report);
      } else if (active === "general_ledger") {
        const res = await getGeneralLedgerReport({
          dateFrom,
          dateTo,
          search: deferredSearch,
        });
        if ("error" in res && res.error) {
          setError(res.error);
          setGl(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setGl(res.report);
      } else if (active === "partner_ledger") {
        const res = await getPartnerLedgerReport({
          dateFrom,
          dateTo,
          search: deferredSearch,
        });
        if ("error" in res && res.error) {
          setError(res.error);
          setPartnerLed(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setPartnerLed(res.report);
      } else if (active === "aged_receivable") {
        const res = await getAgedReceivableReport({
          asOf,
          search: deferredSearch,
        });
        if ("error" in res && res.error) {
          setError(res.error);
          setAgedAr(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setAgedAr(res.report);
      } else if (active === "aged_payable") {
        const res = await getAgedPayableReport({
          asOf,
          search: deferredSearch,
        });
        if ("error" in res && res.error) {
          setError(res.error);
          setAgedAp(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setAgedAp(res.report);
      } else if (active === "tax_report") {
        const res = await getTaxReport({ dateFrom, dateTo });
        if ("error" in res && res.error) {
          setError(res.error);
          setTaxReport(null);
          toast.error(res.error);
          return;
        }
        if ("report" in res) setTaxReport(res.report);
      }
    });
  }, [active, asOf, dateFrom, dateTo, isAdminContext, deferredSearch]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const title = useMemo(
    () => STATEMENTS.find((s) => s.id === active)?.title || "Statement Reports",
    [active]
  );

  const handlePrint = () => {
    window.print();
  };

  if (!active) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" style={{ color: TEAL }} />
            Reporting
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Financial statements and ledgers from posted journal entries
            {organizationName ? ` · ${organizationName}` : ""}
          </p>
        </div>

        {(
          [
            ["statement", "Statement Reports"],
            ["ledger", "Ledger Reports"],
            ["partner", "Partner Reports"],
            ["tax", "Taxes & Fiscal"],
          ] as const
        ).map(([group, heading]) => (
          <div key={group} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {heading}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STATEMENTS.filter((s) => s.group === group).map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openStatement(s.id)}
                    className="text-left rounded-md border border-slate-200 bg-white p-4 hover:border-[#017e84]/40 hover:shadow-sm transition-all"
                  >
                    <div
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md mb-3"
                      style={{ backgroundColor: `${TEAL}14`, color: TEAL }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-800">{s.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {s.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const currencyLabel = currencyUnit(
    active === "balance_sheet"
      ? bs?.currency
      : active === "profit_loss"
        ? pl?.currency
        : active === "cash_flow"
          ? cf?.currency
          : active === "trial_balance"
            ? tb?.currency
            : active === "general_ledger"
              ? gl?.currency
              : active === "partner_ledger"
                ? partnerLed?.currency
                : active === "aged_receivable"
                  ? agedAr?.currency
                  : active === "aged_payable"
                    ? agedAp?.currency
                    : taxReport?.currency
  );

  const isLedger =
    active === "trial_balance" ||
    active === "general_ledger" ||
    active === "partner_ledger" ||
    active === "aged_receivable" ||
    active === "aged_payable";

  const isAging =
    active === "aged_receivable" || active === "aged_payable";

  const isTax = active === "tax_report";

  const asOfFilter = (
    <div className="relative">
      <FilterChip
        icon={<Calendar className="h-3.5 w-3.5 text-slate-500" />}
        onClick={() => setAsOfOpen((v) => !v)}
      >
        {formatAsOf(asOf)}
      </FilterChip>
      {asOfOpen ? (
        <div className="absolute right-0 top-full mt-1 z-20 rounded-md border border-slate-200 bg-white p-2 shadow-md">
          <input
            type="date"
            value={asOf}
            onChange={(e) => {
              setAsOf(e.target.value);
              setAsOfOpen(false);
            }}
            className="h-8 rounded border border-slate-200 px-2 text-sm"
          />
        </div>
      ) : null}
    </div>
  );

  const periodFilter = (
    <div className="relative">
      <FilterChip
        icon={<Calendar className="h-3.5 w-3.5 text-slate-500" />}
        onClick={() => setPeriodOpen((v) => !v)}
      >
        {formatPeriodLabel(dateFrom, dateTo)}
      </FilterChip>
      {periodOpen ? (
        <div className="absolute right-0 top-full mt-1 z-20 rounded-md border border-slate-200 bg-white p-3 shadow-md flex flex-col gap-2 min-w-[200px]">
          <label className="text-xs text-slate-500">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-0.5 h-8 w-full rounded border border-slate-200 px-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-0.5 h-8 w-full rounded border border-slate-200 px-2 text-sm"
            />
          </label>
          <Button
            size="sm"
            className="h-7 text-white"
            style={{ backgroundColor: TEAL }}
            onClick={() => setPeriodOpen(false)}
          >
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );

  const commonFilters = (
    <>
      {active === "balance_sheet" || isAging ? (
        <>
          {asOfFilter}
          {active === "balance_sheet" ? <FilterChip>Comparison</FilterChip> : null}
          {isAging ? (
            <>
              <FilterChip>
                {active === "aged_receivable"
                  ? "Account: Receivable"
                  : "Account: Payable"}
              </FilterChip>
              <FilterChip>Partners</FilterChip>
              <FilterChip>Based on Due Date</FilterChip>
              <FilterChip icon={<Calendar className="h-3.5 w-3.5 text-slate-500" />}>
                30 Days
              </FilterChip>
            </>
          ) : null}
          <FilterChip
            icon={<SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />}
          >
            Posted Entries{active === "balance_sheet" ? ", Accrual Basis" : ""}
          </FilterChip>
        </>
      ) : active === "profit_loss" ? (
        <>
          {periodFilter}
          <FilterChip>Comparison</FilterChip>
          <FilterChip
            icon={<SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />}
          >
            Posted Entries, Accrual Basis
          </FilterChip>
          <FilterChip
            icon={<BarChart3 className="h-3.5 w-3.5 text-slate-500" />}
          >
            Budget
          </FilterChip>
        </>
      ) : active === "partner_ledger" ? (
        <>
          {periodFilter}
          <FilterChip>Account: Trade Partners</FilterChip>
          <FilterChip>Partners</FilterChip>
          <FilterChip
            icon={<SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />}
          >
            Posted Entries
          </FilterChip>
        </>
      ) : isTax ? (
        <>
          {periodFilter}
          <FilterChip>Comparison</FilterChip>
          <FilterChip
            icon={<SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />}
          >
            Posted Entries
          </FilterChip>
          <FilterChip icon={<FileText className="h-3.5 w-3.5 text-slate-500" />}>
            Report: Generic Tax report
          </FilterChip>
        </>
      ) : (
        <>
          {periodFilter}
          {active === "trial_balance" ? <FilterChip>Comparison</FilterChip> : null}
          <FilterChip
            icon={<SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />}
          >
            {active === "cash_flow"
              ? "Posted Entries"
              : "Posted Entries, Accrual Basis"}
          </FilterChip>
        </>
      )}
      {active === "partner_ledger" ? (
        <FilterChip>Report: Partner Ledger</FilterChip>
      ) : null}
      <FilterChip>{currencyLabel}</FilterChip>
    </>
  );

  const reportReady =
    (active === "balance_sheet" && bs) ||
    (active === "profit_loss" && pl) ||
    (active === "cash_flow" && cf) ||
    (active === "trial_balance" && tb) ||
    (active === "general_ledger" && gl) ||
    (active === "partner_ledger" && partnerLed) ||
    (active === "aged_receivable" && agedAr) ||
    (active === "aged_payable" && agedAp) ||
    (active === "tax_report" && taxReport);

  const cardClass = isLedger
    ? "mx-auto w-full max-w-6xl mt-4 mb-8"
    : undefined;

  return (
    <div className="-mx-1 sm:-mx-2">
      <StatementToolbar
        title={title}
        filters={commonFilters}
        onPrint={handlePrint}
        showSearch={
          active === "trial_balance" ||
          active === "general_ledger" ||
          active === "partner_ledger" ||
          isAging
        }
        search={search}
        onSearchChange={setSearch}
      />

      {error ? (
        <div
          className={`mx-auto mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 ${
            isLedger ? "max-w-6xl" : "max-w-3xl"
          }`}
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {isPending && !reportReady ? (
        <div className={`mx-auto mt-4 ${isLedger ? "max-w-6xl" : "max-w-3xl"}`}>
          <AccountingTableSkeleton rows={12} cols={2} />
        </div>
      ) : null}

      {active === "balance_sheet" && bs ? (
        <div ref={printRef}>
          {!bs.balanced ? (
            <div className="mx-auto max-w-3xl mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Balance sheet is out of balance by{" "}
              {formatBalance(
                Math.abs(bs.totalAssets - bs.totalLiabilitiesAndEquity)
              )}
              .
            </div>
          ) : null}
          <StatementCard>
            <StatementTable lines={bs.lines} />
          </StatementCard>
        </div>
      ) : null}

      {active === "profit_loss" && pl ? (
        <div ref={printRef}>
          <StatementCard>
            <StatementTable
              lines={pl.lines}
              expandKey="pl:revenue"
              expandChildren={pl.income}
            />
          </StatementCard>
        </div>
      ) : null}

      {active === "cash_flow" && cf ? (
        <div ref={printRef}>
          <StatementCard>
            <StatementTable lines={cf.lines} />
          </StatementCard>
        </div>
      ) : null}

      {active === "trial_balance" && tb ? (
        <div ref={printRef} className={cardClass}>
          <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
            <TrialBalanceTable report={tb} />
          </div>
        </div>
      ) : null}

      {active === "general_ledger" && gl ? (
        <div ref={printRef} className={cardClass}>
          <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
            <GeneralLedgerTable report={gl} />
          </div>
        </div>
      ) : null}

      {active === "partner_ledger" && partnerLed ? (
        <div ref={printRef} className={cardClass}>
          <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
            <PartnerLedgerTable report={partnerLed} />
          </div>
        </div>
      ) : null}

      {active === "aged_receivable" && agedAr ? (
        <div ref={printRef} className={cardClass}>
          <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
            <AgingReportTable report={agedAr} rootLabel="Aged Receivable" />
          </div>
        </div>
      ) : null}

      {active === "aged_payable" && agedAp ? (
        <div ref={printRef} className={cardClass}>
          <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
            <AgingReportTable report={agedAp} rootLabel="Aged Payable" />
          </div>
        </div>
      ) : null}

      {active === "tax_report" && taxReport ? (
        <div ref={printRef}>
          {taxReport.truncated ? (
            <div className="mx-auto max-w-3xl mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Period has more documents than the report can load in one pass.
              Narrow the date range for complete totals.
            </div>
          ) : null}
          <StatementCard>
            <TaxReportTable report={taxReport} />
          </StatementCard>
        </div>
      ) : null}
    </div>
  );
}
