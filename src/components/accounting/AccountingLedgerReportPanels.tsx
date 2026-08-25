"use client";

/**
 * Phase 2 ledger report tables — Trial Balance, General Ledger, Partner Ledger.
 * Odoo structure, Logistix theme (#017e84).
 */

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  GeneralLedgerReport,
  PartnerLedgerReport,
  TrialBalanceReport,
} from "@/lib/accounting/financial-reporting/types";
import { formatPeriodRange } from "@/lib/accounting/financial-reporting/periods";

const TEAL = "#017e84";

function formatAmt(n: number, opts?: { dimZero?: boolean; signedRed?: boolean }) {
  const abs = Math.abs(n || 0);
  const text = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  const signed =
    n < -0.004 ? `-${text}` : text;
  const isNeg = n < -0.004;
  const isZero = Math.abs(n) < 0.004;
  return (
    <span
      className={`tabular-nums ${
        isNeg && opts?.signedRed
          ? "text-red-600"
          : isZero && opts?.dimZero
            ? "text-slate-300"
            : "text-slate-800"
      }`}
    >
      {isNeg && opts?.signedRed ? signed : isZero ? "0.00" : new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n)}
    </span>
  );
}

function formatRs(n: number, opts?: { dimZero?: boolean; signedRed?: boolean }) {
  const isNeg = n < -0.004;
  const isZero = Math.abs(n) < 0.004;
  const body = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n || 0));
  const text = isZero ? "Rs. 0.00" : isNeg ? `Rs. -${body}` : `Rs. ${body}`;
  return (
    <span
      className={`tabular-nums whitespace-nowrap ${
        isNeg && opts?.signedRed
          ? "text-red-600"
          : isZero && opts?.dimZero
            ? "text-slate-300"
            : "text-slate-800"
      }`}
    >
      {text}
    </span>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

/* ---------------- Trial Balance ---------------- */

export function TrialBalanceTable({ report }: { report: TrialBalanceReport }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const periodLabel = formatPeriodRange(report.dateFrom, report.dateTo);

  const toggle = (key: string) =>
    setOpen((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="text-left font-medium py-2 px-3 w-[36%]" />
            <th
              className="text-center font-medium py-2 px-2 border-l border-slate-100"
              colSpan={1}
            >
              Initial Balance
            </th>
            <th
              className="text-center font-medium py-2 px-2 border-l border-slate-100"
              colSpan={2}
            >
              {periodLabel}
            </th>
            <th
              className="text-center font-medium py-2 px-2 border-l border-slate-100"
              colSpan={1}
            >
              End Balance
            </th>
          </tr>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="text-left font-medium py-1.5 px-3" />
            <th className="text-right font-medium py-1.5 px-3 border-l border-slate-100">
              Balance
            </th>
            <th className="text-right font-medium py-1.5 px-3 border-l border-slate-100">
              Debit
            </th>
            <th className="text-right font-medium py-1.5 px-3">Credit</th>
            <th className="text-right font-medium py-1.5 px-3 border-l border-slate-100">
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {report.groups.map((g) => {
            const isOpen = !!open[g.key];
            return (
              <FragmentGroup key={g.key}>
                <tr className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 font-medium text-slate-800"
                      onClick={() => toggle(g.key)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      {g.label}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right border-l border-slate-50">
                    {formatAmt(g.initial_balance, { dimZero: true, signedRed: true })}
                  </td>
                  <td className="py-2 px-3 text-right border-l border-slate-50">
                    {formatAmt(g.period_debit, { dimZero: true })}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatAmt(g.period_credit, { dimZero: true })}
                  </td>
                  <td className="py-2 px-3 text-right border-l border-slate-50">
                    {formatAmt(g.end_balance, { dimZero: true, signedRed: true })}
                  </td>
                </tr>
                {isOpen
                  ? g.accounts.map((a) => (
                      <tr
                        key={a.account_id}
                        className="border-b border-slate-50 bg-slate-50/40"
                      >
                        <td className="py-1.5 pl-10 pr-3 text-slate-600">
                          {a.code} {a.name}
                        </td>
                        <td className="py-1.5 px-3 text-right border-l border-slate-50">
                          {formatAmt(a.initial_balance, {
                            dimZero: true,
                            signedRed: true,
                          })}
                        </td>
                        <td className="py-1.5 px-3 text-right border-l border-slate-50">
                          {formatAmt(a.period_debit, { dimZero: true })}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          {formatAmt(a.period_credit, { dimZero: true })}
                        </td>
                        <td className="py-1.5 px-3 text-right border-l border-slate-50">
                          {formatAmt(a.end_balance, {
                            dimZero: true,
                            signedRed: true,
                          })}
                        </td>
                      </tr>
                    ))
                  : null}
              </FragmentGroup>
            );
          })}
        </tbody>
        <tfoot>
          <tr
            className="border-t-2 border-slate-300 bg-slate-100 font-semibold"
            data-testid="trial-balance-totals"
            data-period-debit={String(report.totalPeriodDebit)}
            data-period-credit={String(report.totalPeriodCredit)}
            data-balanced={report.balanced ? "true" : "false"}
          >
            <td className="py-2.5 px-3 text-slate-800">Total</td>
            <td className="py-2.5 px-3 text-right border-l border-slate-200">
              {formatAmt(report.totalInitialBalance, { dimZero: true, signedRed: true })}
            </td>
            <td className="py-2.5 px-3 text-right border-l border-slate-200">
              {formatAmt(report.totalPeriodDebit)}
            </td>
            <td className="py-2.5 px-3 text-right">
              {formatAmt(report.totalPeriodCredit)}
            </td>
            <td className="py-2.5 px-3 text-right border-l border-slate-200">
              {formatAmt(report.totalEndBalance, { dimZero: true, signedRed: true })}
            </td>
          </tr>
        </tfoot>
      </table>
      {!report.balanced ? (
        <p className="text-xs text-amber-700 px-3 py-2 bg-amber-50 border-t border-amber-200">
          Period debit and credit totals do not match. Inspect posted journal
          entries for unbalanced documents.
        </p>
      ) : null}
    </div>
  );
}

function FragmentGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/* ---------------- General Ledger ---------------- */

export function GeneralLedgerTable({ report }: { report: GeneralLedgerReport }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setOpen((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="text-left font-medium py-2 px-3">Account</th>
            <th className="text-left font-medium py-2 px-3">Date</th>
            <th className="text-left font-medium py-2 px-3">Partner</th>
            <th className="text-right font-medium py-2 px-3">Debit</th>
            <th className="text-right font-medium py-2 px-3">Credit</th>
            <th className="text-right font-medium py-2 px-3">Balance</th>
          </tr>
        </thead>
        <tbody>
          {report.accounts.map((a) => {
            const isOpen = !!open[a.account_id];
            return (
              <FragmentGroup key={a.account_id}>
                <tr className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="py-2 px-3" colSpan={3}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 font-medium text-slate-800"
                      onClick={() => toggle(a.account_id)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      {a.code} {a.name}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatRs(a.period_debit, { dimZero: true })}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatRs(a.period_credit, { dimZero: true })}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatRs(a.closing_balance, {
                      dimZero: true,
                      signedRed: true,
                    })}
                  </td>
                </tr>
                {isOpen
                  ? a.lines.map((l) => (
                      <tr
                        key={l.line_id}
                        className="border-b border-slate-50 bg-slate-50/40 text-slate-600"
                      >
                        <td className="py-1.5 pl-10 pr-3 text-xs">
                          {l.reference || l.journal_code || "—"}
                          {l.label ? (
                            <span className="text-slate-400"> · {l.label}</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          {formatDate(l.entry_date)}
                        </td>
                        <td className="py-1.5 px-3">{l.partner_name || "—"}</td>
                        <td className="py-1.5 px-3 text-right">
                          {formatRs(l.debit, { dimZero: true })}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          {formatRs(l.credit, { dimZero: true })}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          {formatRs(l.balance, {
                            dimZero: true,
                            signedRed: true,
                          })}
                        </td>
                      </tr>
                    ))
                  : null}
              </FragmentGroup>
            );
          })}
        </tbody>
        <tfoot>
          <tr
            className="border-t-2 border-slate-300 bg-slate-100 font-semibold"
            data-testid="general-ledger-totals"
            data-debit={String(report.totalDebit)}
            data-credit={String(report.totalCredit)}
            data-balanced={report.balanced ? "true" : "false"}
          >
            <td className="py-2.5 px-3 text-slate-800" colSpan={3}>
              Total General Ledger
            </td>
            <td className="py-2.5 px-3 text-right">
              {formatRs(report.totalDebit)}
            </td>
            <td className="py-2.5 px-3 text-right">
              {formatRs(report.totalCredit)}
            </td>
            <td className="py-2.5 px-3 text-right">
              {formatRs(report.totalBalance, { dimZero: true, signedRed: true })}
            </td>
          </tr>
        </tfoot>
      </table>
      {!report.balanced ? (
        <p className="text-xs text-amber-700 px-3 py-2 bg-amber-50 border-t border-amber-200">
          Debit and credit totals do not match for this period.
        </p>
      ) : null}
    </div>
  );
}

/* ---------------- Partner Ledger ---------------- */

export function PartnerLedgerTable({ report }: { report: PartnerLedgerReport }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of report.partners) init[p.partner_key] = true;
    return init;
  });

  const toggle = (key: string) =>
    setOpen((s) => ({ ...s, [key]: !s[key] }));

  const empty = useMemo(() => !report.partners.length, [report.partners.length]);

  if (empty) {
    return (
      <p
        className="text-sm text-slate-500 px-4 py-8 text-center"
        data-testid="partner-ledger-report"
        data-receivable="0"
        data-payable="0"
      >
        No partner ledger activity for this period on receivable/payable
        accounts.
      </p>
    );
  }

  const rec = report.partners.reduce(
    (s, p) => s + (p.receivable_outstanding || 0),
    0
  );
  const pay = report.partners.reduce(
    (s, p) => s + (p.payable_outstanding || 0),
    0
  );

  return (
    <div
      className="overflow-x-auto"
      data-testid="partner-ledger-report"
      data-receivable={String(rec)}
      data-payable={String(pay)}
    >
      <table className="w-full min-w-[1000px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="text-left font-medium py-2 px-3">Partner / Ref</th>
            <th className="text-left font-medium py-2 px-3">Journal</th>
            <th className="text-left font-medium py-2 px-3">Account</th>
            <th className="text-left font-medium py-2 px-3">Invoice Date</th>
            <th className="text-left font-medium py-2 px-3">Due Date</th>
            <th className="text-left font-medium py-2 px-3">Matching</th>
            <th className="text-right font-medium py-2 px-3">Debit</th>
            <th className="text-right font-medium py-2 px-3">Credit</th>
            <th className="text-right font-medium py-2 px-3">Balance</th>
          </tr>
        </thead>
        <tbody>
          {report.partners.map((p) => {
            const isOpen = !!open[p.partner_key];
            return (
              <FragmentGroup key={p.partner_key}>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <td className="py-2.5 px-3" colSpan={6}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 font-semibold text-slate-800"
                      onClick={() => toggle(p.partner_key)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      {p.partner_name}
                      <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                        Partner
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                        Journal Items
                      </span>
                    </button>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold bg-white/60">
                    {formatRs(p.period_debit, { dimZero: true })}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold">
                    {formatRs(p.period_credit, { dimZero: true })}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold bg-white/60">
                    {formatRs(p.balance, { dimZero: true, signedRed: true })}
                  </td>
                </tr>
                {isOpen
                  ? p.lines.map((l) => (
                      <tr
                        key={l.line_id}
                        className="border-b border-slate-100 text-slate-700"
                      >
                        <td className="py-1.5 pl-10 pr-3" style={{ color: TEAL }}>
                          {l.reference || "—"}
                        </td>
                        <td className="py-1.5 px-3">{l.journal_code || "—"}</td>
                        <td className="py-1.5 px-3">{l.account_code}</td>
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          {formatDate(l.entry_date)}
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          {l.due_date ? formatDate(l.due_date) : "—"}
                        </td>
                        <td className="py-1.5 px-3 text-slate-400">
                          {l.matching || ""}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          {formatRs(l.debit, { dimZero: true })}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          {formatRs(l.credit, { dimZero: true })}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          {formatRs(l.balance, {
                            dimZero: true,
                            signedRed: true,
                          })}
                        </td>
                      </tr>
                    ))
                  : null}
              </FragmentGroup>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
