"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  getCustomerLedger,
  type CustomerLedgerEntry,
} from "@/app/actions/accounting/customer-accounting";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = { contactId: string };

export function AccountingCustomerLedgerView({ contactId }: Props) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [closing, setClosing] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const pageSize = 40;

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getCustomerLedger(contactId, {
        search: search.trim() || undefined,
        page,
        pageSize,
        sortDir: "desc",
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setEntries([]);
      } else {
        setEntries(res.entries ?? []);
        setTotal(res.total ?? 0);
        setClosing(res.closing_balance ?? 0);
      }
      setLoading(false);
    });
  }, [contactId, page, search]);

  useEffect(() => {
    setPage(1);
  }, [search, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm mb-2"
            onClick={() => router.push(`/accounting/customers/${contactId}`)}
          >
            Back to Customer
          </Button>
          <h2 className="text-lg font-semibold text-primary-dark">Customer Ledger</h2>
          <p className="text-sm text-secondary-muted" data-testid="ledger-closing-balance">
            Closing balance: {formatMoney(closing)}
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ledger…"
          className="h-8 w-56 rounded-sm"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        {loading || isPending ? (
          <div className="p-4 text-sm text-secondary-muted">Loading ledger…</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-sm text-secondary-muted">No ledger entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Payment Ref</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.date || "—"}</TableCell>
                    <TableCell>
                      {e.type === "invoice" ? (
                        <Link
                          href={`/accounting/invoices/${e.document_id}`}
                          className="text-[#017e84] hover:underline"
                        >
                          {e.reference}
                        </Link>
                      ) : e.type === "credit_note" ? (
                        <Link
                          href={`/accounting/credit-notes/${e.document_id}`}
                          className="text-[#017e84] hover:underline"
                        >
                          {e.reference}
                        </Link>
                      ) : (
                        e.reference
                      )}
                    </TableCell>
                    <TableCell>{e.invoice_number || "—"}</TableCell>
                    <TableCell>{e.payment_reference || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.debit ? formatMoney(e.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.credit ? formatMoney(e.credit) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(e.balance)}
                    </TableCell>
                    <TableCell className="capitalize text-xs">{e.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {total > pageSize ? (
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
