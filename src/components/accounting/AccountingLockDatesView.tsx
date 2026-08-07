"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  Calendar,
  Lock,
  Plus,
  Shield,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  closeAccountingFiscalYear,
  createAccountingFiscalYear,
  generateOpeningBalances,
  getAccountingLockDatesOverview,
  removeAccountingJournalLock,
  reopenAccountingFiscalYear,
  updateAccountingLockSettings,
  upsertAccountingJournalLock,
  type AccountingLockDatesOverview,
} from "@/app/actions/accounting/lock-dates";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const btnPrimary =
  "h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white";
const btnSecondary = "h-8 rounded-sm border-slate-200";
const fieldClass =
  "h-8 rounded-sm border border-slate-200 bg-white px-2 text-sm";

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/60">
        <h3 className="text-sm font-semibold text-primary-dark">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function AccountingLockDatesView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AccountingLockDatesOverview | null>(null);
  const [isPending, startTransition] = useTransition();

  const [hardLock, setHardLock] = useState("");
  const [softLock, setSoftLock] = useState("");
  const [saleLock, setSaleLock] = useState("");
  const [purchaseLock, setPurchaseLock] = useState("");
  const [taxLock, setTaxLock] = useState("");

  const [journalId, setJournalId] = useState("");
  const [journalLockDate, setJournalLockDate] = useState("");

  const [fyName, setFyName] = useState("");
  const [fyFrom, setFyFrom] = useState("");
  const [fyTo, setFyTo] = useState("");
  const [retainedId, setRetainedId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingLockDatesOverview();
      if ("error" in res && res.error) {
        toast.error(res.error);
        setOverview(null);
      } else if (res.overview) {
        setOverview(res.overview);
        const s = res.overview.settings;
        setHardLock(s?.hard_lock_date || "");
        setSoftLock(s?.soft_lock_date || "");
        setSaleLock(s?.sale_lock_date || "");
        setPurchaseLock(s?.purchase_lock_date || "");
        setTaxLock(s?.tax_lock_date || "");
        if ("migrationRequired" in res && res.migrationRequired) {
          toast.info(
            "Run create_accounting_lock_dates_module.sql (and enhance_accounting_lock_dates_foundation.sql)."
          );
        }
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  function applyOverview(next: { overview?: AccountingLockDatesOverview } | Record<string, unknown>) {
    if ("overview" in next && next.overview) {
      setOverview(next.overview as AccountingLockDatesOverview);
      const s = (next.overview as AccountingLockDatesOverview).settings;
      setHardLock(s?.hard_lock_date || "");
      setSoftLock(s?.soft_lock_date || "");
      setSaleLock(s?.sale_lock_date || "");
      setPurchaseLock(s?.purchase_lock_date || "");
      setTaxLock(s?.tax_lock_date || "");
    }
  }

  function handleSaveLocks() {
    if (isAdminContext) {
      toast.info("Select a specific organization to manage lock dates.");
      return;
    }
    startTransition(async () => {
      const res = await updateAccountingLockSettings({
        hard_lock_date: hardLock || null,
        soft_lock_date: softLock || null,
        sale_lock_date: saleLock || null,
        purchase_lock_date: purchaseLock || null,
        tax_lock_date: taxLock || null,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Lock dates saved");
      applyOverview(res);
    });
  }

  function handleAddJournalLock() {
    startTransition(async () => {
      const res = await upsertAccountingJournalLock({
        journalId,
        lockDate: journalLockDate,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Journal lock saved");
      setJournalId("");
      setJournalLockDate("");
      applyOverview(res);
    });
  }

  function handleCreateFy() {
    startTransition(async () => {
      const res = await createAccountingFiscalYear({
        name: fyName,
        dateFrom: fyFrom,
        dateTo: fyTo,
        retainedEarningsAccountId: retainedId || null,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Fiscal year created");
      setFyName("");
      setFyFrom("");
      setFyTo("");
      applyOverview(res);
    });
  }

  if (loading && !overview) {
    return <AccountingTableSkeleton rows={8} cols={4} />;
  }

  const equityAccounts = (overview?.accounts || []).filter((a) => a.type === "equity");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary-dark">Lock Dates</h2>
          <p className="text-sm text-secondary-muted mt-1 max-w-2xl">
            Odoo-style fiscal, sales, purchase, tax, and journal locks. Year-end closing
            posts a closing journal entry and sets the hard lock date.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-secondary-muted">
          <Shield className="h-3.5 w-3.5 text-[#017e84]" />
          Accountant can set locks · Admin closes fiscal years
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          {
            label: "Fiscal Lock",
            value: overview?.settings?.hard_lock_date || "—",
            icon: Lock,
          },
          {
            label: "Sales Lock",
            value: overview?.settings?.sale_lock_date || "—",
            icon: Calendar,
          },
          {
            label: "Journal Locks",
            value: String(overview?.journalLocks.length || 0),
            icon: BookOpen,
          },
          {
            label: "Tax Periods Locked",
            value: String(overview?.taxPeriodsLocked || 0),
            icon: Lock,
          },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="rounded-sm border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-secondary-muted">
                  {c.label}
                </p>
                <Icon className="h-3.5 w-3.5 text-[#017e84]" />
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-primary-dark">
                {c.value}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section
          title="Company Lock Dates"
          action={
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending}
              onClick={handleSaveLocks}
            >
              Save
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
              <label className="text-sm text-secondary-muted">Fiscal Lock</label>
              <Input
                type="date"
                value={hardLock}
                onChange={(e) => setHardLock(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
              <label className="text-sm text-secondary-muted">Soft Lock</label>
              <Input
                type="date"
                value={softLock}
                onChange={(e) => setSoftLock(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
              <label className="text-sm text-secondary-muted">Sales Lock</label>
              <Input
                type="date"
                value={saleLock}
                onChange={(e) => setSaleLock(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
              <label className="text-sm text-secondary-muted">Purchase Lock</label>
              <Input
                type="date"
                value={purchaseLock}
                onChange={(e) => setPurchaseLock(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
              <label className="text-sm text-secondary-muted">Tax Lock</label>
              <Input
                type="date"
                value={taxLock}
                onChange={(e) => setTaxLock(e.target.value)}
                className={fieldClass}
              />
            </div>
            <p className="text-xs text-secondary-muted pt-1">
              Soft lock blocks non-administrators (Advisors may still post). Fiscal
              lock blocks everyone. Documents on or before a lock date cannot be
              posted, edited, cancelled, or reset.
            </p>
          </div>
        </Section>

        <Section title="Journal Locks">
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={journalId}
              onChange={(e) => setJournalId(e.target.value)}
              className={cn(fieldClass, "min-w-[160px]")}
            >
              <option value="">Select journal</option>
              {(overview?.journals || []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code ? `${j.code} — ${j.name}` : j.name}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={journalLockDate}
              onChange={(e) => setJournalLockDate(e.target.value)}
              className={cn(fieldClass, "w-auto")}
            />
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || !journalId || !journalLockDate}
              onClick={handleAddJournalLock}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
          {(overview?.journalLocks || []).length === 0 ? (
            <p className="text-sm text-secondary-muted">No journal-specific locks.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Journal</TableHead>
                  <TableHead>Lock Date</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview!.journalLocks.map((jl) => (
                  <TableRow key={jl.id}>
                    <TableCell className="text-sm">
                      {jl.journal_code
                        ? `${jl.journal_code} — ${jl.journal_name}`
                        : jl.journal_name || jl.journal_id}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{jl.lock_date}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-600"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await removeAccountingJournalLock(jl.id);
                            if ("error" in res && res.error) {
                              toast.error(res.error);
                              return;
                            }
                            toast.success("Journal lock removed");
                            applyOverview(res);
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>

      <Section
        title="Fiscal Years & Year-End Closing"
        action={
          <Button
            size="sm"
            variant="outline"
            className={btnSecondary}
            onClick={() => router.push("/accounting/journal-entries")}
          >
            <BookOpen className="h-3.5 w-3.5 mr-1" />
            Journal Entries
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2 mb-4 items-end">
          <div>
            <p className="text-[11px] text-secondary-muted mb-1">Name</p>
            <Input
              value={fyName}
              onChange={(e) => setFyName(e.target.value)}
              placeholder="FY 2026"
              className={cn(fieldClass, "w-36")}
            />
          </div>
          <div>
            <p className="text-[11px] text-secondary-muted mb-1">From</p>
            <Input
              type="date"
              value={fyFrom}
              onChange={(e) => setFyFrom(e.target.value)}
              className={cn(fieldClass, "w-auto")}
            />
          </div>
          <div>
            <p className="text-[11px] text-secondary-muted mb-1">To</p>
            <Input
              type="date"
              value={fyTo}
              onChange={(e) => setFyTo(e.target.value)}
              className={cn(fieldClass, "w-auto")}
            />
          </div>
          <div>
            <p className="text-[11px] text-secondary-muted mb-1">Retained Earnings</p>
            <select
              value={retainedId}
              onChange={(e) => setRetainedId(e.target.value)}
              className={cn(fieldClass, "min-w-[180px]")}
            >
              <option value="">Auto-detect</option>
              {equityAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            className={btnPrimary}
            disabled={isPending || !fyFrom || !fyTo}
            onClick={handleCreateFy}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Create Year
          </Button>
        </div>

        {(overview?.fiscalYears || []).length === 0 ? (
          <p className="text-sm text-secondary-muted">
            No fiscal years yet. Create one to enable year-end closing.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Name</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Closed By</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview!.fiscalYears.map((fy) => (
                <TableRow key={fy.id}>
                  <TableCell className="font-medium text-sm">{fy.name}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {fy.date_from} → {fy.date_to}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold capitalize",
                        fy.status === "closed"
                          ? "bg-slate-100 text-slate-700 border-slate-300"
                          : fy.status === "closing"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                      )}
                    >
                      {fy.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-secondary-muted">
                    {fy.closed_by || "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {fy.closing_journal_entry_id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[#017e84]"
                        onClick={() =>
                          router.push(
                            `/accounting/journal-entries/${fy.closing_journal_entry_id}`
                          )
                        }
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {fy.status === "open" ? (
                      <Button
                        size="sm"
                        className={cn(btnPrimary, "h-7 text-xs")}
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await closeAccountingFiscalYear(fy.id, {
                              retainedEarningsAccountId: retainedId || null,
                            });
                            if ("error" in res && res.error) {
                              toast.error(res.error);
                              return;
                            }
                            toast.success("Fiscal year closed");
                            applyOverview(res);
                          })
                        }
                      >
                        <Lock className="h-3 w-3 mr-1" />
                        Close Year
                      </Button>
                    ) : null}
                    {fy.status === "closed" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(btnSecondary, "h-7 text-xs")}
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              const nextOpen = (overview?.fiscalYears || []).find(
                                (x) =>
                                  x.status === "open" &&
                                  x.date_from > fy.date_to &&
                                  !x.opening_balance_journal_entry_id
                              );
                              if (!nextOpen) {
                                toast.info(
                                  "Create the next open fiscal year first, then generate opening balances."
                                );
                                return;
                              }
                              const res = await generateOpeningBalances({
                                closedFiscalYearId: fy.id,
                                nextFiscalYearId: nextOpen.id,
                              });
                              if ("error" in res && res.error) {
                                toast.error(res.error);
                                return;
                              }
                              toast.success("Opening balances generated");
                              applyOverview(res);
                              if (
                                "journalEntryId" in res &&
                                res.journalEntryId
                              ) {
                                router.push(
                                  `/accounting/journal-entries/${res.journalEntryId}`
                                );
                              }
                            })
                          }
                        >
                          Opening Balances
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(btnSecondary, "h-7 text-xs")}
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await reopenAccountingFiscalYear(fy.id);
                              if ("error" in res && res.error) {
                                toast.error(res.error);
                                return;
                              }
                              toast.success("Fiscal year re-opened");
                              applyOverview(res);
                            })
                          }
                        >
                          <Unlock className="h-3 w-3 mr-1" />
                          Re-open
                        </Button>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Activity">
        {(overview?.logs || []).length === 0 ? (
          <p className="text-sm text-secondary-muted">No lock activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {overview!.logs.slice(0, 12).map((l) => (
              <li
                key={l.id}
                className="flex items-start justify-between gap-3 text-sm border-b border-slate-100 pb-2"
              >
                <span className="capitalize text-primary-dark">
                  <span className="font-medium">{l.performed_by || "System"}</span>
                  {" — "}
                  {l.action.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-secondary-muted whitespace-nowrap">
                  {l.performed_at ? new Date(l.performed_at).toLocaleString() : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
