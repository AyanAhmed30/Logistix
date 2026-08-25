"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAccountingInvoicedNotDeliveredForReview,
  type ReviewInvoicedNotDeliveredLine,
} from "@/app/actions/accounting/review";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  ReviewListToolbar,
  ReviewPagination,
  formatReviewDate,
  formatReviewMoney,
} from "@/components/accounting/AccountingReviewOdooPanels";

const PAGE_SIZE = 40;

export function AccountingInvoicedNotDeliveredReviewView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 280);
  const [lines, setLines] = useState<ReviewInvoicedNotDeliveredLine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    if (isAdminContext) {
      setLines([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingInvoicedNotDeliveredForReview({
        search: debouncedSearch.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLines([]);
        setTotal(0);
      } else {
        setLines(res.lines ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, isAdminContext]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, switchVersion]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="-mx-1 sm:-mx-2 flex flex-col min-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <ReviewListToolbar
        title="Invoiced Not Delivered"
        search={search}
        onSearchChange={setSearch}
        pagination={
          <ReviewPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        }
        onPrint={() => window.print()}
      />

      {loading ? (
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={9} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[960px] text-sm border-collapse">
            <thead className="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200">
              <tr className="text-xs text-slate-500 font-medium">
                <th className="py-2 px-3 text-left">Invoice</th>
                <th className="py-2 px-3 text-left">Order</th>
                <th className="py-2 px-3 text-left">Customer</th>
                <th className="py-2 px-3 text-left">Product</th>
                <th className="py-2 px-3 text-right">Invoiced</th>
                <th className="py-2 px-3 text-right">Delivered</th>
                <th className="py-2 px-3 text-right">Not Delivered</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3 text-left">Date</th>
                <th className="py-2 px-3 text-right">Journal</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-16 text-center text-sm text-slate-400"
                  >
                    No posted invoices with undelivered quantity. Rows come from
                    posted invoice lines linked to sales order lines.
                  </td>
                </tr>
              ) : (
                lines.map((row) => (
                  <tr
                    key={row.line_id}
                    className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer"
                    onClick={() =>
                      router.push(`/accounting/invoices/${row.invoice_id}`)
                    }
                  >
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                      {row.invoice_number}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {row.order_reference || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-[140px] truncate">
                      {row.customer_name}
                    </td>
                    <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">
                      {row.description}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.qty_invoiced}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.qty_delivered}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {row.qty_not_delivered}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatReviewMoney(row.amount)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {formatReviewDate(row.invoice_date)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.journal_entry_id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[#017e84]"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/accounting/journal-entries/${row.journal_entry_id}`
                            );
                          }}
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
