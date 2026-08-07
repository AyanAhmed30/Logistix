"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createAccountingLoan,
  getAccountingLoans,
  type AccountingLoanListItem,
} from "@/app/actions/accounting/loans";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "partially_paid":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "fully_paid":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "closed":
      return "bg-slate-100 text-slate-700 border-slate-300";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-amber-50 text-amber-800 border-amber-200";
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function typeLabel(t: string) {
  return t.replace(/_/g, " ");
}

export function AccountingLoansView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [loans, setLoans] = useState<AccountingLoanListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingLoans({
        search: debouncedSearch.trim() || undefined,
        status: activeFilterId || "all",
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLoans([]);
        setTotal(0);
      } else {
        setLoans(res.loans ?? []);
        setTotal(res.total ?? 0);
        if ("migrationRequired" in res && res.migrationRequired) {
          toast.info("Run create_accounting_loans_module.sql to enable Loans.");
        }
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, activeFilterId]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilterId, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  function handleNew() {
    if (isAdminContext) {
      toast.info("Select a specific organization to create a loan.");
      return;
    }
    startTransition(async () => {
      const res = await createAccountingLoan();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.loanId) {
        router.push(`/accounting/loans/${res.loanId}`);
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary-muted">
          Loans with automatic amortization and journal entries.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-secondary-muted">
            {total} loan{total === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={handleNew}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={11} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {loans.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No loans yet.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={handleNew}
              >
                Create Loan
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Lender / Bank</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Rate %</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Installment</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Organization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.map((l) => (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() => router.push(`/accounting/loans/${l.id}`)}
                    >
                      <TableCell className="font-medium text-[#017e84] whitespace-nowrap">
                        {l.loan_number}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate font-medium">
                        {l.name}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm">
                        {l.lender_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm capitalize whitespace-nowrap">
                        {typeLabel(l.loan_type)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatMoney(l.principal_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.interest_rate}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">
                        {formatMoney(l.remaining_balance)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatMoney(l.monthly_installment)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {l.start_date}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {l.next_installment_date || "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold capitalize",
                            statusBadge(l.status)
                          )}
                        >
                          {statusLabel(l.status)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-sm text-secondary-muted">
                        {l.organization_name || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
