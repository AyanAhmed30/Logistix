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
  getVendorStatement,
  type VendorBalanceSummary,
  type VendorLedgerEntry,
} from "@/app/actions/accounting/vendor-accounting";
import { formatMoney } from "@/lib/sales-quotation-form";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = { contactId: string };

export function AccountingVendorStatementView({ contactId }: Props) {
  const router = useRouter();
  const [balance, setBalance] = useState<VendorBalanceSummary | null>(null);
  const [entries, setEntries] = useState<VendorLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getVendorStatement(contactId).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        setBalance(res.balance ?? null);
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
        <AccountingTableSkeleton rows={8} cols={5} />
      ) : (
        <>
          {balance ? (
            <div className="bg-white border border-slate-200 rounded-sm p-4 grid sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] uppercase text-secondary-muted">Vendor</p>
                <p className="font-semibold">{balance.vendor_name}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-secondary-muted">
                  Outstanding
                </p>
                <p className="font-semibold text-[#017e84]">
                  {formatMoney(balance.outstanding_balance)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-secondary-muted">
                  Current Balance
                </p>
                <p className="font-semibold">
                  {formatMoney(balance.current_balance)}
                </p>
              </div>
            </div>
          ) : null}
          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.date}</TableCell>
                    <TableCell>{e.reference}</TableCell>
                    <TableCell className="text-right">
                      {e.debit ? formatMoney(e.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {e.credit ? formatMoney(e.credit) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(e.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
