"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  getAccountingCustomerPayments,
  type AccountingCustomerPaymentListItem,
} from "@/app/actions/accounting/payments";
import { paymentMethodLabel } from "@/lib/accounting-payments";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

const PAGE_SIZE = 40;

export function AccountingPaymentsView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [payments, setPayments] = useState<AccountingCustomerPaymentListItem[]>(
    []
  );
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingCustomerPayments({
        search: debouncedSearch.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
        sortBy: "payment_date",
        sortDir: "desc",
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
  }, [page, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary-muted">
          Registered customer payments linked to invoices.
        </p>
        <span className="text-sm text-secondary-muted">
          {total} payment{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={8} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          {payments.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted">
              No customer payments yet. Register payments from a posted invoice.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Payment Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Related Invoice</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Organization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() =>
                        router.push(`/accounting/payments/${p.id}`)
                      }
                    >
                      <TableCell className="font-medium text-[#017e84]">
                        {p.payment_number}
                      </TableCell>
                      <TableCell>{p.customer_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.customer_lead_id || "—"}
                      </TableCell>
                      <TableCell>
                        {p.invoice_number ? (
                          <button
                            type="button"
                            className="text-[#017e84] hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/accounting/invoices/${p.invoice_id}`
                              );
                            }}
                          >
                            {p.invoice_number}
                          </button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{p.payment_date || "—"}</TableCell>
                      <TableCell>
                        {paymentMethodLabel(p.payment_method)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(p.amount)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 capitalize">
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-secondary-muted text-sm">
                        {p.organization_name || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
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
