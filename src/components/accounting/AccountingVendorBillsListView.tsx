"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
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
  getAccountingVendorBills,
  type AccountingBillListItem,
} from "@/app/actions/accounting/bills";
import { formatMoney } from "@/lib/sales-quotation-form";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = { contactId: string };

export function AccountingVendorBillsListView({ contactId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter") || "all";
  const [bills, setBills] = useState<AccountingBillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingVendorBills({
        contactId,
        pageSize: 100,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setBills([]);
      } else {
        let rows = res.bills ?? [];
        if (filter === "outstanding") {
          rows = rows.filter(
            (b) =>
              b.status !== "cancelled" &&
              b.status !== "paid" &&
              (b.amount_residual || 0) > 0.004
          );
        } else if (filter === "paid") {
          rows = rows.filter((b) => b.status === "paid" || b.payment_state === "paid");
        } else if (filter === "overdue") {
          rows = rows.filter((b) => b.payment_state === "overdue");
        }
        setBills(rows);
      }
      setLoading(false);
    });
  }, [contactId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-sm"
        onClick={() => router.push(`/accounting/vendors/${contactId}`)}
      >
        Back to Vendor
      </Button>
      {loading || isPending ? (
        <AccountingTableSkeleton rows={6} cols={5} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          {bills.length === 0 ? (
            <div className="p-6 text-sm text-secondary-muted">No bills.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/accounting/bills/${b.id}`)}
                  >
                    <TableCell className="text-[#017e84] font-medium">
                      {b.bill_number}
                    </TableCell>
                    <TableCell>{b.bill_date}</TableCell>
                    <TableCell className="capitalize text-xs">{b.status}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(b.total_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(b.amount_residual)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
