"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  getVendorLedger,
  type VendorLedgerEntry,
} from "@/app/actions/accounting/vendor-accounting";
import { formatMoney } from "@/lib/sales-quotation-form";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = { contactId: string };

export function AccountingVendorLedgerView({ contactId }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<VendorLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getVendorLedger(contactId).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        toast.error(res.error);
        setEntries([]);
      } else {
        setEntries(res.entries ?? []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

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

      {loading ? (
        <AccountingTableSkeleton rows={8} cols={6} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          {entries.length === 0 ? (
            <div className="p-6 text-sm text-secondary-muted">No ledger entries.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      if (e.type === "bill")
                        router.push(`/accounting/bills/${e.document_id}`);
                      else if (e.type === "payment")
                        router.push(`/accounting/vendor-payments/${e.document_id}`);
                      else if (e.type === "refund")
                        router.push(`/accounting/vendor-refunds/${e.document_id}`);
                    }}
                  >
                    <TableCell>{e.date}</TableCell>
                    <TableCell className="text-[#017e84]">{e.reference}</TableCell>
                    <TableCell className="capitalize text-xs">{e.type}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.debit ? formatMoney(e.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.credit ? formatMoney(e.credit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMoney(e.balance)}
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
