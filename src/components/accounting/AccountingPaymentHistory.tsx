"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  getAccountingInvoicePayments,
  type AccountingInvoicePayment,
} from "@/app/actions/accounting/payments";
import { paymentMethodLabel } from "@/lib/accounting-payments";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = {
  invoiceId: string;
  refreshKey?: number;
};

export function AccountingPaymentHistory({ invoiceId, refreshKey = 0 }: Props) {
  const [payments, setPayments] = useState<AccountingInvoicePayment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 280);
  const [sortBy, setSortBy] = useState<
    "payment_date" | "amount" | "payment_method" | "created_at"
  >("payment_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const pageSize = 8;

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingInvoicePayments(invoiceId, {
        search: debouncedSearch.trim() || undefined,
        sortBy,
        sortDir,
        page,
        pageSize,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setPayments([]);
        setTotal(0);
      } else {
        setPayments(res.payments ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [invoiceId, page, debouncedSearch, sortBy, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, refreshKey]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "amount" || col === "payment_date" ? "desc" : "asc");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="border border-slate-200 rounded-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <p className="text-sm font-semibold text-primary-dark">Payment History</p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search payments…"
          className="h-7 w-48 text-xs rounded-sm"
        />
      </div>

      {loading || isPending ? (
        <div className="p-3">
          <AccountingTableSkeleton rows={4} cols={5} />
        </div>
      ) : payments.length === 0 ? (
        <div className="p-4 text-sm text-secondary-muted">
          No payments registered yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-white">
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("payment_date")}
                >
                  Payment Date
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => toggleSort("amount")}
                >
                  Amount
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("payment_method")}
                >
                  Method
                </TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Paid By</TableHead>
                <TableHead>Organization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(p.amount)}
                  </TableCell>
                  <TableCell>{paymentMethodLabel(p.payment_method)}</TableCell>
                  <TableCell className="text-secondary-muted">
                    {p.reference || "—"}
                  </TableCell>
                  <TableCell>{p.paid_by || "—"}</TableCell>
                  <TableCell className="text-secondary-muted">
                    {p.organization_name || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-slate-200">
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-secondary-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
